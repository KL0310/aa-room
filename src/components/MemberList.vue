<script setup lang="ts">
import { confirmAction } from '../confirm'
import type { Intent } from '../room/protocol'
import type { RoomState } from '../room/types'
import type { ConnectionKind } from '../transport/types'

const props = defineProps<{
  state: RoomState
  clientId: string
  isHost: boolean
  connectionKinds: Record<string, ConnectionKind>
}>()

const emit = defineEmits<{ intent: [intent: Intent] }>()

const kindLabel: Record<ConnectionKind, string> = {
  direct: '直連',
  relay: '中繼',
  unknown: '偵測中',
}

/** 房主看每位成員的連線；成員只看自己到房主的連線，所以標在房主那一列 */
function memberKind(memberId: string): ConnectionKind | null {
  if (memberId === props.clientId) return null
  return props.connectionKinds[memberId] ?? null
}

function removeHint(memberId: string): string {
  if (props.state.settlement) return '已結算，無法移出'
  if (props.state.expenses.some((e) => e.payerId === memberId)) return '有付款紀錄，無法移出'
  return ''
}

async function remove(memberId: string, nickname: string) {
  const ok = await confirmAction({
    title: `將「${nickname}」移出房間？`,
    message: '他之後需要你同意才能重新加入',
    confirmText: '移出',
    danger: true,
  })
  if (ok) emit('intent', { kind: 'removeMember', memberId })
}
</script>

<template>
  <ul class="members">
    <li v-for="m in state.members" :key="m.id">
      <span class="presence" :class="{ online: m.online }" :title="m.online ? '在線' : '離線'" />
      <span class="name" :class="{ me: m.id === clientId }">{{ m.nickname }}</span>
      <span v-if="m.id === state.hostId" class="badge">房主</span>
      <span v-if="m.id === clientId" class="badge ink-badge">我</span>
      <span v-if="memberKind(m.id)" class="badge mono">{{ kindLabel[memberKind(m.id)!] }}</span>
      <button
        v-if="isHost && m.id !== state.hostId"
        type="button"
        class="text-link danger push-right"
        :disabled="!!removeHint(m.id)"
        :title="removeHint(m.id)"
        @click="remove(m.id, m.nickname)"
      >
        移出
      </button>
    </li>
  </ul>
</template>
