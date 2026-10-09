import type { RoomState } from './room/types'

const CLIENT_ID_KEY = 'aa-room:client-id'
const NICKNAME_KEY = 'aa-room:nickname'
const SESSION_KEY = 'aa-room:session'
const HOST_STATE_PREFIX = 'aa-room:host-state:'

export interface Session {
  code: string
  role: 'host' | 'member'
  nickname: string
}

// localStorage 在隱私模式或被封鎖時可能拋出例外，一律容錯，最差情況只是重整後無法自動恢復

export function getClientId(): string {
  let id = read(CLIENT_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    write(CLIENT_ID_KEY, id)
  }
  return id
}

export function loadNickname(): string {
  return read(NICKNAME_KEY) ?? ''
}

export function saveNickname(nickname: string): void {
  write(NICKNAME_KEY, nickname)
}

export function loadSession(): Session | null {
  return parse<Session>(read(SESSION_KEY))
}

export function saveSession(session: Session): void {
  write(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  remove(SESSION_KEY)
}

export function loadHostState(code: string): RoomState | null {
  const state = parse<RoomState>(read(HOST_STATE_PREFIX + code))
  // 舊版保存的資料格式不同，不沿用
  if (!state || typeof state.name !== 'string' || !Array.isArray(state.expenses) || !Array.isArray(state.removed)) return null
  return state
}

export function saveHostState(state: RoomState): void {
  write(HOST_STATE_PREFIX + state.code, JSON.stringify(state))
}

export function removeHostState(code: string): void {
  remove(HOST_STATE_PREFIX + code)
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 忽略：無法保存不影響當下使用
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
