import type { Member, RoomState } from './types'

export const NICKNAME_MAX_LENGTH = 20
export const NOTE_MAX_LENGTH = 200

// 以下皆為純函式：不修改傳入的 state，失敗時回傳原 state，方便測試與比對是否有變更

export function createRoom(code: string, hostId: string, hostNickname: string): RoomState {
  return {
    code,
    hostId,
    members: [{ id: hostId, nickname: cleanNickname(hostNickname), online: true }],
    notes: [],
    version: 1,
  }
}

/** 新成員加入，或既有成員重連（沿用原本的 id，暱稱以最新的為準） */
export function joinMember(state: RoomState, id: string, nickname: string): RoomState {
  const name = cleanNickname(nickname)
  if (!name) return state
  const existing = state.members.find((m) => m.id === id)
  const members: Member[] = existing
    ? state.members.map((m) => (m.id === id ? { ...m, nickname: name, online: true } : m))
    : [...state.members, { id, nickname: name, online: true }]
  return bump({ ...state, members })
}

export function setMemberOnline(state: RoomState, id: string, online: boolean): RoomState {
  const member = state.members.find((m) => m.id === id)
  if (!member || member.online === online) return state
  return bump({
    ...state,
    members: state.members.map((m) => (m.id === id ? { ...m, online } : m)),
  })
}

export function addNote(
  state: RoomState,
  authorId: string,
  text: string,
  noteId: string,
  now: number,
): RoomState {
  const trimmed = text.trim().slice(0, NOTE_MAX_LENGTH)
  if (!trimmed) return state
  if (!state.members.some((m) => m.id === authorId)) return state
  return bump({
    ...state,
    notes: [...state.notes, { id: noteId, authorId, text: trimmed, createdAt: now }],
  })
}

export function cleanNickname(nickname: string): string {
  return nickname.trim().slice(0, NICKNAME_MAX_LENGTH)
}

function bump(state: RoomState): RoomState {
  return { ...state, version: state.version + 1 }
}

/** 房主恢復房間時，除了房主以外的成員都要重新連線，先全部標為離線 */
export function resetPresence(state: RoomState): RoomState {
  return {
    ...state,
    members: state.members.map((m) => ({ ...m, online: m.id === state.hostId })),
  }
}
