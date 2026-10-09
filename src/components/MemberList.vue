<script setup lang="ts">
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

function hasPayments(memberId: string): boolean {
  return props.state.expenses.some((e) => e.payerId === memberId)
}

function removeHint(memberId: string): string {
  if (props.state.settlement) return '已結算，無法移出'
  if (hasPayments(memberId)) return '有付款紀錄，無法移出'
  return ''
}

function remove(memberId: string, nickname: string) {
  if (confirm(`確定要將「${nickname}」移出房間？他之後需要你同意才能重新加入。`)) {
    emit('intent', { kind: 'removeMember', memberId })
  }
}
</script>

<template>
  <div class="card">
    <h2>成員 <span class="count">{{ state.members.length }}</span></h2>
    <ul class="members">
      <li v-for="m in state.members" :key="m.id">
        <span class="presence" :class="{ online: m.online }" :title="m.online ? '在線' : '離線'" />
        <span class="name">{{ m.nickname }}</span>
        <span v-if="m.id === state.hostId" class="tag">房主</span>
        <span v-if="m.id === clientId" class="tag me">我</span>
        <span v-if="memberKind(m.id)" class="tag kind" :class="memberKind(m.id)!">
          {{ kindLabel[memberKind(m.id)!] }}
        </span>
        <button
          v-if="isHost && m.id !== state.hostId"
          type="button"
          class="link danger push-right"
          :disabled="!!removeHint(m.id)"
          :title="removeHint(m.id)"
          @click="remove(m.id, m.nickname)"
        >
          移出
        </button>
      </li>
    </ul>
  </div>
</template>
