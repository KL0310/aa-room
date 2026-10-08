// 排除容易混淆的字元：0/O、1/I/L
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

// 加上前綴，避免和其他使用公用 PeerServer 的服務撞 id
const PEER_ID_PREFIX = 'aa-room-'

export function generateRoomCode(random: (n: number) => Uint32Array = randomUint32): string {
  const values = random(ROOM_CODE_LENGTH)
  let code = ''
  for (const v of values) {
    code += ROOM_CODE_ALPHABET[v % ROOM_CODE_ALPHABET.length]
  }
  return code
}

/** 將使用者輸入整理成標準房號；格式不符時回傳 null */
export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null
  }
  return code
}

export function hostPeerId(code: string): string {
  return PEER_ID_PREFIX + code
}

function randomUint32(n: number): Uint32Array {
  return crypto.getRandomValues(new Uint32Array(n))
}
