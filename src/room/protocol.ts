import type { RoomState } from './types'

/** client → 房主：只送出意圖，由房主驗證後更新 state */
export type ClientMessage =
  | { type: 'hello'; clientId: string; nickname: string }
  | { type: 'addNote'; text: string }

/** 房主 → client */
export type HostMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'error'; reason: HostErrorReason }

export type HostErrorReason = 'same-device-as-host' | 'invalid-message'

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null) return false
  const msg = value as Record<string, unknown>
  switch (msg.type) {
    case 'hello':
      return typeof msg.clientId === 'string' && typeof msg.nickname === 'string'
    case 'addNote':
      return typeof msg.text === 'string'
    default:
      return false
  }
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (typeof value !== 'object' || value === null) return false
  const msg = value as Record<string, unknown>
  return (msg.type === 'state' && typeof msg.state === 'object') || msg.type === 'error'
}
