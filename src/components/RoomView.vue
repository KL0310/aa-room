<script setup lang="ts">
import { computed, ref } from 'vue'
import { NOTE_MAX_LENGTH } from '../room/roomState'
import type { RoomState } from '../room/types'
import type { ConnectionKind, TransportStatus } from '../transport/types'
import type { RoomNotice, Role } from '../useRoomSession'
import QrCode from './QrCode.vue'

const props = defineProps<{
  role: Role
  roomCode: string
  state: RoomState | null
  status: TransportStatus
  notice: RoomNotice | null
  clientId: string
  connectionKinds: Record<string, ConnectionKind>
  joinUrl: string
}>()

const emit = defineEmits<{
  addNote: [text: string]
  leave: []
}>()

const noteText = ref('')
const copied = ref(false)
const showShare = ref(props.role === 'host')

const isHost = computed(() => props.role === 'host')

const statusText = computed(() => {
  const s = props.status
  switch (s.kind) {
    case 'connecting':
      return isHost.value ? '正在開啟房間…' : '正在連線到房主…'
    case 'ready':
      return isHost.value ? '房間已開啟' : '已連上房主'
    case 'reconnecting':
      return `連線中斷，重新連線中（第 ${s.attempt} 次）`
    case 'closed':
      return '已離線'
    case 'failed':
      return {
        'room-not-found': '找不到這個房間，請確認房號，或房主是否還在線上',
        'room-code-taken': '房號已被使用',
        'browser-unsupported': '這個瀏覽器不支援 P2P 連線',
        unknown: '連線失敗',
      }[s.reason]
  }
  return ''
})

const noticeText = computed(() => {
  switch (props.notice) {
    case 'opened-in-other-tab':
      return '這個房間已經在此瀏覽器的其他分頁開啟，請回到該分頁操作'
    case 'same-device-as-host':
      return '這個瀏覽器就是房主，請改用其他裝置或無痕視窗加入'
    case 'invalid-message':
      return '房主無法處理這個請求'
    default:
      return ''
  }
})

const memberName = computed(() => {
  const names = new Map(props.state?.members.map((m) => [m.id, m.nickname]))
  return (id: string) => names.get(id) ?? '（未知）'
})

const kindLabel: Record<ConnectionKind, string> = {
  direct: '直連',
  relay: '中繼',
  unknown: '偵測中',
}

/** 房主看每位成員的連線；成員只看自己到房主的連線，所以標在房主那一列 */
function memberKind(memberId: string): ConnectionKind | null {
  if (memberId === props.clientId) return null
  return props.connectionKinds[memberId] ?? null
}

function submitNote() {
  const text = noteText.value.trim()
  if (!text || props.status.kind !== 'ready') return
  emit('addNote', text)
  noteText.value = ''
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.joinUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // 不支援剪貼簿時，使用者仍可手動長按複製連結
  }
}

function confirmLeave() {
  const message = isHost.value ? '關閉房間後，其他人將無法再同步。確定要離開？' : '確定要離開房間？'
  if (confirm(message)) emit('leave')
}
</script>

<template>
  <section class="room">
    <header class="room-header">
      <div>
        <p class="label">房號</p>
        <p class="code big">{{ roomCode }}</p>
      </div>
      <div class="header-actions">
        <button class="small" @click="showShare = !showShare">{{ showShare ? '收起' : '邀請' }}</button>
        <button class="small ghost" @click="confirmLeave">離開</button>
      </div>
    </header>

    <p class="status" :class="status.kind" role="status">
      <span class="dot" />{{ statusText }}
    </p>
    <p v-if="noticeText" class="error">{{ noticeText }}</p>

    <div v-if="showShare" class="card share">
      <QrCode :text="joinUrl" />
      <p class="hint">用手機相機掃描，或分享以下連結</p>
      <div class="link-row">
        <input :value="joinUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="small" @click="copyLink">{{ copied ? '已複製' : '複製' }}</button>
      </div>
    </div>

    <template v-if="state">
      <div class="card">
        <h2>成員 <span class="count">{{ state.members.length }}</span></h2>
        <ul class="members">
          <li v-for="m in state.members" :key="m.id">
            <span class="presence" :class="{ online: m.online }" :title="m.online ? '在線' : '離線'" />
            <span class="name">{{ m.nickname }}</span>
            <span v-if="m.id === state.hostId" class="tag">房主</span>
            <span v-if="m.id === clientId" class="tag me">我</span>
            <span v-if="memberKind(m.id)" class="tag kind" :class="memberKind(m.id)!">
              {{ kindLabel[memberKind(m.id)!] }}
            </span>
          </li>
        </ul>
      </div>

      <div class="card">
        <h2>同步測試</h2>
        <p class="hint">任何人新增的項目都會即時出現在所有人的畫面上</p>
        <ul v-if="state.notes.length" class="notes">
          <li v-for="n in state.notes" :key="n.id">
            <span class="author">{{ memberName(n.authorId) }}</span>
            <span>{{ n.text }}</span>
          </li>
        </ul>
        <form class="note-form" @submit.prevent="submitNote">
          <input v-model="noteText" :maxlength="NOTE_MAX_LENGTH" placeholder="輸入文字" />
          <button :disabled="!noteText.trim() || status.kind !== 'ready'">新增</button>
        </form>
      </div>
    </template>
    <p v-else-if="status.kind !== 'failed' && !notice" class="hint center">等待房間資料…</p>
  </section>
</template>
