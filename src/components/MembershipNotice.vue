<script setup lang="ts">
import type { Membership } from '../room/clientRoom'

defineProps<{ membership: Membership }>()
const emit = defineEmits<{ requestRejoin: []; leave: [] }>()
</script>

<template>
  <div class="card notice-card">
    <template v-if="membership === 'removed'">
      <h2>你已被房主移出房間</h2>
      <p class="hint">如果是誤會，可以申請重新加入，房主同意後就能回到房間。</p>
      <button type="button" class="primary" @click="emit('requestRejoin')">申請重新加入</button>
    </template>
    <template v-else-if="membership === 'pending'">
      <h2>已送出申請</h2>
      <p class="hint">等待房主同意…</p>
    </template>
    <template v-else-if="membership === 'rejected'">
      <h2>房主拒絕了你的申請</h2>
      <button type="button" @click="emit('requestRejoin')">再次申請</button>
    </template>
    <button type="button" class="link" @click="emit('leave')">離開這個房間</button>
  </div>
</template>
