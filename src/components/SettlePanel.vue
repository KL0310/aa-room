<script setup lang="ts">
import { computed, ref } from 'vue'
import { confirmAction } from '../confirm'
import type { Intent } from '../room/protocol'
import { unsettleableExpenses } from '../room/settlement'
import type { RoomState, RoundingMode, SettlementMode } from '../room/types'

const props = defineProps<{ state: RoomState }>()
const emit = defineEmits<{ intent: [intent: Intent] }>()

const mode = ref<SettlementMode>('direct')
const rounding = ref<RoundingMode>('ceil')

const blocked = computed(() => unsettleableExpenses(props.state.expenses, props.state.members))
const offline = computed(() => props.state.members.filter((m) => !m.online))

async function settle() {
  const ok = await confirmAction({
    title: '確認結算？',
    message:
      props.state.expenses.length === 0
        ? '目前沒有任何帳目。結算後帳目會鎖定，之後可以退回修改。'
        : '結算後帳目會鎖定，大家會看到要付給誰；之後可以退回修改。',
    confirmText: '結算',
  })
  if (ok) emit('intent', { kind: 'settle', mode: mode.value, rounding: rounding.value })
}
</script>

<template>
  <section class="paper">
    <span class="mono-label">SETTLE · 房主</span>

    <fieldset>
      <legend class="field-label">轉帳方式</legend>
      <label class="option">
        <input v-model="mode" type="radio" value="direct" />
        <span><strong>各自轉帳</strong><small>欠款的人直接轉給應收款的人，轉帳筆數較少</small></span>
      </label>
      <label class="option">
        <input v-model="mode" type="radio" value="hub" />
        <span><strong>統一收付</strong><small>由付款最多的人先收齊，再轉給其他應收款的人</small></span>
      </label>
    </fieldset>

    <fieldset>
      <legend class="field-label">除不盡時</legend>
      <label class="option">
        <input v-model="rounding" type="radio" value="ceil" />
        <span><strong>進位給代墊人</strong><small>例：100 元 3 人分，每人付 34</small></span>
      </label>
      <label class="option">
        <input v-model="rounding" type="radio" value="floor" />
        <span><strong>捨去</strong><small>例：100 元 3 人分，每人付 33，差額由代墊人吸收</small></span>
      </label>
    </fieldset>

    <p v-if="blocked.length" class="error">
      以下帳目沒有任何參與者，請先處理：{{ blocked.map((e) => e.title).join('、') }}
    </p>
    <p v-else-if="offline.length" class="hint">{{ offline.map((m) => m.nickname).join('、') }} 目前離線，結算時仍會計入</p>
    <button type="button" class="ink block" :disabled="blocked.length > 0" @click="settle">確認結算</button>
  </section>
</template>
