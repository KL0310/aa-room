<script setup lang="ts">
import { computed } from 'vue'
import { formatAmount } from '../format'
import type { Intent } from '../room/protocol'
import type { RoomState, Settlement } from '../room/types'
import BalanceSummary from './BalanceSummary.vue'

const props = defineProps<{
  state: RoomState
  settlement: Settlement
  clientId: string
  isHost: boolean
}>()

const emit = defineEmits<{ intent: [intent: Intent] }>()

function nameOf(id: string): string {
  return props.state.members.find((m) => m.id === id)?.nickname ?? '（已離開）'
}

const included = computed(() => props.clientId in props.settlement.balances)
const myPayments = computed(() => props.settlement.transfers.filter((t) => t.fromId === props.clientId))
const myReceipts = computed(() => props.settlement.transfers.filter((t) => t.toId === props.clientId))
/** 結算後才加入的成員不在快照中 */
const lateJoiners = computed(() => props.state.members.filter((m) => !(m.id in props.settlement.balances)))
const snapshotMembers = computed(() => props.state.members.filter((m) => m.id in props.settlement.balances))

function reopen() {
  if (confirm('退回後結算結果會作廢，大家可以繼續修改帳目。確定要退回？')) emit('intent', { kind: 'reopen' })
}
</script>

<template>
  <div class="card settlement">
    <h2>結算結果</h2>
    <p class="hint">
      {{ settlement.mode === 'hub' ? `統一收付（由 ${nameOf(settlement.hubId ?? '')} 收付）` : '各自轉帳' }} ·
      除不盡時{{ settlement.rounding === 'ceil' ? '進位給代墊人' : '捨去' }}
    </p>

    <div class="my-action" :class="{ pay: myPayments.length, receive: !myPayments.length && myReceipts.length }">
      <template v-if="!included">你在結算後才加入，不需要付款</template>
      <template v-else-if="myPayments.length">
        <p v-for="t in myPayments" :key="t.toId">
          你要付給 <strong>{{ nameOf(t.toId) }}</strong> <span class="big-amount">{{ formatAmount(t.amount) }}</span>
        </p>
      </template>
      <template v-if="included && myReceipts.length">
        <p v-for="t in myReceipts" :key="t.fromId">
          你會收到 <strong>{{ nameOf(t.fromId) }}</strong> 的 <span class="big-amount">{{ formatAmount(t.amount) }}</span>
        </p>
      </template>
      <template v-if="included && !myPayments.length && !myReceipts.length">你不需要付款，也沒有款項要收</template>
    </div>

    <h3>所有轉帳</h3>
    <ol v-if="settlement.transfers.length" class="transfers">
      <li v-for="(t, i) in settlement.transfers" :key="i" :class="{ me: t.fromId === clientId || t.toId === clientId }">
        <span>{{ nameOf(t.fromId) }}</span>
        <span class="arrow">→</span>
        <span>{{ nameOf(t.toId) }}</span>
        <span class="push-right">{{ formatAmount(t.amount) }}</span>
      </li>
    </ol>
    <p v-else class="hint">大家剛好打平，不需要轉帳</p>

    <h3>各自收支</h3>
    <BalanceSummary :members="snapshotMembers" :balances="settlement.balances" :client-id="clientId" />
    <p v-if="lateJoiners.length" class="hint">
      {{ lateJoiners.map((m) => m.nickname).join('、') }} 在結算後加入，未計入本次結算
    </p>

    <button v-if="isHost" type="button" class="ghost" @click="reopen">退回修改</button>
  </div>
</template>
