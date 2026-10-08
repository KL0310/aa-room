import { describe, expect, it } from 'vitest'
import { addNote, createRoom, joinMember, resetPresence, setMemberOnline } from './roomState'

const base = () => createRoom('ABCDEF', 'host', '房主')

describe('createRoom', () => {
  it('房主是第一位成員且在線', () => {
    const state = base()
    expect(state.members).toEqual([{ id: 'host', nickname: '房主', online: true }])
    expect(state.version).toBe(1)
  })
})

describe('joinMember', () => {
  it('新成員加入', () => {
    const state = joinMember(base(), 'a', ' 小明 ')
    expect(state.members[1]).toEqual({ id: 'a', nickname: '小明', online: true })
    expect(state.version).toBe(2)
  })

  it('同一個 id 重連時沿用原本的成員並更新暱稱', () => {
    let state = joinMember(base(), 'a', '小明')
    state = setMemberOnline(state, 'a', false)
    state = joinMember(state, 'a', '明明')
    expect(state.members).toHaveLength(2)
    expect(state.members[1]).toEqual({ id: 'a', nickname: '明明', online: true })
  })

  it('暱稱為空白時不變更', () => {
    const state = base()
    expect(joinMember(state, 'a', '   ')).toBe(state)
  })

  it('暱稱超過長度會被截斷', () => {
    const state = joinMember(base(), 'a', 'x'.repeat(50))
    expect(state.members[1]?.nickname).toHaveLength(20)
  })
})

describe('setMemberOnline', () => {
  it('狀態沒變或成員不存在時回傳原 state', () => {
    const state = base()
    expect(setMemberOnline(state, 'host', true)).toBe(state)
    expect(setMemberOnline(state, 'nobody', false)).toBe(state)
  })
})

describe('addNote', () => {
  it('成員可以新增', () => {
    const state = addNote(base(), 'host', ' 晚餐 ', 'n1', 100)
    expect(state.notes).toEqual([{ id: 'n1', authorId: 'host', text: '晚餐', createdAt: 100 }])
  })

  it('非成員或空白內容不變更', () => {
    const state = base()
    expect(addNote(state, 'stranger', '晚餐', 'n1', 100)).toBe(state)
    expect(addNote(state, 'host', '  ', 'n1', 100)).toBe(state)
  })
})

describe('resetPresence', () => {
  it('只有房主保持在線', () => {
    const state = resetPresence(joinMember(base(), 'a', '小明'))
    expect(state.members.map((m) => m.online)).toEqual([true, false])
  })
})
