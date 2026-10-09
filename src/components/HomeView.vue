<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeRoomCode } from '../room/roomCode'
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, cleanNickname, defaultRoomName } from '../room/roomState'
import AppLogo from './AppLogo.vue'
import HelpSheet from './HelpSheet.vue'

const props = defineProps<{
  initialCode: string | null
  initialNickname: string
}>()

const emit = defineEmits<{
  create: [nickname: string, roomName: string]
  join: [code: string, nickname: string]
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
        <div class="invite-code">
          <span class="hint">受邀加入房間</span>
          <span class="mono code-big">{{ invitedCode }}</span>
        </div>
        <button class="ink block" :disabled="!cleanedNickname || !invitedCode" @click="join">加入房間</button>
        <button class="text-link" @click="invited = false">改為開新房間</button>
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
