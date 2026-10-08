import type { PeerOptions } from 'peerjs'

/**
 * PeerJS 連線設定，皆可用環境變數覆寫（見 .env.example）。
 * 未設定時使用 PeerJS 的預設值：公用 signaling server（0.peerjs.com）、Google STUN 與 PeerJS 公用 TURN。
 */
export function buildPeerOptions(): PeerOptions {
  const env = import.meta.env
  const options: PeerOptions = { debug: 1 }

  if (env.VITE_PEER_HOST) {
    options.host = env.VITE_PEER_HOST
    if (env.VITE_PEER_PORT) options.port = Number(env.VITE_PEER_PORT)
    if (env.VITE_PEER_PATH) options.path = env.VITE_PEER_PATH
    options.secure = env.VITE_PEER_SECURE !== 'false'
  }

  const turnUrls = (env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((u: string) => u.trim())
    .filter(Boolean)
  if (turnUrls.length > 0) {
    options.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: turnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL },
      ],
    }
  }
  return options
}
