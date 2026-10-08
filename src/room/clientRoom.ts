import type { Transport, Unsubscribe } from '../transport/types'
import { isHostMessage, type ClientMessage, type HostErrorReason } from './protocol'
import type { RoomState } from './types'

export interface ClientRoomCallbacks {
  onState: (state: RoomState) => void
  onError: (reason: HostErrorReason) => void
}

/** 成員端的房間控制器：連上房主後報到，之後只接收房主廣播的 snapshot */
export class ClientRoom {
  private hostPeerId: string | null = null
  private state: RoomState | null = null
  private readonly unsubscribes: Unsubscribe[] = []

  constructor(
    private readonly transport: Transport<ClientMessage>,
    clientId: string,
    nickname: string,
    private readonly callbacks: ClientRoomCallbacks,
  ) {
    this.unsubscribes.push(
      // 每次（重新）連上房主都要重新報到，房主才知道這條連線屬於誰
      transport.onPeerJoin((peerId) => {
        this.hostPeerId = peerId
        transport.send(peerId, { type: 'hello', clientId, nickname })
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

  addNote(text: string): void {
    if (this.hostPeerId) this.transport.send(this.hostPeerId, { type: 'addNote', text })
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  private handleMessage(data: unknown): void {
    if (!isHostMessage(data)) return
    if (data.type === 'error') {
      this.callbacks.onError(data.reason)
      return
    }
    // 房主重新整理後 version 會延續，舊的 snapshot 直接忽略
    if (this.state && data.state.code === this.state.code && data.state.version < this.state.version) return
    this.state = data.state
    this.callbacks.onState(data.state)
  }
}
