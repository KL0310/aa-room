<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InviteInfo } from '../invitePreview'
import { normalizeRoomCode } from '../room/roomCode'
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, cleanNickname, defaultRoomName } from '../room/roomState'
import AppLogo from './AppLogo.vue'
import HelpSheet from './HelpSheet.vue'

const props = defineProps<{
  initialCode: string | null
  initialNickname: string
  inviteInfo: InviteInfo | null
}>()

const emit = defineEmits<{
  create: [nickname: string, roomName: string]
  join: [code: string, nickname: string]
  cancelInvite: []
}>()

const nickname = ref(props.initialNickname)
const roomName = ref('')
// 從 QR code / 分享連結進來時，只顯示加入房間
const invited = ref(props.initialCode !== null)
const showHelp = ref(false)

const cleanedNickname = computed(() => cleanNickname(nickname.value))
// 只能透過邀請連結（?room=）加入，首頁不提供輸入邀請碼
const invitedCode = computed(() => (props.initialCode ? normalizeRoomCode(props.initialCode) : null))
const roomNamePlaceholder = computed(() => defaultRoomName(cleanedNickname.value || '我'))

const inviteError = computed(() => {
  const info = props.inviteInfo
  if (info?.status !== 'failed') return ''
  switch (info.reason) {
    case 'room-not-found':
      return '找不到這個房間，房主可能已經離開或連結有誤'
    case 'version-mismatch':
      return '你和房主使用的版本不同，請兩邊都重新整理頁面。'
    case 'browser-unsupported':
      return '這個瀏覽器不支援 P2P 連線'
    default:
      return '暫時連不上房主'
  }
})

function cancelInvite() {
  invited.value = false
  emit('cancelInvite')
}

function create() {
  if (cleanedNickname.value) emit('create', cleanedNickname.value, roomName.value)
}

function join() {
  if (cleanedNickname.value && invitedCode.value) emit('join', invitedCode.value, cleanedNickname.value)
}
</script>

<template>
  <section class="home">
    <div class="home-top">
      <button type="button" class="icon-button outline" aria-label="這是什麼？" @click="showHelp = true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
      </button>
    </div>
    <header class="brand">
      <h1><AppLogo :size="60" horizontal /></h1>
      <p>聚會分帳，開個房間就好</p>
    </header>

    <div class="paper">
      <label class="field">
        <span class="field-label">你的暱稱</span>
        <input
          v-model="nickname"
          :maxlength="NICKNAME_MAX_LENGTH"
          autocomplete="nickname"
          @keyup.enter="invited ? join() : create()"
        />
      </label>

      <template v-if="invited">
        <div class="rule" />
        <div class="invite-target" role="status">
          <span class="hint">受邀加入</span>
          <template v-if="inviteInfo?.status === 'ready'">
            <strong class="invite-name">{{ inviteInfo.info.name }}</strong>
            <span class="hint">房主：{{ inviteInfo.info.hostNickname }}</span>
          </template>
          <template v-else-if="inviteInfo?.status === 'failed'">
            <span class="mono invite-code-fallback">{{ invitedCode }}</span>
            <p class="error">{{ inviteError }}</p>
          </template>
          <span v-else class="hint loading">正在讀取房間資訊…</span>
        </div>
        <button class="ink block" :disabled="!cleanedNickname || !invitedCode" @click="join">加入房間</button>
        <button class="text-link" @click="cancelInvite">改為開新房間</button>
      </template>

      <template v-else>
        <div class="rule" />
        <span class="mono-label">NEW ROOM</span>
        <label class="field">
          <span class="field-label">房間名稱（選填）</span>
          <input v-model="roomName" :maxlength="ROOM_NAME_MAX_LENGTH" :placeholder="roomNamePlaceholder" />
        </label>
        <button class="ink block" :disabled="!cleanedNickname" @click="create">開新房間</button>
      </template>
    </div>

    <HelpSheet v-if="showHelp" @close="showHelp = false" />
  </section>
</template>
