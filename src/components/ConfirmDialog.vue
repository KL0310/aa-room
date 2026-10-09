<script setup lang="ts">
import { pendingConfirm, resolveConfirm } from '../confirm'
import BottomSheet from './BottomSheet.vue'
</script>

<template>
  <BottomSheet v-if="pendingConfirm" label="CONFIRM" @close="resolveConfirm(false)">
    <div class="confirm">
      <p class="confirm-title">{{ pendingConfirm.title }}</p>
      <p v-if="pendingConfirm.message" class="hint">{{ pendingConfirm.message }}</p>
      <div class="button-pair">
        <button type="button" class="outline" @click="resolveConfirm(false)">取消</button>
        <button type="button" :class="pendingConfirm.danger ? 'danger-fill' : 'ink'" @click="resolveConfirm(true)">
          {{ pendingConfirm.confirmText ?? '確定' }}
        </button>
      </div>
    </div>
  </BottomSheet>
</template>
