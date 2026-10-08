export interface Member {
  /** 等同該成員的 clientId，重連時用來認回身分 */
  id: string
  nickname: string
  online: boolean
}

/** PoC 用來驗證雙向同步的簡易項目，之後會被帳目取代 */
export interface Note {
  id: string
  authorId: string
  text: string
  createdAt: number
}

export interface RoomState {
  code: string
  hostId: string
  members: Member[]
  notes: Note[]
  /** 每次變更遞增，client 用來忽略較舊的 snapshot */
  version: number
}
