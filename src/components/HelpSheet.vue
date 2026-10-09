<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BottomSheet label="ABOUT" @close="emit('close')">
    <div class="help">
      <h2>AA Room 是什麼？</h2>
      <p>聚會、出遊時，常常有人先幫大家墊錢。AA Room 讓大家在各自的手機上記下誰付了什麼，最後自動算出誰該付給誰、付多少。</p>

      <div class="rule" />
      <span class="mono-label">HOW IT WORKS</span>
      <ol class="help-steps">
        <li><strong>開房間</strong>：一個人開房，成為房主</li>
        <li><strong>邀請</strong>：按「邀請」讓大家掃 QR code，或把連結傳給朋友</li>
        <li><strong>記一筆</strong>：誰付了錢，就由誰記下項目和金額</li>
        <li><strong>勾選參與</strong>：沒用到的項目，取消勾選自己就不用分攤</li>
        <li><strong>結算</strong>：房主按下結算，每個人都會看到要付給誰、付多少</li>
      </ol>

      <div class="rule" />
      <span class="mono-label">GOOD TO KNOW</span>
      <ul class="help-notes">
        <li>不用註冊、不用下載 App，打開網頁就能用</li>
        <li>帳目只在參與者的手機之間直接傳送，不會存到任何伺服器</li>
        <li>資料保存在房主的手機上，房主關掉頁面時，其他人會暫時無法同步，房主回來後會自動恢復</li>
      </ul>
      <button type="button" class="ink block" @click="emit('close')">知道了</button>
    </div>
  </BottomSheet>
</template>
