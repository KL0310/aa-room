export type Unsubscribe = () => void

export type TransportStatus =
  | { kind: 'connecting' }
  | { kind: 'ready' }
  /** 暫時斷線，正在自動重試 */
  | { kind: 'reconnecting'; attempt: number }
  | { kind: 'failed'; reason: TransportFailure }
  | { kind: 'closed' }

export type TransportFailure =
  /** 找不到房主（房號錯誤，或房主已離開） */
  | 'room-not-found'
  /** 房號已被使用 */
  | 'room-code-taken'
  | 'browser-unsupported'
  | 'unknown'

/** direct：P2P 直連；relay：經由 TURN 中繼 */
export type ConnectionKind = 'direct' | 'relay' | 'unknown'

/**
 * 傳輸層介面。房間邏輯只依賴這個介面，
 * 之後若要改用 Firebase / Supabase 等服務，只需提供新的實作。
 *
 * 房主端：peer 為各個成員的連線；成員端：唯一的 peer 是房主。
 * 收到的訊息一律視為 unknown，由房間邏輯自行驗證格式。
 */
export interface Transport<TSend> {
  start(): void
  send(peerId: string, message: TSend): void
  onMessage(handler: (peerId: string, data: unknown) => void): Unsubscribe
  onPeerJoin(handler: (peerId: string) => void): Unsubscribe
  onPeerLeave(handler: (peerId: string) => void): Unsubscribe
  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe
  getConnectionKind(peerId: string): Promise<ConnectionKind>
  close(): void
}
