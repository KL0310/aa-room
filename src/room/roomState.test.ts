import { describe, expect, it } from 'vitest'
import type { Intent } from './protocol'
import {
  addJoinRequest,
  applyIntent,
  createRoom,
  joinMember,
  resetPresence,
  setMemberOnline,
  type IntentResult,
} from './roomState'
import { fakeContext } from './testUtils'
import type { RoomState } from './types'

const base = () => createRoom('ABCDEF', 'host', '房主', 0)

/** 房主 + 小明(a) + 小華(b) */
function room(): RoomState {
  return joinMember(joinMember(base(), 'a', '小明', 1), 'b', '小華', 2)
}

function expectOk(result: IntentResult): RoomState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`)
  return result.state
}

function apply(state: RoomState, actor: string, intent: Intent) {
  return applyIntent(state, actor, intent, fakeContext())
}

/** 由 payer 新增一筆 300 元的帳目，回傳 state 與帳目 id */
function withExpense(state = room(), payer = 'a'): [RoomState, string] {
  const next = expectOk(apply(state, payer, { kind: 'addExpense', title: '晚餐', amount: 300 }))
  return [next, next.expenses[next.expenses.length - 1]!.id]
}

function removeB(state = room()): RoomState {
  return expectOk(apply(state, 'host', { kind: 'removeMember', memberId: 'b' }))
}

describe('createRoom', () => {
  it('房主是第一位成員且在線，尚未結算', () => {
    const state = base()
    expect(state.members).toEqual([{ id: 'host', nickname: '房主', online: true, joinedAt: 0 }])
    expect(state.settlement).toBeNull()
    expect(state.version).toBe(1)
  })
})

describe('joinMember', () => {
  it('新成員加入', () => {
    const state = joinMember(base(), 'a', ' 小明 ', 5)
    expect(state.members[1]).toEqual({ id: 'a', nickname: '小明', online: true, joinedAt: 5 })
    expect(state.version).toBe(2)
  })

  it('同一個 id 重連時沿用原本的成員並更新暱稱', () => {
    let state = joinMember(base(), 'a', '小明', 5)
    state = setMemberOnline(state, 'a', false)
    state = joinMember(state, 'a', '明明', 9)
    expect(state.members).toHaveLength(2)
    expect(state.members[1]).toEqual({ id: 'a', nickname: '明明', online: true, joinedAt: 5 })
  })

  it('暱稱為空白時不變更', () => {
    const state = base()
    expect(joinMember(state, 'a', '   ', 1)).toBe(state)
  })

  it('暱稱超過長度會被截斷', () => {
    const state = joinMember(base(), 'a', 'x'.repeat(50), 1)
    expect(state.members[1]?.nickname).toHaveLength(20)
  })

  it('被剔除的人不能直接加入', () => {
    const removed = removeB()
    expect(joinMember(removed, 'b', '小華', 9)).toBe(removed)
  })
})

describe('setMemberOnline', () => {
  it('狀態沒變或成員不存在時回傳原 state', () => {
    const state = base()
    expect(setMemberOnline(state, 'host', true)).toBe(state)
    expect(setMemberOnline(state, 'nobody', false)).toBe(state)
  })
})

describe('resetPresence', () => {
  it('只有房主保持在線', () => {
    const state = resetPresence(joinMember(base(), 'a', '小明', 1))
    expect(state.members.map((m) => m.online)).toEqual([true, false])
  })
})

describe('applyIntent：帳目', () => {
  it('非成員不能操作', () => {
    expect(apply(room(), 'stranger', { kind: 'addExpense', title: 'x', amount: 1 })).toEqual({
      ok: false,
      error: 'not-member',
    })
  })

  it('新增帳目：付款人預設為自己，參與者預設全員', () => {
    const [state, id] = withExpense()
    expect(state.expenses).toEqual([
      { id, payerId: 'a', title: '晚餐', amount: 300, excludedIds: [], createdAt: expect.any(Number) },
    ])
  })

  it('名稱空白、金額非正整數或過大時拒絕', () => {
    const cases = [
      { title: '  ', amount: 100 },
      { title: '晚餐', amount: 0 },
      { title: '晚餐', amount: -5 },
      { title: '晚餐', amount: 12.5 },
      { title: '晚餐', amount: 100_000_000 },
    ]
    for (const c of cases) {
      expect(apply(room(), 'a', { kind: 'addExpense', ...c })).toEqual({ ok: false, error: 'invalid' })
    }
  })

  it('名稱超過 30 字會被截斷', () => {
    const state = expectOk(apply(room(), 'a', { kind: 'addExpense', title: '字'.repeat(40), amount: 1 }))
    expect(state.expenses[0]?.title).toHaveLength(30)
  })

  it('一般成員不能替別人新增帳目，房主可以', () => {
    expect(apply(room(), 'a', { kind: 'addExpense', title: 'x', amount: 1, payerId: 'b' })).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const state = expectOk(apply(room(), 'host', { kind: 'addExpense', title: 'x', amount: 1, payerId: 'b' }))
    expect(state.expenses[0]?.payerId).toBe('b')
  })

  it('只有付款人本人或房主可以修改、刪除帳目', () => {
    const [state, id] = withExpense()
    const update: Intent = { kind: 'updateExpense', expenseId: id, title: '宵夜', amount: 200 }
    expect(apply(state, 'b', update)).toEqual({ ok: false, error: 'forbidden' })
    expect(expectOk(apply(state, 'a', update)).expenses[0]).toMatchObject({ title: '宵夜', amount: 200 })
    expect(expectOk(apply(state, 'host', update)).expenses[0]).toMatchObject({ title: '宵夜', amount: 200 })

    const del: Intent = { kind: 'deleteExpense', expenseId: id }
    expect(apply(state, 'b', del)).toEqual({ ok: false, error: 'forbidden' })
    expect(expectOk(apply(state, 'a', del)).expenses).toEqual([])
    expect(expectOk(apply(state, 'host', del)).expenses).toEqual([])
  })

  it('只有房主可以改付款人', () => {
    const [state, id] = withExpense()
    const intent: Intent = { kind: 'updateExpense', expenseId: id, title: '晚餐', amount: 300, payerId: 'b' }
    expect(apply(state, 'a', intent)).toEqual({ ok: false, error: 'forbidden' })
    expect(expectOk(apply(state, 'host', intent)).expenses[0]?.payerId).toBe('b')
  })

  it('找不到帳目', () => {
    expect(apply(room(), 'host', { kind: 'deleteExpense', expenseId: 'nope' })).toEqual({
      ok: false,
      error: 'not-found',
    })
  })
})

describe('applyIntent：參與勾選', () => {
  const toggle = (id: string, memberId: string, participating: boolean): Intent => ({
    kind: 'setParticipation',
    expenseId: id,
    memberId,
    participating,
  })

  it('成員可以勾選自己是否參與', () => {
    const [state, id] = withExpense()
    const out = expectOk(apply(state, 'b', toggle(id, 'b', false)))
    expect(out.expenses[0]?.excludedIds).toEqual(['b'])
    expect(expectOk(apply(out, 'b', toggle(id, 'b', true))).expenses[0]?.excludedIds).toEqual([])
  })

  it('重複取消勾選不會重複記錄', () => {
    const [state, id] = withExpense()
    const twice = expectOk(apply(expectOk(apply(state, 'b', toggle(id, 'b', false))), 'b', toggle(id, 'b', false)))
    expect(twice.expenses[0]?.excludedIds).toEqual(['b'])
  })

  it('一般成員不能改別人的勾選，房主可以', () => {
    const [state, id] = withExpense()
    expect(apply(state, 'a', toggle(id, 'b', false))).toEqual({ ok: false, error: 'forbidden' })
    expect(expectOk(apply(state, 'host', toggle(id, 'b', false))).expenses[0]?.excludedIds).toEqual(['b'])
  })

  it('晚加入的成員自動參與既有帳目', () => {
    const [state] = withExpense()
    const later = joinMember(state, 'c', '阿德', 99)
    expect(later.expenses[0]?.excludedIds).not.toContain('c')
  })

  it('剔除時清掉他在帳目上的勾選紀錄', () => {
    const [state, id] = withExpense()
    const removed = removeB(expectOk(apply(state, 'b', toggle(id, 'b', false))))
    expect(removed.expenses[0]?.excludedIds).toEqual([])
  })
})

describe('applyIntent：剔除與重新加入', () => {
  it('只有房主可以剔除，且不能剔除房主自己', () => {
    expect(apply(room(), 'a', { kind: 'removeMember', memberId: 'b' })).toEqual({ ok: false, error: 'forbidden' })
    expect(apply(room(), 'host', { kind: 'removeMember', memberId: 'host' })).toEqual({ ok: false, error: 'invalid' })
  })

  it('有付款紀錄的成員不能剔除', () => {
    const [state] = withExpense()
    expect(apply(state, 'host', { kind: 'removeMember', memberId: 'a' })).toEqual({
      ok: false,
      error: 'has-payments',
    })
  })

  it('剔除後從成員移除並列入 removed', () => {
    const state = removeB()
    expect(state.members.map((m) => m.id)).toEqual(['host', 'a'])
    expect(state.removed).toEqual([{ id: 'b', nickname: '小華' }])
  })

  it('申請重新加入，房主同意後回到成員名單', () => {
    const requested = addJoinRequest(removeB(), 'b', '小華華', 50)
    expect(requested.joinRequests).toEqual([{ id: 'b', nickname: '小華華', requestedAt: 50 }])
    const approved = expectOk(apply(requested, 'host', { kind: 'resolveJoinRequest', memberId: 'b', approve: true }))
    expect(approved.members.map((m) => m.nickname)).toEqual(['房主', '小明', '小華華'])
    expect(approved.removed).toEqual([])
    expect(approved.joinRequests).toEqual([])
  })

  it('房主拒絕後仍在 removed 名單中', () => {
    const requested = addJoinRequest(removeB(), 'b', '小華', 50)
    const rejected = expectOk(apply(requested, 'host', { kind: 'resolveJoinRequest', memberId: 'b', approve: false }))
    expect(rejected.joinRequests).toEqual([])
    expect(rejected.removed).toHaveLength(1)
    expect(rejected.members).toHaveLength(2)
  })

  it('沒被剔除的人不能送出申請；重複申請只保留一筆', () => {
    const state = room()
    expect(addJoinRequest(state, 'a', '小明', 1)).toBe(state)
    const twice = addJoinRequest(addJoinRequest(removeB(), 'b', '小華', 1), 'b', '小華', 2)
    expect(twice.joinRequests).toEqual([{ id: 'b', nickname: '小華', requestedAt: 1 }])
  })

  it('只有房主可以處理申請', () => {
    const requested = addJoinRequest(removeB(), 'b', '小華', 1)
    expect(apply(requested, 'a', { kind: 'resolveJoinRequest', memberId: 'b', approve: true })).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('applyIntent：結算與退回', () => {
  const settle: Intent = { kind: 'settle', mode: 'direct', rounding: 'ceil' }

  it('只有房主可以結算', () => {
    expect(apply(room(), 'a', settle)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('結算後產生結果並鎖定帳目', () => {
    const [state] = withExpense()
    const settled = expectOk(apply(state, 'host', settle))
    expect(settled.settlement?.transfers).toEqual([
      { fromId: 'host', toId: 'a', amount: 100 },
      { fromId: 'b', toId: 'a', amount: 100 },
    ])
    const lockedIntents: Intent[] = [
      { kind: 'addExpense', title: 'x', amount: 1 },
      { kind: 'deleteExpense', expenseId: settled.expenses[0]!.id },
      { kind: 'removeMember', memberId: 'b' },
      { kind: 'settle', mode: 'hub', rounding: 'floor' },
    ]
    for (const intent of lockedIntents) expect(apply(settled, 'host', intent)).toEqual({ ok: false, error: 'locked' })
  })

  it('有帳目沒有任何參與者時不能結算', () => {
    let [state, id] = withExpense()
    for (const memberId of ['host', 'a', 'b']) {
      state = expectOk(apply(state, 'host', { kind: 'setParticipation', expenseId: id, memberId, participating: false }))
    }
    expect(apply(state, 'host', settle)).toEqual({ ok: false, error: 'unsettleable' })
  })

  it('房主退回後可以再編輯', () => {
    const [state] = withExpense()
    const settled = expectOk(apply(state, 'host', settle))
    expect(apply(settled, 'a', { kind: 'reopen' })).toEqual({ ok: false, error: 'forbidden' })
    const reopened = expectOk(apply(settled, 'host', { kind: 'reopen' }))
    expect(reopened.settlement).toBeNull()
    expect(apply(reopened, 'a', { kind: 'addExpense', title: 'x', amount: 1 }).ok).toBe(true)
  })

  it('未結算時不能退回', () => {
    expect(apply(room(), 'host', { kind: 'reopen' })).toEqual({ ok: false, error: 'invalid' })
  })

  it('每次成功的操作都會遞增 version', () => {
    const state = room()
    expect(expectOk(apply(state, 'a', { kind: 'addExpense', title: 'x', amount: 1 })).version).toBe(state.version + 1)
  })
})
