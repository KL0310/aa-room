import type { DataConnection } from 'peerjs'
import { detectConnectionKind } from './connectionKind'
import { Listeners } from './emitter'
import type { ConnectionKind, Transport, TransportStatus, Unsubscribe } from './types'

// 手機切到背景或網路中斷時，WebRTC 往往不會即時觸發 close，因此用心跳偵測失聯
const HEARTBEAT_INTERVAL_MS = 5000
const HEARTBEAT_TIMEOUT_MS = 15000
const HEARTBEAT_MESSAGE = { __aaRoomHeartbeat: true } as const

function isHeartbeat(data: unknown): boolean {
  return typeof data === 'object' && data !== null && '__aaRoomHeartbeat' in data
}

/** 房主端與成員端共用的連線管理與事件分派 */
export abstract class PeerTransportBase<TSend> implements Transport<TSend> {
  protected readonly connections = new Map<string, DataConnection>()
  protected readonly messageListeners = new Listeners<[string, unknown]>()
  protected readonly joinListeners = new Listeners<[string]>()
  protected readonly leaveListeners = new Listeners<[string]>()
  protected readonly statusListeners = new Listeners<[TransportStatus]>()
  protected status: TransportStatus = { kind: 'connecting' }
  protected closed = false
  private readonly lastSeen = new Map<DataConnection, number>()
  private readonly closeHandlers = new Map<DataConnection, () => void>()
  private readonly heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS)

  abstract start(): void
  abstract close(): void

  send(peerId: string, message: TSend): void {
    const conn = this.connections.get(peerId)
    if (conn?.open) conn.send(message)
  }

  onMessage(handler: (peerId: string, data: unknown) => void): Unsubscribe {
    return this.messageListeners.add(handler)
  }

  onPeerJoin(handler: (peerId: string) => void): Unsubscribe {
    return this.joinListeners.add(handler)
  }

  onPeerLeave(handler: (peerId: string) => void): Unsubscribe {
    return this.leaveListeners.add(handler)
  }

  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe {
    handler(this.status)
    return this.statusListeners.add(handler)
  }

  getConnectionKind(peerId: string): Promise<ConnectionKind> {
    return detectConnectionKind(this.connections.get(peerId)?.peerConnection)
  }

  protected setStatus(status: TransportStatus): void {
    this.status = status
    this.statusListeners.emit(status)
  }

  /** 註冊一條資料連線的事件；同一個 peer 重複連線時，以新的連線取代舊的 */
  protected attachConnection(conn: DataConnection, onOpen?: () => void, onClose?: () => void): void {
    conn.on('open', () => {
      const previous = this.connections.get(conn.peer)
      if (previous && previous !== conn) {
        this.forget(previous)
        previous.close()
      }
      this.connections.set(conn.peer, conn)
      this.lastSeen.set(conn, Date.now())
      if (onClose) this.closeHandlers.set(conn, onClose)
      onOpen?.()
      this.joinListeners.emit(conn.peer)
    })
    conn.on('data', (data) => {
      this.lastSeen.set(conn, Date.now())
      if (isHeartbeat(data)) return
      this.messageListeners.emit(conn.peer, data)
    })
    conn.on('close', () => this.dropConnection(conn))
    conn.on('error', () => this.dropConnection(conn))
  }

  /** 移除連線並通知離線；重複呼叫不會重複通知 */
  protected dropConnection(conn: DataConnection): void {
    if (this.connections.get(conn.peer) !== conn) return
    const onClose = this.closeHandlers.get(conn)
    this.connections.delete(conn.peer)
    this.forget(conn)
    this.leaveListeners.emit(conn.peer)
    onClose?.()
    conn.close()
  }

  protected disposeBase(): void {
    clearInterval(this.heartbeatTimer)
    this.messageListeners.clear()
    this.joinListeners.clear()
    this.leaveListeners.clear()
    this.statusListeners.clear()
  }

  private forget(conn: DataConnection): void {
    this.lastSeen.delete(conn)
    this.closeHandlers.delete(conn)
  }

  private heartbeat(): void {
    const now = Date.now()
    for (const conn of [...this.connections.values()]) {
      if (now - (this.lastSeen.get(conn) ?? now) > HEARTBEAT_TIMEOUT_MS) {
        this.dropConnection(conn)
      } else if (conn.open) {
        conn.send(HEARTBEAT_MESSAGE)
      }
    }
  }
}
