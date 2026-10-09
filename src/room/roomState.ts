import type { Intent } from './protocol'
import { computeSettlement, unsettleableExpenses } from './settlement'
import type { Expense, RoomState } from './types'

export const NICKNAME_MAX_LENGTH = 20
export const TITLE_MAX_LENGTH = 30
export const AMOUNT_MAX = 99_999_999

// 以下皆為純函式：不修改傳入的 state，方便測試與比對是否有變更

export function createRoom(code: string, hostId: string, hostNickname: string, now: number): RoomState {
  return {
    code,
    hostId,
    members: [{ id: hostId, nickname: cleanNickname(hostNickname), online: true, joinedAt: now }],
    expenses: [],
    removed: [],
    joinRequests: [],
    settlement: null,
    version: 1,
  }
}

export function isRemoved(state: RoomState, id: string): boolean {
  return state.removed.some((r) => r.id === id)
}

/** 新成員加入，或既有成員重連（沿用原本的 id，暱稱以最新的為準）。被剔除的人不能直接加入 */
export function joinMember(state: RoomState, id: string, nickname: string, now: number): RoomState {
  const name = cleanNickname(nickname)
  if (!name || isRemoved(state, id)) return state
  const existing = state.members.find((m) => m.id === id)
  const members = existing
    ? state.members.map((m) => (m.id === id ? { ...m, nickname: name, online: true } : m))
    : [...state.members, { id, nickname: name, online: true, joinedAt: now }]
  return bump({ ...state, members })
}

export function setMemberOnline(state: RoomState, id: string, online: boolean): RoomState {
  const member = state.members.find((m) => m.id === id)
  if (!member || member.online === online) return state
  return bump({
    ...state,
    members: state.members.map((m) => (m.id === id ? { ...m, online } : m)),
  })
}

/** 被剔除的人申請重新加入；重複申請只更新暱稱 */
export function addJoinRequest(state: RoomState, id: string, nickname: string, now: number): RoomState {
  if (!isRemoved(state, id)) return state
  const name = cleanNickname(nickname) || state.removed.find((r) => r.id === id)!.nickname
  const others = state.joinRequests.filter((r) => r.id !== id)
  const existing = state.joinRequests.find((r) => r.id === id)
  return bump({
    ...state,
    joinRequests: [...others, { id, nickname: name, requestedAt: existing?.requestedAt ?? now }],
  })
}

/** 房主恢復房間時，除了房主以外的成員都要重新連線，先全部標為離線 */
export function resetPresence(state: RoomState): RoomState {
  return {
    ...state,
    members: state.members.map((m) => ({ ...m, online: m.id === state.hostId })),
  }
}

export type IntentError =
  | 'not-member'
  /** 沒有權限（非房主操作他人資料） */
  | 'forbidden'
  /** 已結算，帳目鎖定 */
  | 'locked'
  | 'invalid'
  | 'not-found'
  /** 有付款紀錄的成員不能剔除 */
  | 'has-payments'
  /** 有帳目沒有任何參與者，無法結算 */
  | 'unsettleable'

export type IntentResult = { ok: true; state: RoomState } | { ok: false; error: IntentError }

export interface IntentContext {
  newId: () => string
  now: () => number
}

/**
 * 套用一個操作。房主自己的操作與成員送來的操作都經過這裡，
 * 權限規則只有這一份：一般成員只能處理自己付的帳目與自己的參與狀態，其餘由房主處理。
 */
export function applyIntent(state: RoomState, actorId: string, intent: Intent, ctx: IntentContext): IntentResult {
  if (!state.members.some((m) => m.id === actorId)) return fail('not-member')
  const isHost = actorId === state.hostId
  const locked = state.settlement !== null

  switch (intent.kind) {
    case 'addExpense': {
      if (locked) return fail('locked')
      const payerId = intent.payerId ?? actorId
      if (payerId !== actorId && !isHost) return fail('forbidden')
      if (!isMember(state, payerId)) return fail('invalid')
      const fields = validateExpenseFields(intent.title, intent.amount)
      if (!fields) return fail('invalid')
      const expense: Expense = { id: ctx.newId(), payerId, ...fields, excludedIds: [], createdAt: ctx.now() }
      return ok({ ...state, expenses: [...state.expenses, expense] })
    }

    case 'updateExpense': {
      if (locked) return fail('locked')
      const expense = state.expenses.find((e) => e.id === intent.expenseId)
      if (!expense) return fail('not-found')
      if (!isHost && expense.payerId !== actorId) return fail('forbidden')
      const payerId = intent.payerId ?? expense.payerId
      if (payerId !== expense.payerId && !isHost) return fail('forbidden')
      if (!isMember(state, payerId)) return fail('invalid')
      const fields = validateExpenseFields(intent.title, intent.amount)
      if (!fields) return fail('invalid')
      return ok(replaceExpense(state, { ...expense, ...fields, payerId }))
    }

    case 'deleteExpense': {
      if (locked) return fail('locked')
      const expense = state.expenses.find((e) => e.id === intent.expenseId)
      if (!expense) return fail('not-found')
      if (!isHost && expense.payerId !== actorId) return fail('forbidden')
      return ok({ ...state, expenses: state.expenses.filter((e) => e.id !== expense.id) })
    }

    case 'setParticipation': {
      if (locked) return fail('locked')
      if (!isHost && intent.memberId !== actorId) return fail('forbidden')
      const expense = state.expenses.find((e) => e.id === intent.expenseId)
      if (!expense) return fail('not-found')
      if (!isMember(state, intent.memberId)) return fail('invalid')
      const others = expense.excludedIds.filter((id) => id !== intent.memberId)
      const excludedIds = intent.participating ? others : [...others, intent.memberId]
      return ok(replaceExpense(state, { ...expense, excludedIds }))
    }

    case 'removeMember': {
      if (!isHost) return fail('forbidden')
      if (locked) return fail('locked')
      const target = state.members.find((m) => m.id === intent.memberId)
      if (!target || target.id === state.hostId) return fail('invalid')
      if (state.expenses.some((e) => e.payerId === target.id)) return fail('has-payments')
      return ok({
        ...state,
        members: state.members.filter((m) => m.id !== target.id),
        expenses: state.expenses.map((e) =>
          e.excludedIds.includes(target.id) ? { ...e, excludedIds: e.excludedIds.filter((id) => id !== target.id) } : e,
        ),
        removed: [...state.removed.filter((r) => r.id !== target.id), { id: target.id, nickname: target.nickname }],
      })
    }

    case 'resolveJoinRequest': {
      if (!isHost) return fail('forbidden')
      const request = state.joinRequests.find((r) => r.id === intent.memberId)
      if (!request) return fail('not-found')
      const joinRequests = state.joinRequests.filter((r) => r.id !== request.id)
      if (!intent.approve) return ok({ ...state, joinRequests })
      const restored = { ...state, joinRequests, removed: state.removed.filter((r) => r.id !== request.id) }
      // 重新加入視同新成員：自動參與所有帳目，由本人或房主再調整
      const joined = joinMember(restored, request.id, request.nickname, ctx.now())
      return ok({ ...joined, version: state.version })
    }

    case 'settle': {
      if (!isHost) return fail('forbidden')
      if (locked) return fail('locked')
      if (unsettleableExpenses(state.expenses, state.members).length > 0) return fail('unsettleable')
      const settlement = computeSettlement(state.members, state.expenses, intent.mode, intent.rounding, ctx.now())
      return ok({ ...state, settlement })
    }

    case 'reopen': {
      if (!isHost) return fail('forbidden')
      if (!locked) return fail('invalid')
      return ok({ ...state, settlement: null })
    }
  }
}

/** 驗證帳目名稱與金額；不合法回傳 null */
export function validateExpenseFields(title: string, amount: number): { title: string; amount: number } | null {
  const cleaned = title.trim().slice(0, TITLE_MAX_LENGTH)
  if (!cleaned) return null
  if (!Number.isInteger(amount) || amount <= 0 || amount > AMOUNT_MAX) return null
  return { title: cleaned, amount }
}

export function cleanNickname(nickname: string): string {
  return nickname.trim().slice(0, NICKNAME_MAX_LENGTH)
}

function isMember(state: RoomState, id: string): boolean {
  return state.members.some((m) => m.id === id)
}

function replaceExpense(state: RoomState, expense: Expense): RoomState {
  return { ...state, expenses: state.expenses.map((e) => (e.id === expense.id ? expense : e)) }
}

function ok(state: RoomState): IntentResult {
  return { ok: true, state: bump(state) }
}

function fail(error: IntentError): IntentResult {
  return { ok: false, error }
}

function bump(state: RoomState): RoomState {
  return { ...state, version: state.version + 1 }
}
