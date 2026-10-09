import { describe, expect, it, vi } from 'vitest'
import { FakeTransport } from '../transport/fakeTransport'
import { ClientRoom } from './clientRoom'
import { PROTOCOL_VERSION, type ClientMessage } from './protocol'
import { createRoom, joinMember } from './roomState'

function setup() {
  const transport = new FakeTransport<ClientMessage>()
  const onState = vi.fn()
  const onError = vi.fn()
  const onMembership = vi.fn()
  const room = new ClientRoom(transport, 'me', '小明', { onState, onError, onMembership })
  return { transport, room, onState, onError, onMembership }
}

const hello = { type: 'hello', protocolVersion: PROTOCOL_VERSION, clientId: 'me', nickname: '小明' }

describe('ClientRoom', () => {
  it('每次連上房主都會重新報到', () => {
    const { transport } = setup()
    transport.simulateJoin('host-peer')
    transport.simulateLeave('host-peer')
    transport.simulateJoin('host-peer')
    expect(transport.sentTo('host-peer')).toEqual([hello, hello])
  })

  it('沿用已連上的連線時，建立後立即報到', () => {
    const transport = new FakeTransport<ClientMessage>()
    const callbacks = { onState: vi.fn(), onError: vi.fn(), onMembership: vi.fn() }
    new ClientRoom(transport, 'me', '小明', callbacks, 'host-peer')
    expect(transport.sentTo('host-peer')).toEqual([hello])
  })

  it('忽略加入前的房間資訊回覆', () => {
    const { transport, onState, onMembership } = setup()
    transport.simulateMessage('host-peer', { type: 'roomInfo', info: { name: 'x', hostNickname: 'y' } })
    expect(onState).not.toHaveBeenCalled()
    expect(onMembership).not.toHaveBeenCalled()
  })

  it('未連線時操作不會送出', () => {
    const { transport, room } = setup()
    room.dispatch({ kind: 'addExpense', title: '晚餐', amount: 100 })
    expect(transport.sent).toEqual([])
  })

  it('連線後操作送給房主', () => {
    const { transport, room } = setup()
    transport.simulateJoin('host-peer')
    room.dispatch({ kind: 'addExpense', title: '晚餐', amount: 100 })
    expect(transport.sentTo('host-peer')[1]).toEqual({
      type: 'intent',
      intent: { kind: 'addExpense', title: '晚餐', amount: 100 },
    })
  })

  it('收到 state 時成為成員；忽略比目前版本舊的 snapshot', () => {
    const { transport, onState, onMembership } = setup()
    const v1 = createRoom('ABCDEF', 'host', '房主', 0)
    const v2 = joinMember(v1, 'me', '小明', 1)
    transport.simulateMessage('host-peer', { type: 'state', state: v2 })
    transport.simulateMessage('host-peer', { type: 'state', state: v1 })
    expect(onState).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenLastCalledWith(v2)
    expect(onMembership).toHaveBeenLastCalledWith('member')
  })

  it('轉交房主回覆的錯誤', () => {
    const { transport, onError } = setup()
    transport.simulateMessage('host-peer', { type: 'error', reason: 'same-device-as-host' })
    expect(onError).toHaveBeenCalledWith('same-device-as-host')
  })

  it('被剔除後申請重新加入，重連時持續帶著申請，被拒絕後停止', () => {
    const { transport, room, onMembership } = setup()
    transport.simulateJoin('host-peer')
    transport.simulateMessage('host-peer', { type: 'removed' })
    expect(onMembership).toHaveBeenLastCalledWith('removed')

    room.requestRejoin()
    expect(transport.sentTo('host-peer')[1]).toEqual({ ...hello, requestRejoin: true })
    transport.simulateMessage('host-peer', { type: 'pending' })
    expect(onMembership).toHaveBeenLastCalledWith('pending')

    transport.simulateLeave('host-peer')
    transport.simulateJoin('host-peer')
    expect(transport.sentTo('host-peer')[2]).toEqual({ ...hello, requestRejoin: true })

    transport.simulateMessage('host-peer', { type: 'rejected' })
    expect(onMembership).toHaveBeenLastCalledWith('rejected')
    transport.simulateLeave('host-peer')
    transport.simulateJoin('host-peer')
    expect(transport.sentTo('host-peer')[3]).toEqual(hello)
  })
})
