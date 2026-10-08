import { beforeEach, describe, expect, it } from 'vitest'
import { FakeTransport } from '../transport/fakeTransport'
import { HostRoom } from './hostRoom'
import type { HostMessage } from './protocol'
import { createRoom, joinMember } from './roomState'
import type { RoomState } from './types'

function lastState(transport: FakeTransport<HostMessage>, peerId: string): RoomState | undefined {
  const messages = transport.sentTo(peerId).filter((m) => m.type === 'state')
  const last = messages[messages.length - 1]
  return last?.type === 'state' ? last.state : undefined
}

describe('HostRoom', () => {
  let transport: FakeTransport<HostMessage>
  let room: HostRoom
  let changes: RoomState[]
  let idSeq: number

  beforeEach(() => {
    transport = new FakeTransport<HostMessage>()
    changes = []
    idSeq = 0
    room = new HostRoom(transport, createRoom('ABCDEF', 'host', '房主'), (s) => changes.push(s), {
      newId: () => `id-${++idSeq}`,
      now: () => 1000,
    })
  })

  it('成員報到後加入名單，並收到完整 state', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    const state = lastState(transport, 'peer-a')
    expect(state?.members.map((m) => m.nickname)).toEqual(['房主', '小明'])
    expect(room.current.members).toHaveLength(2)
  })

  it('變更會廣播給所有已報到的成員，但不會送給尚未報到的連線', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    transport.simulateMessage('peer-b', { type: 'hello', clientId: 'b', nickname: '小華' })
    transport.simulateJoin('peer-c')
    transport.simulateMessage('peer-a', { type: 'addNote', text: '晚餐' })

    expect(lastState(transport, 'peer-a')?.notes).toHaveLength(1)
    expect(lastState(transport, 'peer-b')?.notes).toEqual([
      { id: 'id-1', authorId: 'a', text: '晚餐', createdAt: 1000 },
    ])
    expect(transport.sentTo('peer-c')).toEqual([])
  })

  it('房主自己新增的項目也會廣播', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    room.addNote('計程車')
    expect(lastState(transport, 'peer-a')?.notes[0]?.authorId).toBe('host')
  })

  it('未報到的連線送來的意圖會被忽略', () => {
    transport.simulateMessage('peer-x', { type: 'addNote', text: '偷塞' })
    expect(room.current.notes).toEqual([])
  })

  it('格式錯誤的訊息回覆錯誤', () => {
    transport.simulateMessage('peer-a', { type: 'hack' })
    expect(transport.sentTo('peer-a')).toEqual([{ type: 'error', reason: 'invalid-message' }])
  })

  it('不能用房主的 clientId 報到', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'host', nickname: '冒牌' })
    expect(transport.sentTo('peer-a')).toEqual([{ type: 'error', reason: 'same-device-as-host' }])
    expect(room.current.members).toHaveLength(1)
  })

  it('斷線時標為離線，用新連線重連後恢復在線且不會重複加入', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    transport.simulateLeave('peer-a')
    expect(room.current.members[1]?.online).toBe(false)

    transport.simulateMessage('peer-a2', { type: 'hello', clientId: 'a', nickname: '小明' })
    expect(room.current.members).toHaveLength(2)
    expect(room.current.members[1]?.online).toBe(true)
  })

  it('舊連線比新連線晚斷開時，不會把成員誤標為離線', () => {
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    transport.simulateMessage('peer-a2', { type: 'hello', clientId: 'a', nickname: '小明' })
    transport.simulateLeave('peer-a')
    expect(room.current.members[1]?.online).toBe(true)
  })

  it('恢復房間時，除了房主以外都先標為離線', () => {
    const saved = joinMember(createRoom('ABCDEF', 'host', '房主'), 'a', '小明')
    const restored = new HostRoom(new FakeTransport<HostMessage>(), saved, () => {})
    expect(restored.current.members.map((m) => m.online)).toEqual([true, false])
  })

  it('每次變更都會通知 onChange', () => {
    const before = changes.length
    transport.simulateMessage('peer-a', { type: 'hello', clientId: 'a', nickname: '小明' })
    expect(changes.length).toBe(before + 1)
  })
})
