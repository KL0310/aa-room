import type { RoundingMode, RoomState, SettlementMode } from './types'

/** 協定有不相容的變更時遞增；GitHub Pages 有快取，成員可能還在用舊版頁面 */
export const PROTOCOL_VERSION = 2

/** 成員可以送出的操作；是否允許由房主依權限判斷 */
export type Intent =
  | { kind: 'addExpense'; title: string; amount: number; payerId?: string }
  | { kind: 'updateExpense'; expenseId: string; title: string; amount: number; payerId?: string }
  | { kind: 'deleteExpense'; expenseId: string }
  | { kind: 'setParticipation'; expenseId: string; memberId: string; participating: boolean }
  | { kind: 'removeMember'; memberId: string }
  | { kind: 'resolveJoinRequest'; memberId: string; approve: boolean }
  | { kind: 'settle'; mode: SettlementMode; rounding: RoundingMode }
  | { kind: 'reopen' }

/** client → 房主：只送出意圖，由房主驗證後更新 state */
export type ClientMessage =
  | {
      type: 'hello'
      protocolVersion: number
      clientId: string
      nickname: string
      /** 被剔除後主動申請重新加入；一般重連不帶，避免自動送出申請 */
      requestRejoin?: boolean
    }
  | { type: 'intent'; intent: Intent }

/** 房主 → client */
export type HostMessage =
  | { type: 'state'; state: RoomState }
  /** 已被房主剔除，尚未申請重新加入 */
  | { type: 'removed' }
  /** 重新加入申請已送出，等待房主同意 */
  | { type: 'pending' }
  /** 房主拒絕了重新加入申請 */
  | { type: 'rejected' }
  | { type: 'error'; reason: HostErrorReason }

export type HostErrorReason = 'same-device-as-host' | 'invalid-message' | 'version-mismatch'

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObject(value)) return false
  switch (value.type) {
    case 'hello':
      return (
        typeof value.protocolVersion === 'number' &&
        typeof value.clientId === 'string' &&
        typeof value.nickname === 'string' &&
        (value.requestRejoin === undefined || typeof value.requestRejoin === 'boolean')
      )
    case 'intent':
      return isIntent(value.intent)
    default:
      return false
  }
}

export function isIntent(value: unknown): value is Intent {
  if (!isObject(value)) return false
  const v = value
  const optionalString = (x: unknown) => x === undefined || typeof x === 'string'
  switch (v.kind) {
    case 'addExpense':
      return typeof v.title === 'string' && typeof v.amount === 'number' && optionalString(v.payerId)
    case 'updateExpense':
      return (
        typeof v.expenseId === 'string' &&
        typeof v.title === 'string' &&
        typeof v.amount === 'number' &&
        optionalString(v.payerId)
      )
    case 'deleteExpense':
      return typeof v.expenseId === 'string'
    case 'setParticipation':
      return typeof v.expenseId === 'string' && typeof v.memberId === 'string' && typeof v.participating === 'boolean'
    case 'removeMember':
      return typeof v.memberId === 'string'
    case 'resolveJoinRequest':
      return typeof v.memberId === 'string' && typeof v.approve === 'boolean'
    case 'settle':
      return (v.mode === 'direct' || v.mode === 'hub') && (v.rounding === 'ceil' || v.rounding === 'floor')
    case 'reopen':
      return true
    default:
      return false
  }
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isObject(value)) return false
  switch (value.type) {
    case 'state':
      return isObject(value.state)
    case 'removed':
    case 'pending':
    case 'rejected':
      return true
    case 'error':
      return typeof value.reason === 'string'
    default:
      return false
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
