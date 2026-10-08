import type { Unsubscribe } from './types'

/** 極簡的事件註冊工具，避免各個 transport 實作重複寫 listener 管理 */
export class Listeners<TArgs extends unknown[]> {
  private handlers = new Set<(...args: TArgs) => void>()

  add(handler: (...args: TArgs) => void): Unsubscribe {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  emit(...args: TArgs): void {
    for (const handler of this.handlers) handler(...args)
  }

  clear(): void {
    this.handlers.clear()
  }
}
