<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '../clipboard'
import BottomSheet from './BottomSheet.vue'
import QrCode from './QrCode.vue'

const props = defineProps<{ roomName: string; roomCode: string; joinUrl: string }>()
const emit = defineEmits<{ close: [] }>()

const feedback = ref('')

function flash(text: string) {
  feedback.value = text
  setTimeout(() => (feedback.value = ''), 1600)
}

async function copyCode() {
  if (await copyText(props.roomCode)) flash('已複製邀請碼')
}

/** 手機支援系統分享選單時直接叫出（可分享到 LINE 等），否則複製連結 */
async function shareLink() {
  if (navigator.share) {
    try {
      await navigator.share({ title: props.roomName, text: `一起來分帳：${props.roomName}`, url: props.joinUrl })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  if (await copyText(props.joinUrl)) flash('已複製連結')
}
</script>

<template>
  <BottomSheet label="INVITE" @close="emit('close')">
    <div class="invite">
      <p>邀請朋友加入「<strong>{{ roomName }}</strong>」</p>
      <div class="qr-frame"><QrCode :text="joinUrl" /></div>
      <p class="hint">用手機相機掃描就能加入</p>
      <div class="invite-code">
        <span class="hint">或輸入邀請碼</span>
        <span class="mono code-big">{{ roomCode }}</span>
      </div>
      <div class="button-pair">
        <button type="button" class="outline" @click="copyCode">複製邀請碼</button>
        <button type="button" class="ink" @click="shareLink">分享連結</button>
      </div>
      <p class="feedback" role="status">{{ feedback }}</p>
    </div>
  </BottomSheet>
</template>
