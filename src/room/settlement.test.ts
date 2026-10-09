import { describe, expect, it } from 'vitest'
import {
  computeBalances,
  computeSettlement,
  directTransfers,
  hubTransfers,
  participantsOf,
  pickHub,
  shareOf,
  unsettleableExpenses,
} from './settlement'
import { expense, member } from './testUtils'
import type { Balance } from './types'

const abc = [member('a'), member('b'), member('c')]
const order = ['a', 'b', 'c']

function nets(balances: Record<string, Balance>) {
  return Object.fromEntries(Object.entries(balances).map(([id, b]) => [id, b.net]))
}

describe('participantsOf', () => {
  it('排除不參與者，且只計目前的成員（依加入順序）', () => {
    expect(participantsOf(expense('e', 'a', 100, ['b', 'ghost']), abc)).toEqual(['a', 'c'])
  })
})

describe('shareOf', () => {
  it('整除時兩種模式相同', () => {
    expect(shareOf(90, 3, 'ceil')).toBe(30)
    expect(shareOf(90, 3, 'floor')).toBe(30)
  })
  it('除不盡時進位或捨去', () => {
    expect(shareOf(100, 3, 'ceil')).toBe(34)
    expect(shareOf(100, 3, 'floor')).toBe(33)
  })
  it('沒有參與者為 0', () => {
    expect(shareOf(100, 0, 'ceil')).toBe(0)
  })
})

describe('computeBalances', () => {
  it('100 元 3 人分、進位：其他兩人各付 34，付款人實收 68', () => {
    const b = computeBalances(abc, [expense('e', 'a', 100)], 'ceil')
    expect(b.a).toEqual({ paid: 100, share: 32, net: 68 })
    expect(b.b).toEqual({ paid: 0, share: 34, net: -34 })
    expect(b.c).toEqual({ paid: 0, share: 34, net: -34 })
  })

  it('100 元 3 人分、捨去：其他兩人各付 33，差額由付款人吸收', () => {
    const b = computeBalances(abc, [expense('e', 'a', 100)], 'floor')
    expect(nets(b)).toEqual({ a: 66, b: -33, c: -33 })
    expect(b.a!.share).toBe(34)
  })

  it('付款人沒有參與時，參與者分攤全部', () => {
    const b = computeBalances(abc, [expense('e', 'a', 90, ['a'])], 'ceil')
    expect(nets(b)).toEqual({ a: 90, b: -45, c: -45 })
    expect(b.a!.share).toBe(0)
  })

  it('多筆帳目累加，所有人的 net 加總為 0', () => {
    const expenses = [expense('e1', 'a', 1000), expense('e2', 'b', 301, ['c']), expense('e3', 'c', 77, ['a'])]
    for (const rounding of ['ceil', 'floor'] as const) {
      const b = computeBalances(abc, expenses, rounding)
      expect(Object.values(b).reduce((sum, x) => sum + x.net, 0)).toBe(0)
      expect(b.a!.paid).toBe(1000)
    }
  })

  it('沒有參與者或付款人已不在名單的帳目不計入', () => {
    const b = computeBalances(abc, [expense('e1', 'a', 100, ['a', 'b', 'c']), expense('e2', 'ghost', 100)], 'ceil')
    expect(nets(b)).toEqual({ a: 0, b: 0, c: 0 })
  })
})

describe('unsettleableExpenses', () => {
  it('找出沒有任何參與者的帳目', () => {
    const e = expense('e', 'a', 100, ['a', 'b', 'c'])
    expect(unsettleableExpenses([e, expense('ok', 'a', 1)], abc)).toEqual([e])
  })
})

describe('directTransfers', () => {
  it('欠最多的人優先付給應收最多的人', () => {
    const balances = {
      a: { paid: 0, share: 0, net: 100 },
      b: { paid: 0, share: 0, net: -70 },
      c: { paid: 0, share: 0, net: -30 },
    }
    expect(directTransfers(order, balances)).toEqual([
      { fromId: 'b', toId: 'a', amount: 70 },
      { fromId: 'c', toId: 'a', amount: 30 },
    ])
  })

  it('多位應收款人時拆成多筆，且全部結清', () => {
    const balances = {
      a: { paid: 0, share: 0, net: 50 },
      b: { paid: 0, share: 0, net: 30 },
      c: { paid: 0, share: 0, net: -80 },
    }
    expect(directTransfers(order, balances)).toEqual([
      { fromId: 'c', toId: 'a', amount: 50 },
      { fromId: 'c', toId: 'b', amount: 30 },
    ])
  })

  it('全部打平時沒有轉帳', () => {
    const zero = { paid: 0, share: 0, net: 0 }
    expect(directTransfers(order, { a: zero, b: zero, c: zero })).toEqual([])
  })
})

describe('pickHub', () => {
  it('選付款總額最多者，同額取較早加入者', () => {
    const b = (paid: number) => ({ paid, share: 0, net: 0 })
    expect(pickHub(order, { a: b(100), b: b(300), c: b(300) })).toBe('b')
  })
  it('沒有人付過錢時為 null', () => {
    const z = { paid: 0, share: 0, net: 0 }
    expect(pickHub(order, { a: z, b: z, c: z })).toBeNull()
  })
})

describe('hubTransfers', () => {
  it('其他欠款人付給收款人，收款人再轉給其他應收款的人', () => {
    const balances = {
      a: { paid: 500, share: 0, net: 200 },
      b: { paid: 100, share: 0, net: 50 },
      c: { paid: 0, share: 0, net: -250 },
    }
    expect(hubTransfers(order, balances, 'a')).toEqual([
      { fromId: 'c', toId: 'a', amount: 250 },
      { fromId: 'a', toId: 'b', amount: 50 },
    ])
  })

  it('收款人本身是欠款人時，收進來的錢仍足夠轉出', () => {
    const balances = {
      a: { paid: 500, share: 0, net: -20 },
      b: { paid: 0, share: 0, net: -100 },
      c: { paid: 0, share: 0, net: 120 },
    }
    expect(hubTransfers(order, balances, 'a')).toEqual([
      { fromId: 'b', toId: 'a', amount: 100 },
      { fromId: 'a', toId: 'c', amount: 120 },
    ])
  })
})

describe('computeSettlement', () => {
  // a：+200（e1 其他兩人各 100）−30（e2）= 170；b：+60 −100 = −40；c：−130
  const expenses = [expense('e1', 'a', 300), expense('e2', 'b', 90)]

  it('各自轉帳模式', () => {
    const s = computeSettlement(abc, expenses, 'direct', 'ceil', 5)
    expect(s.hubId).toBeNull()
    expect(s.transfers).toEqual([
      { fromId: 'c', toId: 'a', amount: 130 },
      { fromId: 'b', toId: 'a', amount: 40 },
    ])
    expect(s.settledAt).toBe(5)
  })

  it('統一收付模式以付款最多的人為收款人', () => {
    const s = computeSettlement(abc, expenses, 'hub', 'ceil', 5)
    expect(s.hubId).toBe('a')
    expect(s.transfers).toEqual([
      { fromId: 'b', toId: 'a', amount: 40 },
      { fromId: 'c', toId: 'a', amount: 130 },
    ])
  })

  it('每位成員的轉帳結果與 net 一致', () => {
    for (const mode of ['direct', 'hub'] as const) {
      const s = computeSettlement(abc, [...expenses, expense('e3', 'c', 1001, ['a'])], mode, 'floor', 0)
      for (const id of order) {
        const received = s.transfers.filter((t) => t.toId === id).reduce((x, t) => x + t.amount, 0)
        const sent = s.transfers.filter((t) => t.fromId === id).reduce((x, t) => x + t.amount, 0)
        expect(received - sent).toBe(s.balances[id]!.net)
      }
    }
  })
})
