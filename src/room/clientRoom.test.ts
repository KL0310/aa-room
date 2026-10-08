import { describe, expect, it, vi } from 'vitest'
import { FakeTransport } from '../transport/fakeTransport'
import { ClientRoom } from './clientRoom'
import type { ClientMessage } from './protocol'
import { createRoom, joinMember } from './roomState'

function setup() {
  const transport = new FakeTransport<ClientMessage>()
  const onState = vi.fn()
  const onError = vi.fn()
  const room = new ClientRoom(transport, 'me', '小明', { onState, onError })
  return { transport, room, onState, onError }
}

describe('ClientRoom', () => {
  it('每次連上房主都會重新報到', () => {
    const { transport } = setup()
    transport.simulateJoin('host-peer')
    transport.simulateLeave('host-peer')
    transport.simulateJoin('host-peer')
    expect(transport.sentTo('host-peer')).toEqual([
      { type: 'hello', clientId: 'me', nickname: '小明' },
      { type: 'hello', clientId: 'me', nickname: '小明' },
    ])
  })

  it('未連線時新增項目不會送出', () => {
    const { transport, room } = setup()
    room.addNote('晚餐')
    expect(transport.sent).toEqual([])
  })

  it('連線後新增項目送給房主', () => {
    const { transport, room } = setup()
    transport.simulateJoin('host-peer')
    room.addNote('晚餐')
    expect(transport.sentTo('host-peer')[1]).toEqual({ type: 'addNote', text: '晚餐' })
  })

  it('忽略比目前版本舊的 snapshot', () => {
    const { transport, onState } = setup()
    const v1 = createRoom('ABCDEF', 'host', '房主')
    const v2 = joinMember(v1, 'me', '小明')
    transport.simulateMessage('host-peer', { type: 'state', state: v2 })
    transport.simulateMessage('host-peer', { type: 'state', state: v1 })
    expect(onState).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenLastCalledWith(v2)
  })

  it('轉交房主回覆的錯誤', () => {
    const { transport, onError } = setup()
    transport.simulateMessage('host-peer', { type: 'error', reason: 'same-device-as-host' })
    expect(onError).toHaveBeenCalledWith('same-device-as-host')
  })
})
