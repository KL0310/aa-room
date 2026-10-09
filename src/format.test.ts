import { describe, expect, it } from 'vitest'
import { formatAmount, formatAverage, parseAmount } from './format'

describe('format', () => {
  it('金額加上千分位', () => {
    expect(formatAmount(1234567)).toBe('1,234,567')
  })

  it('平均金額最多兩位小數', () => {
    expect(formatAverage(100, 3)).toBe('33.33')
    expect(formatAverage(90, 3)).toBe('30')
    expect(formatAverage(90, 0)).toBe('—')
  })

  it('解析金額：允許千分位，只接受正整數', () => {
    expect(parseAmount('1,200')).toBe(1200)
    expect(parseAmount(' 300 ')).toBe(300)
    expect(parseAmount('12.5')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
