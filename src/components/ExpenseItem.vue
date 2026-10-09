<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatAmount, formatAverage } from '../format'
import type { Intent } from '../room/protocol'
import { participantsOf } from '../room/settlement'
import type { Expense, Member } from '../room/types'
import ExpenseForm, { type ExpenseDraft } from './ExpenseForm.vue'

const props = defineProps<{
  expense: Expense
  members: Member[]
  clientId: string
  isHost: boolean
  locked: boolean
}>()

const emit = defineEmits<{ intent: [intent: Intent] }>()

const editing = ref(false)

const payerName = computed(() => props.members.find((m) => m.id === props.expense.payerId)?.nickname ?? '（已離開）')
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

function save(draft: ExpenseDraft) {
  emit('intent', { kind: 'updateExpense', expenseId: props.expense.id, ...draft })
  editing.value = false
}

function remove() {
  if (confirm(`確定要刪除「${props.expense.title}」？`)) {
    emit('intent', { kind: 'deleteExpense', expenseId: props.expense.id })
  }
}
</script>

<template>
  <li class="expense" :class="{ warn: participants.length === 0 }">
    <ExpenseForm
      v-if="editing"
      :members="members"
      :client-id="clientId"
      :is-host="isHost"
      :initial="expense"
      @submit="save"
      @cancel="editing = false"
    />
    <template v-else>
      <div class="expense-head">
        <div class="expense-title">
          <strong>{{ expense.title }}</strong>
          <span class="hint">{{ payerName }}{{ expense.payerId === clientId ? '（我）' : '' }} 付款</span>
        </div>
        <span class="expense-amount">{{ formatAmount(expense.amount) }}</span>
      </div>
      <p v-if="participants.length === 0" class="error">沒有人參與，無法結算</p>
      <p v-else class="hint">{{ participants.length }} 人分攤，每人約 {{ formatAverage(expense.amount, participants.length) }}</p>
      <div class="chips" role="group" :aria-label="`${expense.title} 的參與者`">
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ on: participants.includes(m.id), me: m.id === clientId }"
          :disabled="!canToggle(m.id)"
          :aria-pressed="participants.includes(m.id)"
          @click="toggle(m.id)"
        >
          {{ participants.includes(m.id) ? '✓ ' : '' }}{{ m.nickname }}
        </button>
      </div>
      <div v-if="canEdit" class="expense-actions">
        <button type="button" class="link" @click="editing = true">編輯</button>
        <button type="button" class="link danger" @click="remove">刪除</button>
      </div>
    </template>
  </li>
</template>
