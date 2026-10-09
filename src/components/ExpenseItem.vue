<script setup lang="ts">
import { computed } from 'vue'
import { confirmAction } from '../confirm'
import { formatAmount, formatAverage } from '../format'
import type { Intent } from '../room/protocol'
import { participantsOf } from '../room/settlement'
import type { Expense, Member } from '../room/types'

const props = defineProps<{
  expense: Expense
  members: Member[]
  clientId: string
  isHost: boolean
  locked: boolean
}>()

const emit = defineEmits<{ intent: [intent: Intent]; edit: [expense: Expense] }>()

const payer = computed(() => props.members.find((m) => m.id === props.expense.payerId))
const payerLabel = computed(() =>
  payer.value ? (payer.value.id === props.clientId ? `${payer.value.nickname}（我）` : payer.value.nickname) : '（已離開）',
)
const participants = computed(() => participantsOf(props.expense, props.members))
const canEdit = computed(() => !props.locked && (props.isHost || props.expense.payerId === props.clientId))

function canToggle(memberId: string): boolean {
  return !props.locked && (props.isHost || memberId === props.clientId)
}

function toggle(memberId: string) {
  if (!canToggle(memberId)) return
  emit('intent', {
    kind: 'setParticipation',
    expenseId: props.expense.id,
    memberId,
    participating: !participants.value.includes(memberId),
  })
}

async function remove() {
  const ok = await confirmAction({
    title: `刪除「${props.expense.title}」？`,
    message: `${formatAmount(props.expense.amount)} 會從帳目中移除`,
    confirmText: '刪除',
    danger: true,
  })
  if (ok) emit('intent', { kind: 'deleteExpense', expenseId: props.expense.id })
}
</script>

<template>
  <li class="line-item" :class="{ warn: participants.length === 0 }">
    <div class="leader-row">
      <strong class="item-title">{{ expense.title }}</strong>
      <span class="leader" />
      <span class="mono item-amount">{{ formatAmount(expense.amount) }}</span>
    </div>
    <p class="mono meta">
      {{ payerLabel }}付 · {{ participants.length }} 人 · 每人 {{ formatAverage(expense.amount, participants.length) }}
    </p>
    <p v-if="participants.length === 0" class="error">沒有人參與，無法結算</p>
    <div class="tags" role="group" :aria-label="`${expense.title} 的參與者`">
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        class="tag-toggle"
        :class="{ on: participants.includes(m.id), me: m.id === clientId }"
        :disabled="!canToggle(m.id)"
        :aria-pressed="participants.includes(m.id)"
        @click="toggle(m.id)"
      >
        {{ participants.includes(m.id) ? '■' : '□' }} {{ m.nickname }}
      </button>
    </div>
    <div v-if="canEdit" class="item-actions">
      <button type="button" class="text-link" @click="emit('edit', expense)">編輯</button>
      <button type="button" class="text-link danger" @click="remove">刪除</button>
    </div>
  </li>
</template>
