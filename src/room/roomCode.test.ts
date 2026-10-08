import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, generateRoomCode, hostPeerId, normalizeRoomCode } from './roomCode'

describe('generateRoomCode', () => {
  it('產生 6 碼且只包含允許的字元', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode()
      expect(code).toHaveLength(6)
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch)
    }
  })

  it('不包含容易混淆的字元', () => {
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch)
  })

  it('依亂數來源對應字元', () => {
    const code = generateRoomCode(() => new Uint32Array([0, 1, 2, 3, 4, ROOM_CODE_ALPHABET.length]))
    expect(code).toBe('ABCDEA')
  })
})

describe('normalizeRoomCode', () => {
  it('轉大寫並移除空白與連字號', () => {
    expect(normalizeRoomCode(' abc-def ')).toBe('ABCDEF')
    expect(normalizeRoomCode('ab cd 23')).toBe('ABCD23')
  })

  it('長度不符或含不允許字元時回傳 null', () => {
    expect(normalizeRoomCode('ABCDE')).toBeNull()
    expect(normalizeRoomCode('ABCDEFG')).toBeNull()
    expect(normalizeRoomCode('ABCDE0')).toBeNull()
    expect(normalizeRoomCode('')).toBeNull()
  })
})

describe('hostPeerId', () => {
  it('加上前綴', () => {
    expect(hostPeerId('ABCDEF')).toBe('aa-room-ABCDEF')
  })
})
