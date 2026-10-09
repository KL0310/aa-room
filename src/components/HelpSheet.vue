<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BottomSheet label="ABOUT" @close="emit('close')">
    <div class="help">
      <h2>AA Room 是什麼？</h2>
      <p>聚會、出遊時有人先墊錢？大家在各自的手機上記帳，最後自動算出誰該付給誰、付多少。</p>
      <ol class="help-steps">
        <li>開房間，按「邀請」把連結傳給朋友</li>
        <li>誰付了錢，就由誰「記一筆」</li>
        <li>沒用到的項目，取消勾選自己</li>
        <li>房主按「結算」，照結算單轉帳</li>
      </ol>
      <ul class="help-notes">
        <li>免註冊、免下載，打開網頁就能用</li>
        <li>帳目只在大家的手機之間傳送，不會存到伺服器</li>
        <li>房主需開著頁面，大家才能同步</li>
      </ul>
      <button type="button" class="ink block" @click="emit('close')">知道了</button>
    </div>
  </BottomSheet>
</template>
