import { PROTOCOL_VERSION, isHostMessage, type ClientMessage, type RoomInfo } from './room/protocol'
import { PeerClientTransport } from './transport/peerClientTransport'
import type { TransportFailure, Unsubscribe } from './transport/types'

export type InviteInfo =
  | { status: 'loading' }
  | { status: 'ready'; info: RoomInfo }
  | { status: 'failed'; reason: TransportFailure | 'version-mismatch' }

/**
 * 受邀畫面：在使用者輸入暱稱前先連上房主，只詢問房間名稱，不會被列入成員。
 * 使用者按下加入時可以接手這條連線（takeOver），省去重新連線的時間。
 */
export class InvitePreview {
  private readonly transport: PeerClientTransport<ClientMessage>
  private readonly unsubscribes: Unsubscribe[] = []
  private hostPeerId: string | null = null
  private usable = true

  constructor(
    readonly code: string,
    onInfo: (info: InviteInfo) => void,
  ) {
    const t = new PeerClientTransport<ClientMessage>(code)
    this.transport = t
    onInfo({ status: 'loading' })
    this.unsubscribes.push(
      t.onPeerJoin((peerId) => {
        this.hostPeerId = peerId
        t.send(peerId, { type: 'peek', protocolVersion: PROTOCOL_VERSION })
      }),
      t.onPeerLeave(() => {
        this.hostPeerId = null
      }),
      t.onMessage((_peerId, data) => {
        if (!isHostMessage(data)) return
        if (data.type === 'roomInfo') onInfo({ status: 'ready', info: data.info })
        else if (data.type === 'error' && data.reason === 'version-mismatch') {
          this.usable = false
          onInfo({ status: 'failed', reason: 'version-mismatch' })
          t.close()
        }
      }),
      t.onStatusChange((s) => {
        if (s.kind === 'failed') {
          this.usable = false
          onInfo({ status: 'failed', reason: s.reason })
        }
      }),
    )
    t.start()
  }

  /** 交出連線給正式加入流程；連線已失敗時回傳 null，由呼叫端重新建立 */
  takeOver(): { transport: PeerClientTransport<ClientMessage>; hostPeerId: string | null } | null {
    this.detach()
    if (!this.usable) {
      this.transport.close()
      return null
    }
    return { transport: this.transport, hostPeerId: this.hostPeerId }
  }

  close(): void {
    this.detach()
    this.transport.close()
  }

  private detach(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
    this.unsubscribes.length = 0
  }
}
