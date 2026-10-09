export interface Member {
  /** 等同該成員的 clientId，重連時用來認回身分 */
  id: string
  nickname: string
  online: boolean
  joinedAt: number
}

export interface Expense {
  id: string
  payerId: string
  title: string
  /** 正整數，不區分幣別 */
  amount: number
  /**
   * 記錄「沒有參與」的成員，而不是有參與的成員：
   * 新增帳目時自然是全員參與，之後才加入的成員也會自動參與既有帳目
   */
  excludedIds: string[]
  createdAt: number
}

/** direct：欠款人各自轉給應收款的人；hub：由付款總額最多的人統一收付 */
export type SettlementMode = 'direct' | 'hub'

/** 每筆帳目每人的分攤額除不盡時，ceil 無條件進位（代墊人多收），floor 無條件捨去（代墊人吸收） */
export type RoundingMode = 'ceil' | 'floor'

export interface Transfer {
  fromId: string
  toId: string
  amount: number
}

export interface Balance {
  /** 實際付出的總額 */
  paid: number
  /** 自己應負擔的總額 */
  share: number
  /** 正數為應收，負數為應付 */
  net: number
}

/** 結算當下的快照；結算後才加入的成員不會出現在 balances 中 */
export interface Settlement {
  mode: SettlementMode
  rounding: RoundingMode
  hubId: string | null
  balances: Record<string, Balance>
  transfers: Transfer[]
  settledAt: number
}

export interface RemovedMember {
  id: string
  nickname: string
}

export interface JoinRequest {
  id: string
  nickname: string
  requestedAt: number
}

export interface RoomState {
  code: string
  /** 房主自訂的房間名稱 */
  name: string
  hostId: string
  members: Member[]
  expenses: Expense[]
  /** 被房主剔除的成員；重新加入需要房主同意 */
  removed: RemovedMember[]
  joinRequests: JoinRequest[]
  /** 不為 null 表示已結算，此時帳目鎖定 */
  settlement: Settlement | null
  /** 每次變更遞增，client 用來忽略較舊的 snapshot */
  version: number
}
