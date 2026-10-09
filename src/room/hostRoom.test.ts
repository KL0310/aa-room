import { beforeEach, describe, expect, it } from 'vitest'
import { FakeTransport } from '../transport/fakeTransport'
import { HostRoom } from './hostRoom'
import { PROTOCOL_VERSION, type HostMessage, type Intent } from './protocol'
import { createRoom, joinMember } from './roomState'
import { fakeContext } from './testUtils'
import type { RoomState } from './types'

function hello(clientId: string, nickname: string, requestRejoin?: boolean) {
  return { type: 'hello', protocolVersion: PROTOCOL_VERSION, clientId, nickname, requestRejoin }
}

function intent(i: Intent) {
  return { type: 'intent', intent: i }
}

function lastState(transport: FakeTransport<HostMessage>, peerId: string): RoomState | undefined {
  const messages = transport.sentTo(peerId).filter((m) => m.type === 'state')
  const last = messages[messages.length - 1]
  return last?.type === 'state' ? last.state : undefined
}

function lastMessage(transport: FakeTransport<HostMessage>, peerId: string): HostMessage | undefined {
  const messages = transport.sentTo(peerId)
  return messages[messages.length - 1]
}

describe('HostRoom', () => {
  let transport: FakeTransport<HostMessage>
  let room: HostRoom
  let changes: RoomState[]

  beforeEach(() => {
    transport = new FakeTransport<HostMessage>()
    changes = []
    room = new HostRoom(transport, createRoom('ABCDEF', 'host', '房主', 0), (s) => changes.push(s), fakeContext())
  })

  it('成員報到後加入名單，並收到完整 state', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    expect(lastState(transport, 'peer-a')?.members.map((m) => m.nickname)).toEqual(['房主', '小明'])
    expect(room.current.members).toHaveLength(2)
  })

  it('協定版本不一致時拒絕', () => {
    transport.simulateMessage('peer-a', { ...hello('a', '小明'), protocolVersion: 1 })
    expect(transport.sentTo('peer-a')).toEqual([{ type: 'error', reason: 'version-mismatch' }])
    expect(room.current.members).toHaveLength(1)
  })

  it('變更會廣播給所有已報到的成員，但不會送給尚未報到的連線', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    transport.simulateMessage('peer-b', hello('b', '小華'))
    transport.simulateJoin('peer-c')
    transport.simulateMessage('peer-a', intent({ kind: 'addExpense', title: '晚餐', amount: 300 }))

    expect(lastState(transport, 'peer-a')?.expenses).toHaveLength(1)
    expect(lastState(transport, 'peer-b')?.expenses[0]).toMatchObject({ payerId: 'a', title: '晚餐', amount: 300 })
    expect(transport.sentTo('peer-c')).toEqual([])
  })

  it('成員的操作以該連線報到的身分執行', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    transport.simulateMessage('peer-a', intent({ kind: 'addExpense', title: 'x', amount: 1, payerId: 'host' }))
    // 一般成員不能替房主新增帳目
    expect(room.current.expenses).toEqual([])
  })

  it('房主自己的操作也會廣播', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    expect(room.dispatch({ kind: 'addExpense', title: '計程車', amount: 300 }).ok).toBe(true)
    expect(lastState(transport, 'peer-a')?.expenses[0]?.payerId).toBe('host')
  })

  it('未報到的連線送來的操作會被忽略', () => {
    transport.simulateMessage('peer-x', intent({ kind: 'addExpense', title: '偷塞', amount: 1 }))
    expect(room.current.expenses).toEqual([])
  })

  it('格式錯誤的訊息回覆錯誤', () => {
    transport.simulateMessage('peer-a', { type: 'hack' })
    transport.simulateMessage('peer-a', intent({ kind: 'addExpense', title: 'x' } as unknown as Intent))
    expect(transport.sentTo('peer-a')).toEqual([
      { type: 'error', reason: 'invalid-message' },
      { type: 'error', reason: 'invalid-message' },
    ])
  })

  it('不能用房主的 clientId 報到', () => {
    transport.simulateMessage('peer-a', hello('host', '冒牌'))
    expect(transport.sentTo('peer-a')).toEqual([{ type: 'error', reason: 'same-device-as-host' }])
    expect(room.current.members).toHaveLength(1)
  })

  it('斷線時標為離線，用新連線重連後恢復在線且不會重複加入', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    transport.simulateLeave('peer-a')
    expect(room.current.members[1]?.online).toBe(false)
    transport.simulateMessage('peer-a2', hello('a', '小明'))
    expect(room.current.members).toHaveLength(2)
    expect(room.current.members[1]?.online).toBe(true)
  })

  it('舊連線比新連線晚斷開時，不會把成員誤標為離線', () => {
    transport.simulateMessage('peer-a', hello('a', '小明'))
    transport.simulateMessage('peer-a2', hello('a', '小明'))
    transport.simulateLeave('peer-a')
    expect(room.current.members[1]?.online).toBe(true)
  })

  it('恢復房間時，除了房主以外都先標為離線', () => {
    const saved = joinMember(createRoom('ABCDEF', 'host', '房主', 0), 'a', '小明', 1)
    const restored = new HostRoom(new FakeTransport<HostMessage>(), saved, () => {})
    expect(restored.current.members.map((m) => m.online)).toEqual([true, false])
  })

  it('每次變更都會通知 onChange', () => {
    const before = changes.length
    transport.simulateMessage('peer-a', hello('a', '小明'))
    expect(changes.length).toBe(before + 1)
  })

  describe('剔除與重新加入', () => {
    beforeEach(() => {
      transport.simulateMessage('peer-a', hello('a', '小明'))
      transport.simulateMessage('peer-b', hello('b', '小華'))
      room.dispatch({ kind: 'removeMember', memberId: 'b' })
    })

    it('被剔除的人收到 removed，且不再收到 state 廣播', () => {
      expect(lastMessage(transport, 'peer-b')).toEqual({ type: 'removed' })
      // 剔除那次的 state 不會送給他，所以他最後收到的 state 仍包含自己
      expect(lastState(transport, 'peer-b')?.members.map((m) => m.id)).toContain('b')
      room.dispatch({ kind: 'addExpense', title: 'x', amount: 1 })
      expect(lastMessage(transport, 'peer-b')).toEqual({ type: 'removed' })
      expect(lastState(transport, 'peer-a')?.members.map((m) => m.id)).toEqual(['host', 'a'])
    })

    it('一般重連只會收到 removed，不會自動送出申請', () => {
      transport.simulateMessage('peer-b2', hello('b', '小華'))
      expect(transport.sentTo('peer-b2')).toEqual([{ type: 'removed' }])
      expect(room.current.joinRequests).toEqual([])
    })

    it('申請重新加入 → 房主同意 → 收到 state 並回到成員名單', () => {
      transport.simulateMessage('peer-b', hello('b', '小華', true))
      expect(lastMessage(transport, 'peer-b')).toEqual({ type: 'pending' })
      expect(room.current.joinRequests.map((r) => r.id)).toEqual(['b'])

      room.dispatch({ kind: 'resolveJoinRequest', memberId: 'b', approve: true })
      expect(lastState(transport, 'peer-b')?.members.map((m) => m.id)).toEqual(['host', 'a', 'b'])

      room.dispatch({ kind: 'addExpense', title: 'y', amount: 2 })
      expect(lastState(transport, 'peer-b')?.expenses).toHaveLength(1)
    })

    it('房主拒絕 → 收到 rejected', () => {
      transport.simulateMessage('peer-b', hello('b', '小華', true))
      room.dispatch({ kind: 'resolveJoinRequest', memberId: 'b', approve: false })
      expect(lastMessage(transport, 'peer-b')).toEqual({ type: 'rejected' })
      expect(room.current.joinRequests).toEqual([])
    })
  })
})
