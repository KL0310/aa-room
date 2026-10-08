const RETRIES = 5
const RETRY_DELAY_MS = 300

/**
 * 用 Web Locks 確保同一個瀏覽器只有一個分頁在操作同一個房間。
 * 同一個瀏覽器的分頁共用 clientId 與保存的 session，同時開啟會互相干擾（例如兩個分頁都想當房主）。
 * 重新整理時舊頁面的鎖可能稍晚才釋放，所以會短暫重試。
 *
 * 取得成功回傳釋放函式；已被其他分頁持有則回傳 null；瀏覽器不支援時視為成功。
 */
export async function acquireTabLock(name: string): Promise<(() => void) | null> {
  if (!navigator.locks) return () => {}
  for (let i = 0; i < RETRIES; i++) {
    const release = await tryAcquire(name)
    if (release) return release
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
  return null
}

function tryAcquire(name: string): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null)
        return
      }
      // 回傳的 promise 未完成前會一直持有鎖
      return new Promise<void>((release) => resolve(() => release()))
    })
  })
}
