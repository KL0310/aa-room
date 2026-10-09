<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatAmount, parseAmount } from '../format'
import { TITLE_MAX_LENGTH, validateExpenseFields } from '../room/roomState'
import type { Expense, Member } from '../room/types'

export interface ExpenseDraft {
  title: string
  amount: number
  payerId?: string
}

const props = defineProps<{
  members: Member[]
  clientId: string
  isHost: boolean
  /** 有值時為編輯模式 */
  initial?: Expense
}>()

const emit = defineEmits<{ submit: [draft: ExpenseDraft] }>()

const title = ref(props.initial?.title ?? '')
const amountInput = ref(props.initial ? String(props.initial.amount) : '')
const payerId = ref(props.initial?.payerId ?? props.clientId)

const amount = computed(() => parseAmount(amountInput.value))
const valid = computed(() => amount.value !== null && validateExpenseFields(title.value, amount.value) !== null)
const amountError = computed(() => amountInput.value.trim() !== '' && amount.value === null)

function submit() {
  if (!valid.value || amount.value === null) return
  const draft: ExpenseDraft = { title: title.value.trim(), amount: amount.value }
  // 只有房主能指定付款人；一般成員由房主端預設為本人
  if (props.isHost) draft.payerId = payerId.value
  emit('submit', draft)
}
</script>

<template>
  <form class="expense-form" @submit.prevent="submit">
    <label class="field">
      <span class="field-label">項目</span>
      <input v-model="title" :maxlength="TITLE_MAX_LENGTH" placeholder="例如：晚餐" />
    </label>
    <label class="field">
      <span class="field-label">金額</span>
      <input v-model="amountInput" class="mono amount-input" inputmode="numeric" placeholder="0" autocomplete="off" />
    </label>
    <p v-if="amountError" class="error">金額請輸入正整數</p>
    <label v-if="isHost" class="field">
      <span class="field-label">付款人</span>
      <select v-model="payerId">
        <option v-for="m in members" :key="m.id" :value="m.id">
          {{ m.nickname }}{{ m.id === clientId ? '（我）' : '' }}
        </option>
      </select>
    </label>
    <p v-else class="hint">付款人：你自己</p>
    <button class="ink block" :disabled="!valid">
      {{ initial ? '儲存' : amount ? `記下 ${formatAmount(amount)}` : '記下' }}
    </button>
  </form>
</template>
