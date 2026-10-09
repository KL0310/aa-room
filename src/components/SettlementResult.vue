<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyText } from '../clipboard'
import { confirmAction } from '../confirm'
import { formatAmount } from '../format'
import type { Intent } from '../room/protocol'
import type { RoomState, Settlement, Transfer } from '../room/types'
import BalanceSummary from './BalanceSummary.vue'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{
  state: RoomState
  settlement: Settlement
  clientId: string
  isHost: boolean
}>()

const emit = defineEmits<{ intent: [intent: Intent] }>()

const copiedKey = ref('')
const showDetail = ref(false)

function nameOf(id: string): string {
  return props.state.members.find((m) => m.id === id)?.nickname ?? '（已離開）'
}

const included = computed(() => props.clientId in props.settlement.balances)
const myPayments = computed(() => props.settlement.transfers.filter((t) => t.fromId === props.clientId))
const myReceipts = computed(() => props.settlement.transfers.filter((t) => t.toId === props.clientId))
/** 結算後才加入的成員不在快照中 */
const lateJoiners = computed(() => props.state.members.filter((m) => !(m.id in props.settlement.balances)))
const snapshotMembers = computed(() => props.state.members.filter((m) => m.id in props.settlement.balances))

async function copyAmount(t: Transfer) {
  if (await copyText(String(t.amount))) {
    copiedKey.value = t.toId
    setTimeout(() => (copiedKey.value = ''), 1500)
  }
}

async function reopen() {
  const ok = await confirmAction({
    title: '退回修改？',
    message: '結算結果會作廢，大家可以繼續修改帳目，之後再重新結算。',
    confirmText: '退回',
  })
  if (ok) emit('intent', { kind: 'reopen' })
}
</script>

<template>
  <section class="paper settlement">
    <div class="stamp" aria-hidden="true">已結算</div>
    <span class="mono-label">SETTLEMENT</span>
    <h2>結算單</h2>
    <p class="mono meta">
      {{ settlement.mode === 'hub' ? `統一收付（由 ${nameOf(settlement.hubId ?? '')} 收付）` : '各自轉帳' }} ·
      除不盡時{{ settlement.rounding === 'ceil' ? '進位給代墊人' : '捨去' }}
    </p>

    <div class="my-action">
      <template v-if="!included">
        <p>你在結算後才加入，不需要付款</p>
      </template>
      <template v-else>
        <div v-for="t in myPayments" :key="`pay-${t.toId}`" class="my-transfer">
          <p>你要付給 <strong>{{ nameOf(t.toId) }}</strong></p>
          <span class="mono hero-amount owe">{{ formatAmount(t.amount) }}</span>
          <button type="button" class="ink small" @click="copyAmount(t)">
            {{ copiedKey === t.toId ? '已複製' : '複製金額' }}
          </button>
        </div>
        <div v-for="t in myReceipts" :key="`receive-${t.fromId}`" class="my-transfer">
          <p>你會收到 <strong>{{ nameOf(t.fromId) }}</strong> 的</p>
          <span class="mono hero-amount">{{ formatAmount(t.amount) }}</span>
        </div>
        <p v-if="!myPayments.length && !myReceipts.length">你不需要付款，也沒有款項要收</p>
      </template>
    </div>

    <div class="rule" />
    <span class="mono-label">TRANSFERS</span>
    <ul v-if="settlement.transfers.length" class="transfers">
      <li v-for="(t, i) in settlement.transfers" :key="i" class="leader-row" :class="{ me: t.fromId === clientId || t.toId === clientId }">
        <span>{{ nameOf(t.fromId) }} → {{ nameOf(t.toId) }}</span>
        <span class="leader" />
        <span class="mono">{{ formatAmount(t.amount) }}</span>
      </li>
    </ul>
    <p v-else class="hint">大家剛好打平，不需要轉帳</p>

    <button type="button" class="detail-link" @click="showDetail = true">查看明細 ›</button>

    <BottomSheet v-if="showDetail" label="DETAIL" @close="showDetail = false">
      <div class="expense-form">
        <BalanceSummary :members="snapshotMembers" :balances="settlement.balances" :client-id="clientId" />
        <p v-if="lateJoiners.length" class="hint">
          {{ lateJoiners.map((m) => m.nickname).join('、') }} 在結算後加入，未計入本次結算
        </p>
      </div>
    </BottomSheet>

    <p class="mono receipt-end">* * * THANK YOU * * *</p>
    <button v-if="isHost" type="button" class="outline block" @click="reopen">退回修改</button>
  </section>
</template>
