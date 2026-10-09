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
  expanded: boolean
}>()

const emit = defineEmits<{ intent: [intent: Intent]; edit: [expense: Expense]; toggle: [] }>()

const payer = computed(() => props.members.find((m) => m.id === props.expense.payerId))
const payerLabel = computed(() => {
  if (!payer.value) return '（已離開）'
  return payer.value.id === props.clientId ? '我' : payer.value.nickname
})
const participants = computed(() => participantsOf(props.expense, props.members))
const iParticipate = computed(() => participants.value.includes(props.clientId))
const canEdit = computed(() => !props.locked && (props.isHost || props.expense.payerId === props.clientId))

function canToggle(memberId: string): boolean {
  return !props.locked && (props.isHost || memberId === props.clientId)
}

function toggleParticipation(memberId: string) {
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
  <li class="line-item" :class="{ expanded, warn: participants.length === 0 }">
    <button type="button" class="line-summary" :aria-expanded="expanded" @click="emit('toggle')">
      <span class="leader-row">
        <strong class="item-title">{{ expense.title }}</strong>
        <span class="leader" />
        <span class="mono item-amount">{{ formatAmount(expense.amount) }}</span>
      </span>
      <span class="mono meta">
        {{ payerLabel }}付 · {{ participants.length }} 人<template v-if="expanded"> · 每人 {{ formatAverage(expense.amount, participants.length) }}</template>
        <span v-if="participants.length === 0" class="owe"> · 沒有人參與</span>
        <span v-else-if="!iParticipate" class="owe"> · 你沒參與</span>
      </span>
    </button>

    <template v-if="expanded">
      <div class="tags" role="group" :aria-label="`${expense.title} 的參與者`">
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="tag-toggle"
          :class="{ on: participants.includes(m.id), me: m.id === clientId }"
          :disabled="!canToggle(m.id)"
          :aria-pressed="participants.includes(m.id)"
          @click="toggleParticipation(m.id)"
        >
          {{ participants.includes(m.id) ? '■' : '□' }} {{ m.nickname }}
        </button>
      </div>
      <div v-if="canEdit" class="item-actions">
        <button type="button" class="text-link" @click="emit('edit', expense)">編輯</button>
        <button type="button" class="text-link danger" @click="remove">刪除</button>
      </div>
    </template>
  </li>
</template>
