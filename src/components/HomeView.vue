<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeRoomCode } from '../room/roomCode'
import { NICKNAME_MAX_LENGTH, cleanNickname } from '../room/roomState'

const props = defineProps<{
  initialCode: string | null
  initialNickname: string
}>()

const emit = defineEmits<{
  create: [nickname: string]
  join: [code: string, nickname: string]
}>()

const nickname = ref(props.initialNickname)
const codeInput = ref(props.initialCode ?? '')
// 從 QR code / 分享連結進來時，只顯示加入房間
const invited = ref(props.initialCode !== null)

const cleanedNickname = computed(() => cleanNickname(nickname.value))
const normalizedCode = computed(() => normalizeRoomCode(codeInput.value))
const codeError = computed(() => codeInput.value.trim() !== '' && normalizedCode.value === null)

function create() {
  if (cleanedNickname.value) emit('create', cleanedNickname.value)
}

function join() {
  if (cleanedNickname.value && normalizedCode.value) emit('join', normalizedCode.value, cleanedNickname.value)
}
</script>

<template>
  <section class="home">
    <header class="brand">
      <h1>AA Room</h1>
      <p>聚會分帳，開個房間就好</p>
    </header>

    <div class="card">
      <label class="field">
        <span>你的暱稱</span>
        <input
          v-model="nickname"
          :maxlength="NICKNAME_MAX_LENGTH"
          placeholder="例如：小明"
          autocomplete="nickname"
          autofocus
          @keyup.enter="invited ? join() : undefined"
        />
      </label>
    </div>

    <div v-if="invited" class="card">
      <p class="invite">受邀加入房間 <strong class="code">{{ normalizedCode }}</strong></p>
      <button class="primary" :disabled="!cleanedNickname || !normalizedCode" @click="join">加入房間</button>
      <button class="link" @click="invited = false">改為開新房間或輸入其他房號</button>
    </div>

    <template v-else>
      <div class="card">
        <button class="primary" :disabled="!cleanedNickname" @click="create">開新房間</button>
      </div>

      <div class="divider"><span>或</span></div>

      <div class="card">
        <label class="field">
          <span>房號</span>
          <input
            v-model="codeInput"
            class="code-input"
            maxlength="7"
            placeholder="6 碼房號"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="join"
          />
        </label>
        <p v-if="codeError" class="error">房號格式不正確</p>
        <button :disabled="!cleanedNickname || !normalizedCode" @click="join">加入房間</button>
      </div>
    </template>
  </section>
</template>
