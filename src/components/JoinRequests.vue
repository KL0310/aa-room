<script setup lang="ts">
import type { Intent } from '../room/protocol'
import type { JoinRequest } from '../room/types'

defineProps<{ requests: JoinRequest[] }>()
const emit = defineEmits<{ intent: [intent: Intent] }>()

function resolve(memberId: string, approve: boolean) {
  emit('intent', { kind: 'resolveJoinRequest', memberId, approve })
}
</script>

<template>
  <div class="join-requests">
    <span class="mono-label">想重新加入</span>
    <ul class="requests">
      <li v-for="r in requests" :key="r.id">
        <strong class="name">{{ r.nickname }}</strong>
        <button type="button" class="outline small push-right" @click="resolve(r.id, false)">拒絕</button>
        <button type="button" class="ink small" @click="resolve(r.id, true)">同意</button>
      </li>
    </ul>
  </div>
</template>
