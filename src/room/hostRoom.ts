import type { Transport, Unsubscribe } from '../transport/types'
import { PROTOCOL_VERSION, isClientMessage, type HostMessage, type Intent } from './protocol'
import {
  addJoinRequest,
  applyIntent,
  isRemoved,
  joinMember,
  resetPresence,
  setMemberOnline,
  type IntentContext,
  type IntentResult,
} from './roomState'
import type { RoomState } from './types'

/**
 * 房主端的房間控制器：房主是唯一的 source of truth。
 * 收到成員的操作後驗證並更新 state，再把完整 snapshot 廣播給所有已報到的成員。
 */
export class HostRoom {
  /** peerId → 成員 id；成員送出 hello 之後才會登記 */
  private readonly peerToMember = new Map<string, string>()
  /** peerId → 已被剔除、正在等待房主同意的人 */
  private readonly pendingPeers = new Map<string, string>()
  private readonly unsubscribes: Unsubscribe[] = []
  private readonly ctx: IntentContext
  private state: RoomState

  constructor(
    private readonly transport: Transport<HostMessage>,
    initialState: RoomState,
    private readonly onChange: (state: RoomState) => void,
    ctx: Partial<IntentContext> = {},
  ) {
    this.state = resetPresence(initialState)
    this.ctx = { newId: ctx.newId ?? (() => crypto.randomUUID()), now: ctx.now ?? Date.now }
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

  /** 房主自己的操作 */
  dispatch(intent: Intent): IntentResult {
    return this.apply(this.state.hostId, intent)
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  private handleMessage(peerId: string, data: unknown): void {
    if (!isClientMessage(data)) {
      this.transport.send(peerId, { type: 'error', reason: 'invalid-message' })
      return
    }
    if (data.type === 'intent') {
      const memberId = this.peerToMember.get(peerId)
      if (memberId) this.apply(memberId, data.intent)
      return
    }
    if (data.type === 'peek') {
      if (data.protocolVersion !== PROTOCOL_VERSION) {
        this.transport.send(peerId, { type: 'error', reason: 'version-mismatch' })
        return
      }
      const host = this.state.members.find((m) => m.id === this.state.hostId)
      this.transport.send(peerId, {
        type: 'roomInfo',
        info: { name: this.state.name, hostNickname: host?.nickname ?? '' },
      })
      return
    }

    // hello
    if (data.protocolVersion !== PROTOCOL_VERSION) {
      this.transport.send(peerId, { type: 'error', reason: 'version-mismatch' })
      return
    }
    // 同一個瀏覽器的另一個分頁會共用 clientId，不能冒用房主身分
    if (data.clientId === this.state.hostId) {
      this.transport.send(peerId, { type: 'error', reason: 'same-device-as-host' })
      return
    }
    if (isRemoved(this.state, data.clientId)) {
      this.peerToMember.delete(peerId)
      if (data.requestRejoin) {
        this.pendingPeers.set(peerId, data.clientId)
        this.update(addJoinRequest(this.state, data.clientId, data.nickname, this.ctx.now()))
        this.transport.send(peerId, { type: 'pending' })
      } else {
        this.transport.send(peerId, { type: 'removed' })
      }
      return
    }
    const next = joinMember(this.state, data.clientId, data.nickname, this.ctx.now())
    if (next === this.state) {
      this.transport.send(peerId, { type: 'error', reason: 'invalid-message' })
      return
    }
    this.pendingPeers.delete(peerId)
    this.peerToMember.set(peerId, data.clientId)
    this.update(next)
  }

  private apply(actorId: string, intent: Intent): IntentResult {
    const result = applyIntent(this.state, actorId, intent, this.ctx)
    if (!result.ok) return result
    // 先解除被剔除者的連線對應，避免他收到這次的 state 廣播
    const kickedPeers = intent.kind === 'removeMember' ? this.unmapMember(intent.memberId) : []
    this.update(result.state)
    for (const peerId of kickedPeers) this.transport.send(peerId, { type: 'removed' })
    if (intent.kind === 'resolveJoinRequest') this.resolvePending(intent.memberId, intent.approve)
    return result
  }

  /** 被剔除的成員保持連線，但不再收到 state；回傳他的連線 */
  private unmapMember(memberId: string): string[] {
    const peers = [...this.peerToMember].filter(([, id]) => id === memberId).map(([peerId]) => peerId)
    for (const peerId of peers) this.peerToMember.delete(peerId)
    return peers
  }

  private resolvePending(memberId: string, approve: boolean): void {
    for (const [peerId, id] of [...this.pendingPeers]) {
      if (id !== memberId) continue
      this.pendingPeers.delete(peerId)
      if (approve) {
        this.peerToMember.set(peerId, memberId)
        this.transport.send(peerId, { type: 'state', state: this.state })
      } else {
        this.transport.send(peerId, { type: 'rejected' })
      }
    }
  }

  private handlePeerLeave(peerId: string): void {
    this.pendingPeers.delete(peerId)
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
