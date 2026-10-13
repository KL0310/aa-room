import type { Balance, Expense, Member, RoundingMode, Settlement, SettlementMode, Transfer } from './types'

/** 帳目的實際參與者：目前的成員中，沒有被標為不參與的人（依成員加入順序） */
export function participantsOf(expense: Expense, members: Member[]): string[] {
  return members.filter((m) => !expense.excludedIds.includes(m.id)).map((m) => m.id)
}

/** 沒有任何參與者的帳目無法分攤，必須先處理才能結算 */
export function unsettleableExpenses(expenses: Expense[], members: Member[]): Expense[] {
  return expenses.filter((e) => participantsOf(e, members).length === 0)
}

/** 浮點數累加的誤差容忍度；金額都是整數，遠小於 1 的誤差不影響取整 */
const EPSILON = 1e-6

/**
 * 計算每位成員的收支。
 * 先以精確金額（含小數）累加每個人的收支，最後才取整一次，避免每筆帳目各自取整造成誤差累積
 * （例如 500 與 1,000 都三人分，每人應負擔剛好 500，而不是 167 + 334 = 501）。
 *
 * 取整方式：
 * - 應付的人：依 rounding 對應付總額進位或捨去
 * - 應收的人：把應付方實際付出的總額，依各自應收的精確金額比例分配成整數，確保收付總額一致
 */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  rounding: RoundingMode,
): Record<string, Balance> {
  const paid = new Map<string, number>()
  const exact = new Map<string, number>()
  for (const m of members) {
    paid.set(m.id, 0)
    exact.set(m.id, 0)
  }
  for (const expense of expenses) {
    if (!paid.has(expense.payerId)) continue
    const participants = participantsOf(expense, members)
    if (participants.length === 0) continue
    paid.set(expense.payerId, paid.get(expense.payerId)! + expense.amount)
    exact.set(expense.payerId, exact.get(expense.payerId)! + expense.amount)
    const share = expense.amount / participants.length
    for (const id of participants) exact.set(id, exact.get(id)! - share)
  }

  const net = new Map<string, number>(members.map((m) => [m.id, 0]))
  let totalDebt = 0
  for (const m of members) {
    const value = exact.get(m.id)!
    if (value >= -EPSILON) continue
    const debt = rounding === 'ceil' ? Math.ceil(-value - EPSILON) : Math.floor(-value + EPSILON)
    net.set(m.id, -debt)
    totalDebt += debt
  }
  const creditors = members.filter((m) => exact.get(m.id)! > EPSILON).map((m) => ({ id: m.id, credit: exact.get(m.id)! }))
  for (const [id, amount] of apportion(totalDebt, creditors)) net.set(id, amount)

  const result: Record<string, Balance> = {}
  for (const m of members) {
    const p = paid.get(m.id)!
    const n = net.get(m.id)!
    result[m.id] = { paid: p, share: p - n, net: n }
  }
  return result
}

/**
 * 依比例把整數總額分配給應收款的人（最大餘數法）：
 * 先取每人按比例的整數部分，剩下的零頭依小數部分由大到小各給 1，
 * 小數部分相同時給應收較多者，再相同則依加入順序。
 */
function apportion(total: number, creditors: Array<{ id: string; credit: number }>): Map<string, number> {
  const result = new Map<string, number>()
  const sum = creditors.reduce((acc, c) => acc + c.credit, 0)
  if (creditors.length === 0 || total <= 0 || sum <= 0) {
    for (const c of creditors) result.set(c.id, 0)
    return result
  }
  const quotas = creditors.map((c, order) => {
    const quota = (c.credit * total) / sum
    const base = Math.floor(quota + EPSILON)
    return { ...c, order, base, fraction: quota - base }
  })
  let remainder = total - quotas.reduce((acc, q) => acc + q.base, 0)
  const ranked = [...quotas].sort(
    (a, b) => b.fraction - a.fraction || b.credit - a.credit || a.order - b.order,
  )
  for (const q of ranked) {
    result.set(q.id, q.base + (remainder > 0 ? 1 : 0))
    if (remainder > 0) remainder--
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
