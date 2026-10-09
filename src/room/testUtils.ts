import type { IntentContext } from './roomState'
import type { Expense, Member } from './types'

/** 測試用：依序產生 id 與時間 */
export function fakeContext(): IntentContext {
  let id = 0
  let time = 1000
  return { newId: () => `id-${++id}`, now: () => ++time }
}

export function member(id: string, joinedAt = 0): Member {
  return { id, nickname: id, online: true, joinedAt }
}

export function expense(id: string, payerId: string, amount: number, excludedIds: string[] = []): Expense {
  return { id, payerId, title: id, amount, excludedIds, createdAt: 0 }
}
