import type { Transport, Unsubscribe } from '../transport/types'
import { isClientMessage, type HostMessage } from './protocol'
import { addNote, joinMember, resetPresence, setMemberOnline } from './roomState'
import type { RoomState } from './types'

export interface HostRoomDeps {
  newId?: () => string
  now?: () => number
}

/**
 * 房主端的房間控制器：房主是唯一的 source of truth。
 * 收到成員的意圖後驗證並更新 state，再把完整 snapshot 廣播給所有已報到的成員。
 */
export class HostRoom {
  /** peerId → 成員 id；成員送出 hello 之後才會登記 */
  private readonly peerToMember = new Map<string, string>()
  private readonly unsubscribes: Unsubscribe[] = []
  private readonly newId: () => string
  private readonly now: () => number
  private state: RoomState

  constructor(
    private readonly transport: Transport<HostMessage>,
    initialState: RoomState,
    private readonly onChange: (state: RoomState) => void,
    deps: HostRoomDeps = {},
  ) {
    this.state = resetPresence(initialState)
    this.newId = deps.newId ?? (() => crypto.randomUUID())
    this.now = deps.now ?? Date.now
    this.unsubscribes.push(
      transport.onMessage((peerId, data) => this.handleMessage(peerId, data)),
      transport.onPeerLeave((peerId) => this.handlePeerLeave(peerId)),
    )
    onChange(this.state)
  }

  get current(): RoomState {
    return this.state
  }

  /** 已報到的連線與成員的對應，用來顯示各成員的連線類型 */
  memberPeers(): Array<[peerId: string, memberId: string]> {
    return [...this.peerToMember.entries()]
  }

  addNote(text: string): void {
    this.update(addNote(this.state, this.state.hostId, text, this.newId(), this.now()))
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  private handleMessage(peerId: string, data: unknown): void {
    if (!isClientMessage(data)) {
      this.transport.send(peerId, { type: 'error', reason: 'invalid-message' })
      return
    }
    switch (data.type) {
      case 'hello': {
        // 同一個瀏覽器的另一個分頁會共用 clientId，不能冒用房主身分
        if (data.clientId === this.state.hostId) {
          this.transport.send(peerId, { type: 'error', reason: 'same-device-as-host' })
          return
        }
        const next = joinMember(this.state, data.clientId, data.nickname)
        if (next === this.state) {
          this.transport.send(peerId, { type: 'error', reason: 'invalid-message' })
          return
        }
        this.peerToMember.set(peerId, data.clientId)
        this.update(next)
        break
      }
      case 'addNote': {
        const memberId = this.peerToMember.get(peerId)
        if (!memberId) return
        this.update(addNote(this.state, memberId, data.text, this.newId(), this.now()))
        break
      }
    }
  }

  private handlePeerLeave(peerId: string): void {
    const memberId = this.peerToMember.get(peerId)
    if (!memberId) return
    this.peerToMember.delete(peerId)
    // 同一位成員可能已經用新的連線重新報到，這時不能標為離線
    const stillConnected = [...this.peerToMember.values()].includes(memberId)
    if (!stillConnected) this.update(setMemberOnline(this.state, memberId, false))
  }

  private update(next: RoomState): void {
    if (next === this.state) return
    this.state = next
    this.onChange(next)
    const message: HostMessage = { type: 'state', state: next }
    for (const peerId of this.peerToMember.keys()) this.transport.send(peerId, message)
  }
}
