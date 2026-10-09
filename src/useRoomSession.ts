import { computed, ref, shallowRef } from 'vue'
import { ClientRoom, type Membership } from './room/clientRoom'
import { HostRoom } from './room/hostRoom'
import type { ClientMessage, HostErrorReason, HostMessage, Intent } from './room/protocol'
import { generateRoomCode, normalizeRoomCode } from './room/roomCode'
import { createRoom as createRoomState } from './room/roomState'
import type { RoomState } from './room/types'
import {
  clearSession,
  getClientId,
  loadHostState,
  loadSession,
  removeHostState,
  saveHostState,
  saveNickname,
  saveSession,
} from './storage'
import { PeerClientTransport } from './transport/peerClientTransport'
import { PeerHostTransport } from './transport/peerHostTransport'
import type { ConnectionKind, Transport, TransportStatus } from './transport/types'
import { InvitePreview, type InviteInfo } from './invitePreview'
import { acquireTabLock } from './tabLock'

export type Role = 'host' | 'member'

/** 顯示在房間畫面上的提示：房主回覆的錯誤，或本機的狀況 */
export type RoomNotice = HostErrorReason | 'opened-in-other-tab'

const KIND_POLL_INTERVAL_MS = 3000
const ROOM_QUERY_KEY = 'room'

/** 串接傳輸層、房間控制器與本機保存，提供給畫面使用的狀態與操作 */
export function useRoomSession() {
  const clientId = getClientId()
  const role = ref<Role | null>(null)
  const roomCode = ref<string | null>(null)
  const state = shallowRef<RoomState | null>(null)
  const status = shallowRef<TransportStatus>({ kind: 'closed' })
  const notice = ref<RoomNotice | null>(null)
  /** 房主固定為 member；成員端會依房主的回覆變化 */
  const membership = ref<Membership>('joining')
  /** 成員 id → 連線類型。房主看得到每位成員；成員只看得到自己與房主之間的連線 */
  const connectionKinds = ref<Record<string, ConnectionKind>>({})
  /** 受邀畫面向房主詢問到的房間資訊 */
  const inviteInfo = shallowRef<InviteInfo | null>(null)

  let transport: Transport<HostMessage> | Transport<ClientMessage> | null = null
  let hostRoom: HostRoom | null = null
  let clientRoom: ClientRoom | null = null
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let releaseTabLock: (() => void) | null = null
  let preview: InvitePreview | null = null
  /** 每次開始或結束一個房間都會遞增，用來放棄已經過時的非同步啟動流程 */
  let generation = 0

  const joinUrl = computed(() => (roomCode.value ? buildJoinUrl(roomCode.value) : ''))

  function createRoom(nickname: string, roomName = ''): void {
    const code = generateRoomCode()
    saveNickname(nickname)
    saveSession({ code, role: 'host', nickname })
    startHost(code, createRoomState(code, clientId, nickname, Date.now(), roomName), false)
  }

  function joinRoom(code: string, nickname: string): void {
    saveNickname(nickname)
    saveSession({ code, role: 'member', nickname })
    // 受邀畫面已連上同一個房間時，沿用那條連線（接手後不能再關閉它）
    const taken = preview?.code === code ? preview.takeOver() : null
    if (taken) {
      preview = null
      inviteInfo.value = null
    } else {
      stopPreview()
    }
    startMember(code, nickname, taken)
  }

  /** 進入受邀畫面時呼叫：先連上房主取得房間名稱 */
  function startPreview(code: string): void {
    stopPreview()
    preview = new InvitePreview(code, (info) => (inviteInfo.value = info))
  }

  function stopPreview(): void {
    preview?.close()
    preview = null
    inviteInfo.value = null
  }

  /** 重新整理頁面後，依本機保存的 session 自動回到原本的房間；回傳是否有恢復 */
  function resume(): boolean {
    const session = loadSession()
    const urlCode = readRoomFromUrl()
    if (!session || (urlCode && urlCode !== session.code)) return false
    if (session.role === 'host') {
      const saved = loadHostState(session.code)
      if (!saved || saved.hostId !== clientId) return false
      startHost(session.code, saved, true)
    } else {
      startMember(session.code, session.nickname)
    }
    return true
  }

  function leave(): void {
    if (role.value === 'host' && roomCode.value) removeHostState(roomCode.value)
    teardown()
    clearSession()
    writeRoomToUrl(null)
  }

  function dispatch(intent: Intent): void {
    if (hostRoom) hostRoom.dispatch(intent)
    else clientRoom?.dispatch(intent)
  }

  function requestRejoin(): void {
    clientRoom?.requestRejoin()
  }

  async function startHost(code: string, initial: RoomState, isRestore: boolean): Promise<void> {
    if (!(await enterRoom('host', code))) return
    const t = new PeerHostTransport<HostMessage>({ roomCode: code, retryWhenIdTaken: isRestore })
    transport = t
    t.onStatusChange((s) => {
      status.value = s
      // 新房間的房號剛好被別人使用（機率極低），換一個房號重開
      if (s.kind === 'failed' && s.reason === 'room-code-taken' && !isRestore) {
        const nickname = initial.members[0]?.nickname ?? ''
        queueMicrotask(() => createRoom(nickname, initial.name))
      }
    })
    membership.value = 'member'
    hostRoom = new HostRoom(t, initial, (next) => {
      state.value = next
      saveHostState(next)
    })
    t.start()
    startPolling()
  }

  async function startMember(
    code: string,
    nickname: string,
    existing: ReturnType<InvitePreview['takeOver']> = null,
  ): Promise<void> {
    if (!(await enterRoom('member', code))) {
      existing?.transport.close()
      return
    }
    const t = existing?.transport ?? new PeerClientTransport<ClientMessage>(code)
    transport = t
    t.onStatusChange((s) => (status.value = s))
    clientRoom = new ClientRoom(t, clientId, nickname, {
      onState: (next) => (state.value = next),
      onMembership: (next) => {
        membership.value = next
        if (next !== 'member') state.value = null
      },
      onError: (reason) => {
        notice.value = reason
        // 這兩種情況重連也不會改善，停止連線
        if (reason === 'same-device-as-host' || reason === 'version-mismatch') t.close()
      },
    }, existing?.hostPeerId ?? null)
    if (!existing) t.start()
    startPolling()
  }

  /** 切換到房間畫面並取得分頁鎖；回傳 false 表示不應繼續建立連線 */
  async function enterRoom(nextRole: Role, code: string): Promise<boolean> {
    teardown()
    const current = ++generation
    role.value = nextRole
    roomCode.value = code
    status.value = { kind: 'connecting' }
    writeRoomToUrl(code)
    const release = await acquireTabLock(`aa-room:${code}`)
    if (current !== generation) {
      release?.()
      return false
    }
    if (!release) {
      notice.value = 'opened-in-other-tab'
      status.value = { kind: 'closed' }
      return false
    }
    releaseTabLock = release
    return true
  }

  function startPolling(): void {
    clearInterval(pollTimer)
    pollTimer = setInterval(refreshConnectionKinds, KIND_POLL_INTERVAL_MS)
  }

  async function refreshConnectionKinds(): Promise<void> {
    const t = transport
    if (!t) return
    const next: Record<string, ConnectionKind> = {}
    if (hostRoom) {
      for (const [peerId, memberId] of hostRoom.memberPeers()) {
        next[memberId] = await t.getConnectionKind(peerId)
      }
    } else if (clientRoom?.connectedPeerId && state.value) {
      next[state.value.hostId] = await t.getConnectionKind(clientRoom.connectedPeerId)
    }
    if (t === transport) connectionKinds.value = next
  }

  function teardown(): void {
    generation++
    clearInterval(pollTimer)
    releaseTabLock?.()
    releaseTabLock = null
    hostRoom?.dispose()
    clientRoom?.dispose()
    transport?.close()
    hostRoom = null
    clientRoom = null
    transport = null
    role.value = null
    roomCode.value = null
    state.value = null
    status.value = { kind: 'closed' }
    notice.value = null
    membership.value = 'joining'
    connectionKinds.value = {}
  }

  return {
    clientId,
    role,
    roomCode,
    state,
    status,
    notice,
    membership,
    connectionKinds,
    inviteInfo,
    joinUrl,
    createRoom,
    joinRoom,
    resume,
    leave,
    dispatch,
    requestRejoin,
    startPreview,
    stopPreview,
  }
}

export function readRoomFromUrl(): string | null {
  const raw = new URLSearchParams(location.search).get(ROOM_QUERY_KEY)
  return raw ? normalizeRoomCode(raw) : null
}

function writeRoomToUrl(code: string | null): void {
  const url = new URL(location.href)
  if (code) url.searchParams.set(ROOM_QUERY_KEY, code)
  else url.searchParams.delete(ROOM_QUERY_KEY)
  history.replaceState(null, '', url)
}

function buildJoinUrl(code: string): string {
  const url = new URL(location.origin + location.pathname)
  url.searchParams.set(ROOM_QUERY_KEY, code)
  return url.toString()
}
