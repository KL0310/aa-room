<script setup lang="ts">
import { formatAmount } from '../format'
import type { Balance, Member } from '../room/types'

defineProps<{
  members: Member[]
  balances: Record<string, Balance>
  clientId: string
}>()
</script>

<template>
  <table class="balances">
    <thead>
      <tr>
        <th>成員</th>
        <th>已付</th>
        <th>應分擔</th>
        <th>收支</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="m in members" :key="m.id">
        <tr v-if="balances[m.id]" :class="{ me: m.id === clientId }">
          <td class="name">{{ m.nickname }}</td>
          <td>{{ formatAmount(balances[m.id]!.paid) }}</td>
          <td>{{ formatAmount(balances[m.id]!.share) }}</td>
          <td :class="balances[m.id]!.net > 0 ? 'positive' : balances[m.id]!.net < 0 ? 'negative' : ''">
            {{ balances[m.id]!.net > 0 ? '+' : '' }}{{ formatAmount(balances[m.id]!.net) }}
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>
