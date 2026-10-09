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
  <section class="paper alert">
    <span class="mono-label">REJOIN REQUEST</span>
    <p class="hint">以下成員曾被移出房間，同意後會重新加入並參與所有帳目</p>
    <ul class="requests">
      <li v-for="r in requests" :key="r.id">
        <strong class="name">{{ r.nickname }}</strong>
        <button type="button" class="outline small push-right" @click="resolve(r.id, false)">拒絕</button>
        <button type="button" class="ink small" @click="resolve(r.id, true)">同意</button>
      </li>
    </ul>
  </section>
</template>
