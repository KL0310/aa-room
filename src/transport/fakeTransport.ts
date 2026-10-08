import { Listeners } from './emitter'
import type { ConnectionKind, Transport, TransportStatus, Unsubscribe } from './types'

/** 測試用的記憶體內 transport：可以模擬 peer 連入、送訊息、斷線，並記錄送出的訊息 */
export class FakeTransport<TSend> implements Transport<TSend> {
  readonly sent: Array<{ peerId: string; message: TSend }> = []
  private readonly message = new Listeners<[string, unknown]>()
  private readonly join = new Listeners<[string]>()
  private readonly leave = new Listeners<[string]>()
  private readonly status = new Listeners<[TransportStatus]>()

  start(): void {
    this.status.emit({ kind: 'ready' })
  }
  send(peerId: string, message: TSend): void {
    this.sent.push({ peerId, message })
  }
  onMessage(handler: (peerId: string, data: unknown) => void): Unsubscribe {
    return this.message.add(handler)
  }
  onPeerJoin(handler: (peerId: string) => void): Unsubscribe {
    return this.join.add(handler)
  }
  onPeerLeave(handler: (peerId: string) => void): Unsubscribe {
    return this.leave.add(handler)
  }
  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe {
    return this.status.add(handler)
  }
  async getConnectionKind(): Promise<ConnectionKind> {
    return 'unknown'
  }
  close(): void {}

  simulateJoin(peerId: string): void {
    this.join.emit(peerId)
  }
  simulateMessage(peerId: string, data: unknown): void {
    this.message.emit(peerId, data)
  }
  simulateLeave(peerId: string): void {
    this.leave.emit(peerId)
  }
  sentTo(peerId: string): TSend[] {
    return this.sent.filter((s) => s.peerId === peerId).map((s) => s.message)
  }
}
