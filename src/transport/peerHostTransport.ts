import { Peer } from 'peerjs'
import { hostPeerId } from '../room/roomCode'
import { buildPeerOptions } from './peerOptions'
import { PeerTransportBase } from './peerBase'

const ID_TAKEN_RETRY_DELAY_MS = 2000
const ID_TAKEN_MAX_RETRIES = 15
const SIGNALING_RETRY_DELAY_MS = 3000

export interface PeerHostTransportOptions {
  roomCode: string
  /**
   * 房主重新整理頁面後恢復房間時，PeerServer 可能還保留舊連線佔用的 id 一段時間，
   * 此時要持續重試；建立新房間時則直接視為房號已被使用。
   */
  retryWhenIdTaken: boolean
}

/** 房主端：以房號作為自己的 peer id，等待成員連入 */
export class PeerHostTransport<TSend> extends PeerTransportBase<TSend> {
  private peer: Peer | null = null
  private idTakenRetries = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly options: PeerHostTransportOptions) {
    super()
  }

  start(): void {
    this.createPeer()
  }

  close(): void {
    this.closed = true
    clearTimeout(this.retryTimer)
    for (const conn of this.connections.values()) conn.close()
    this.connections.clear()
    this.peer?.destroy()
    this.setStatus({ kind: 'closed' })
    this.disposeBase()
  }

  private createPeer(): void {
    if (this.closed) return
    const peer = new Peer(hostPeerId(this.options.roomCode), buildPeerOptions())
    this.peer = peer

    peer.on('open', () => {
      this.idTakenRetries = 0
      this.setStatus({ kind: 'ready' })
    })
    peer.on('connection', (conn) => this.attachConnection(conn))
    // 與 signaling server 斷線不影響已建立的 P2P 連線，但新成員無法加入，因此要重連
    peer.on('disconnected', () => {
      if (this.closed || peer.destroyed) return
      this.setStatus({ kind: 'reconnecting', attempt: 1 })
      this.retryTimer = setTimeout(() => {
        if (!peer.destroyed) peer.reconnect()
      }, SIGNALING_RETRY_DELAY_MS)
    })
    peer.on('error', (err) => {
      if (this.closed) return
      switch (err.type) {
        case 'unavailable-id':
          if (this.options.retryWhenIdTaken && this.idTakenRetries < ID_TAKEN_MAX_RETRIES) {
            this.idTakenRetries++
            this.setStatus({ kind: 'reconnecting', attempt: this.idTakenRetries })
            peer.destroy()
            this.retryTimer = setTimeout(() => this.createPeer(), ID_TAKEN_RETRY_DELAY_MS)
          } else {
            this.setStatus({ kind: 'failed', reason: 'room-code-taken' })
          }
          break
        case 'browser-incompatible':
          this.setStatus({ kind: 'failed', reason: 'browser-unsupported' })
          break
        default:
          // 其餘錯誤（網路、signaling server 異常）交由 disconnected 事件處理重連
          console.warn('[host transport]', err.type, err)
      }
    })
  }
}
