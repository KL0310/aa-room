import { Peer, type DataConnection } from 'peerjs'
import { hostPeerId } from '../room/roomCode'
import { buildPeerOptions } from './peerOptions'
import { PeerTransportBase } from './peerBase'

const CONNECT_TIMEOUT_MS = 15000
const MAX_RETRY_DELAY_MS = 10000
/** 從未連上房主時，找不到房主幾次就判定房間不存在 */
const NOT_FOUND_MAX_ATTEMPTS = 3

/** 成員端：連線到房主，斷線時自動重試 */
export class PeerClientTransport<TSend> extends PeerTransportBase<TSend> {
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private everConnected = false
  private attempt = 0
  private notFoundCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly roomCode: string) {
    super()
  }

  start(): void {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.createPeer()
  }

  close(): void {
    this.closed = true
    clearTimeout(this.retryTimer)
    clearTimeout(this.connectTimer)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.conn?.close()
    this.connections.clear()
    this.peer?.destroy()
    this.setStatus({ kind: 'closed' })
    this.disposeBase()
  }

  // 手機切回前景時立即重試，不用等待退避計時器
  private handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || this.closed) return
    if (this.status.kind === 'reconnecting') {
      clearTimeout(this.retryTimer)
      this.attempt = 0
      this.reconnectNow()
    }
  }

  private createPeer(): void {
    if (this.closed) return
    const peer = new Peer(buildPeerOptions())
    this.peer = peer

    peer.on('open', () => this.connectToHost())
    peer.on('disconnected', () => {
      // 已連上房主時，signaling 斷線不影響資料傳輸，等需要重連時再處理
      if (this.status.kind !== 'ready') this.scheduleRetry()
    })
    peer.on('error', (err) => {
      if (this.closed) return
      switch (err.type) {
        case 'peer-unavailable':
          // 曾經連上過：房主可能正在重新整理，持續重試；從未連上：可能房號錯誤
          if (!this.everConnected && ++this.notFoundCount >= NOT_FOUND_MAX_ATTEMPTS) {
            clearTimeout(this.connectTimer)
            this.setStatus({ kind: 'failed', reason: 'room-not-found' })
          } else {
            this.scheduleRetry()
          }
          break
        case 'browser-incompatible':
          this.setStatus({ kind: 'failed', reason: 'browser-unsupported' })
          break
        default:
          console.warn('[client transport]', err.type, err)
          this.scheduleRetry()
      }
    })
  }

  private connectToHost(): void {
    if (this.closed || !this.peer || this.peer.destroyed) return
    clearTimeout(this.connectTimer)
    // 先解除對舊連線的追蹤再關閉，避免舊連線的 close 事件又觸發一次重試
    const previous = this.conn
    this.conn = null
    previous?.close()
    const conn = this.peer.connect(hostPeerId(this.roomCode), { reliable: true })
    this.conn = conn
    this.attachConnection(
      conn,
      () => {
        clearTimeout(this.connectTimer)
        this.everConnected = true
        this.attempt = 0
        this.setStatus({ kind: 'ready' })
      },
      () => {
        if (this.conn !== conn) return
        this.conn = null
        this.scheduleRetry()
      },
    )
    // 尚未建立就失敗（例如協商失敗）時，attachConnection 不會處理，在這裡重試
    conn.on('error', () => {
      if (conn.open || this.conn !== conn) return
      this.conn = null
      this.scheduleRetry()
    })
    // ICE 協商可能卡住而沒有任何事件，逾時就放棄這次連線重來
    this.connectTimer = setTimeout(() => {
      if (conn.open || this.conn !== conn) return
      this.conn = null
      conn.close()
      this.scheduleRetry()
    }, CONNECT_TIMEOUT_MS)
  }

  private scheduleRetry(): void {
    if (this.closed || this.status.kind === 'failed') return
    clearTimeout(this.retryTimer)
    clearTimeout(this.connectTimer)
    this.attempt++
    this.setStatus({ kind: 'reconnecting', attempt: this.attempt })
    const delay = Math.min(1000 * 2 ** (this.attempt - 1), MAX_RETRY_DELAY_MS)
    this.retryTimer = setTimeout(() => this.reconnectNow(), delay)
  }

  private reconnectNow(): void {
    if (this.closed) return
    const peer = this.peer
    if (!peer || peer.destroyed) {
      this.createPeer()
    } else if (peer.disconnected) {
      // 重新連上 signaling server 後會再觸發 open，進而呼叫 connectToHost
      peer.reconnect()
    } else {
      this.connectToHost()
    }
  }
}
