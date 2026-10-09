import type { Transport, Unsubscribe } from '../transport/types'
import { PROTOCOL_VERSION, isHostMessage, type ClientMessage, type HostErrorReason, type Intent } from './protocol'
import type { RoomState } from './types'

/** 成員在房間中的身分狀態 */
export type Membership = 'joining' | 'member' | 'removed' | 'pending' | 'rejected'

export interface ClientRoomCallbacks {
  onState: (state: RoomState) => void
  onMembership: (membership: Membership) => void
  onError: (reason: HostErrorReason) => void
}

/** 成員端的房間控制器：連上房主後報到，之後只接收房主廣播的 snapshot */
export class ClientRoom {
  private hostPeerId: string | null = null
  private state: RoomState | null = null
  private wantsRejoin = false
  private readonly unsubscribes: Unsubscribe[] = []

  constructor(
    private readonly transport: Transport<ClientMessage>,
    private readonly clientId: string,
    private readonly nickname: string,
    private readonly callbacks: ClientRoomCallbacks,
  ) {
    this.unsubscribes.push(
      // 每次（重新）連上房主都要重新報到，房主才知道這條連線屬於誰
      transport.onPeerJoin((peerId) => {
        this.hostPeerId = peerId
        this.sendHello()
      }),
      transport.onPeerLeave(() => {
        this.hostPeerId = null
      }),
      transport.onMessage((_peerId, data) => this.handleMessage(data)),
    )
  }

  get connectedPeerId(): string | null {
    return this.hostPeerId
  }

  dispatch(intent: Intent): void {
    if (this.hostPeerId) this.transport.send(this.hostPeerId, { type: 'intent', intent })
  }

  /** 被剔除後申請重新加入；之後重連也會持續帶著申請，直到房主同意或拒絕 */
  requestRejoin(): void {
    this.wantsRejoin = true
    this.sendHello()
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  private sendHello(): void {
    if (!this.hostPeerId) return
    this.transport.send(this.hostPeerId, {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      clientId: this.clientId,
      nickname: this.nickname,
      ...(this.wantsRejoin ? { requestRejoin: true } : {}),
    })
  }

  private handleMessage(data: unknown): void {
    if (!isHostMessage(data)) return
    switch (data.type) {
      case 'error':
        this.callbacks.onError(data.reason)
        return
      case 'removed':
      case 'pending':
        this.callbacks.onMembership(data.type)
        return
      case 'rejected':
        this.wantsRejoin = false
        this.callbacks.onMembership('rejected')
        return
      case 'state':
        // 房主重新整理後 version 會延續，舊的 snapshot 直接忽略
        if (this.state && data.state.code === this.state.code && data.state.version < this.state.version) return
        this.wantsRejoin = false
        this.state = data.state
        this.callbacks.onMembership('member')
        this.callbacks.onState(data.state)
    }
  }
}
