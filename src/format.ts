const integerFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 })

export function formatAmount(amount: number): string {
  return integerFormat.format(amount)
}

/** 平均每人的精確金額，最多兩位小數，例如 100 ÷ 3 → 33.33 */
export function formatAverage(amount: number, count: number): string {
  return count > 0 ? decimalFormat.format(amount / count) : '—'
}

/** 解析使用者輸入的金額（允許千分位逗號）；不是正整數時回傳 null */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return value > 0 ? value : null
}
