import type { ConnectionKind } from './types'

/** 從 WebRTC 統計資料找出目前使用中的 candidate pair，判斷是直連還是經由 TURN 中繼 */
export async function detectConnectionKind(pc: RTCPeerConnection | undefined): Promise<ConnectionKind> {
  if (!pc) return 'unknown'
  try {
    const stats = await pc.getStats()
    let pairId: string | undefined
    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        pairId = report.selectedCandidatePairId
      }
    })
    let pair: RTCIceCandidatePairStats | undefined
    stats.forEach((report) => {
      if (report.type !== 'candidate-pair') return
      // Firefox 沒有 transport.selectedCandidatePairId，改看 selected 欄位
      const selected = pairId ? report.id === pairId : (report as { selected?: boolean }).selected
      if (selected || (!pairId && !pair && report.nominated && report.state === 'succeeded')) {
        pair = report
      }
    })
    if (!pair) return 'unknown'
    const local = stats.get(pair.localCandidateId)
    const remote = stats.get(pair.remoteCandidateId)
    if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') return 'relay'
    return 'direct'
  } catch {
    return 'unknown'
  }
}
