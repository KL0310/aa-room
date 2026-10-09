import type { Balance, Expense, Member, RoundingMode, Settlement, SettlementMode, Transfer } from './types'

/** 帳目的實際參與者：目前的成員中，沒有被標為不參與的人（依成員加入順序） */
export function participantsOf(expense: Expense, members: Member[]): string[] {
  return members.filter((m) => !expense.excludedIds.includes(m.id)).map((m) => m.id)
}

/** 每位參與者應分攤的整數金額 */
export function shareOf(amount: number, participantCount: number, rounding: RoundingMode): number {
  if (participantCount <= 0) return 0
  const exact = amount / participantCount
  return rounding === 'ceil' ? Math.ceil(exact) : Math.floor(exact)
}

/** 沒有任何參與者的帳目無法分攤，必須先處理才能結算 */
export function unsettleableExpenses(expenses: Expense[], members: Member[]): Expense[] {
  return expenses.filter((e) => participantsOf(e, members).length === 0)
}

/**
 * 計算每位成員的收支。
 * 以「每筆帳目、每位非付款人的分攤額」為單位取整：非付款人各付 shareOf 給付款人，
 * 付款人實際負擔的部分 = 金額 − 其他人付給他的總和，因此所有人的 net 加總恆為 0。
 */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  rounding: RoundingMode,
): Record<string, Balance> {
  const paid = new Map<string, number>()
  const net = new Map<string, number>()
  for (const m of members) {
    paid.set(m.id, 0)
    net.set(m.id, 0)
  }
  for (const expense of expenses) {
    if (!paid.has(expense.payerId)) continue
    const participants = participantsOf(expense, members)
    if (participants.length === 0) continue
    paid.set(expense.payerId, paid.get(expense.payerId)! + expense.amount)
    const share = shareOf(expense.amount, participants.length, rounding)
    for (const id of participants) {
      if (id === expense.payerId) continue
      net.set(id, net.get(id)! - share)
      net.set(expense.payerId, net.get(expense.payerId)! + share)
    }
  }
  const result: Record<string, Balance> = {}
  for (const m of members) {
    const p = paid.get(m.id)!
    const n = net.get(m.id)!
    result[m.id] = { paid: p, share: p - n, net: n }
  }
  return result
}

/**
 * 各自轉帳：每次由欠最多的人付給應收最多的人，直到全部結清。
 * 不保證是全域最少筆數，但最多 n − 1 筆，對聚會規模已足夠。
 */
export function directTransfers(memberOrder: string[], balances: Record<string, Balance>): Transfer[] {
  const remaining = new Map(memberOrder.map((id) => [id, balances[id]?.net ?? 0]))
  const transfers: Transfer[] = []
  for (;;) {
    const debtor = pickExtreme(memberOrder, remaining, (v) => -v)
    const creditor = pickExtreme(memberOrder, remaining, (v) => v)
    if (!debtor || !creditor) break
    const amount = Math.min(-remaining.get(debtor)!, remaining.get(creditor)!)
    transfers.push({ fromId: debtor, toId: creditor, amount })
    remaining.set(debtor, remaining.get(debtor)! + amount)
    remaining.set(creditor, remaining.get(creditor)! - amount)
  }
  return transfers
}

/** 統一收付的收款人：付款總額最多者，同額時取較早加入者；沒有人付過錢則為 null */
export function pickHub(memberOrder: string[], balances: Record<string, Balance>): string | null {
  let hub: string | null = null
  for (const id of memberOrder) {
    const paid = balances[id]?.paid ?? 0
    if (paid > 0 && (hub === null || paid > balances[hub]!.paid)) hub = id
  }
  return hub
}

/** 統一收付：其他欠款人都付給收款人，再由收款人轉給其他應收款的人 */
export function hubTransfers(memberOrder: string[], balances: Record<string, Balance>, hubId: string): Transfer[] {
  const collect: Transfer[] = []
  const payout: Transfer[] = []
  for (const id of memberOrder) {
    if (id === hubId) continue
    const net = balances[id]?.net ?? 0
    if (net < 0) collect.push({ fromId: id, toId: hubId, amount: -net })
    else if (net > 0) payout.push({ fromId: hubId, toId: id, amount: net })
  }
  return [...collect, ...payout]
}

export function computeSettlement(
  members: Member[],
  expenses: Expense[],
  mode: SettlementMode,
  rounding: RoundingMode,
  now: number,
): Settlement {
  const order = members.map((m) => m.id)
  const balances = computeBalances(members, expenses, rounding)
  const hubId = mode === 'hub' ? pickHub(order, balances) : null
  const transfers = hubId ? hubTransfers(order, balances, hubId) : directTransfers(order, balances)
  return { mode, rounding, hubId, balances, transfers, settledAt: now }
}

/** 依 score 找出分數最高且大於 0 的成員；同分取順序較前者 */
function pickExtreme(order: string[], values: Map<string, number>, score: (v: number) => number): string | null {
  let best: string | null = null
  for (const id of order) {
    const s = score(values.get(id) ?? 0)
    if (s > 0 && (best === null || s > score(values.get(best)!))) best = id
  }
  return best
}
