/** 複製文字到剪貼簿；不支援或被拒絕時回傳 false */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
