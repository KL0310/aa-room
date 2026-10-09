import { shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  /** 危險動作（刪除、移出）以警示色呈現確認按鈕 */
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

/** 目前顯示中的確認卡片；由 ConfirmDialog 元件負責呈現 */
export const pendingConfirm = shallowRef<PendingConfirm | null>(null)

/** 取代瀏覽器內建的 confirm()，回傳使用者是否確認 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  pendingConfirm.value?.resolve(false)
  return new Promise((resolve) => {
    pendingConfirm.value = { ...options, resolve }
  })
}

export function resolveConfirm(ok: boolean): void {
  const current = pendingConfirm.value
  pendingConfirm.value = null
  current?.resolve(ok)
}
