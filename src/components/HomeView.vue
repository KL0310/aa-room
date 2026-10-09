<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeRoomCode } from '../room/roomCode'
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, cleanNickname, defaultRoomName } from '../room/roomState'

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
const codeInput = ref(props.initialCode ?? '')
// 從 QR code / 分享連結進來時，只顯示加入房間
const invited = ref(props.initialCode !== null)

const cleanedNickname = computed(() => cleanNickname(nickname.value))
const normalizedCode = computed(() => normalizeRoomCode(codeInput.value))
const codeError = computed(() => codeInput.value.trim() !== '' && normalizedCode.value === null)
const roomNamePlaceholder = computed(() => defaultRoomName(cleanedNickname.value || '我'))

function create() {
  if (cleanedNickname.value) emit('create', cleanedNickname.value, roomName.value)
}

function join() {
  if (cleanedNickname.value && normalizedCode.value) emit('join', normalizedCode.value, cleanedNickname.value)
}
</script>

<template>
  <section class="home">
    <header class="brand">
      <span class="mono-label">P2P · NO SIGN-UP</span>
      <h1 class="mono">AA ROOM</h1>
      <p>聚會分帳，開個房間就好</p>
    </header>

    <div class="paper">
      <label class="field">
        <span class="field-label">你的暱稱</span>
        <input
          v-model="nickname"
          :maxlength="NICKNAME_MAX_LENGTH"
          placeholder="例如：小明"
          autocomplete="nickname"
          @keyup.enter="invited ? join() : undefined"
        />
      </label>

      <template v-if="invited">
        <div class="rule" />
        <div class="invite-code">
          <span class="hint">受邀加入房間</span>
          <span class="mono code-big">{{ normalizedCode }}</span>
        </div>
        <button class="ink block" :disabled="!cleanedNickname || !normalizedCode" @click="join">加入房間</button>
        <button class="text-link" @click="invited = false">改為開新房間或輸入其他邀請碼</button>
      </template>

      <template v-else>
        <div class="rule" />
        <span class="mono-label">NEW ROOM</span>
        <label class="field">
          <span class="field-label">房間名稱（選填）</span>
          <input v-model="roomName" :maxlength="ROOM_NAME_MAX_LENGTH" :placeholder="roomNamePlaceholder" />
        </label>
        <button class="ink block" :disabled="!cleanedNickname" @click="create">開新房間</button>

        <div class="rule" />
        <span class="mono-label">JOIN</span>
        <label class="field">
          <span class="field-label">邀請碼</span>
          <input
            v-model="codeInput"
            class="mono code-input"
            maxlength="7"
            placeholder="6 碼"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="join"
          />
        </label>
        <p v-if="codeError" class="error">邀請碼格式不正確</p>
        <button class="outline block" :disabled="!cleanedNickname || !normalizedCode" @click="join">加入房間</button>
      </template>
    </div>
  </section>
</template>
