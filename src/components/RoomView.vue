<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatAmount } from '../format'
import type { Membership } from '../room/clientRoom'
import type { Intent } from '../room/protocol'
import { computeBalances } from '../room/settlement'
import type { RoomState } from '../room/types'
import type { ConnectionKind, TransportStatus } from '../transport/types'
import type { RoomNotice, Role } from '../useRoomSession'
import BalanceSummary from './BalanceSummary.vue'
import ExpenseForm, { type ExpenseDraft } from './ExpenseForm.vue'
import ExpenseItem from './ExpenseItem.vue'
import JoinRequests from './JoinRequests.vue'
import MemberList from './MemberList.vue'
import MembershipNotice from './MembershipNotice.vue'
import QrCode from './QrCode.vue'
import SettlementResult from './SettlementResult.vue'
import SettlePanel from './SettlePanel.vue'

const props = defineProps<{
  role: Role
  roomCode: string
  state: RoomState | null
  status: TransportStatus
  notice: RoomNotice | null
  membership: Membership
  clientId: string
  connectionKinds: Record<string, ConnectionKind>
  joinUrl: string
}>()

const emit = defineEmits<{
  intent: [intent: Intent]
  requestRejoin: []
  leave: []
}>()

const copied = ref(false)
const showShare = ref(props.role === 'host')

const isHost = computed(() => props.role === 'host')
const connected = computed(() => props.status.kind === 'ready')
const settlement = computed(() => props.state?.settlement ?? null)
const total = computed(() => props.state?.expenses.reduce((sum, e) => sum + e.amount, 0) ?? 0)
/** 結算前的即時預覽，以進位計算；實際結果依房主結算時的選擇 */
const previewBalances = computed(() =>
  props.state ? computeBalances(props.state.members, props.state.expenses, 'ceil') : {},
)

const statusText = computed(() => {
  const s = props.status
  switch (s.kind) {
    case 'connecting':
      return isHost.value ? '正在開啟房間…' : '正在連線到房主…'
    case 'ready':
      return isHost.value ? '房間已開啟' : '已連上房主'
    case 'reconnecting':
      return `連線中斷，重新連線中（第 ${s.attempt} 次）`
    case 'closed':
      return '已離線'
    case 'failed':
      return {
        'room-not-found': '找不到這個房間，請確認房號，或房主是否還在線上',
        'room-code-taken': '房號已被使用',
        'browser-unsupported': '這個瀏覽器不支援 P2P 連線',
        unknown: '連線失敗',
      }[s.reason]
  }
  return ''
})

const noticeText = computed(() => {
  switch (props.notice) {
    case 'opened-in-other-tab':
      return '這個房間已經在此瀏覽器的其他分頁開啟，請回到該分頁操作'
    case 'same-device-as-host':
      return '這個瀏覽器就是房主，請改用其他裝置或無痕視窗加入'
    case 'version-mismatch':
      return '你和房主使用的版本不同，請兩邊都重新整理頁面'
    case 'invalid-message':
      return '房主無法處理這個請求'
    default:
      return ''
  }
})

function addExpense(draft: ExpenseDraft) {
  emit('intent', { kind: 'addExpense', ...draft })
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.joinUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // 不支援剪貼簿時，使用者仍可手動長按複製連結
  }
}

function confirmLeave() {
  const message = isHost.value ? '關閉房間後，其他人將無法再同步。確定要離開？' : '確定要離開房間？'
  if (confirm(message)) emit('leave')
}

function reload() {
  location.reload()
}
</script>

<template>
  <section class="room">
    <header class="room-header">
      <div>
        <p class="label">房號</p>
        <p class="code big">{{ roomCode }}</p>
      </div>
      <div class="header-actions">
        <button class="small" @click="showShare = !showShare">{{ showShare ? '收起' : '邀請' }}</button>
        <button class="small ghost" @click="confirmLeave">離開</button>
      </div>
    </header>

    <p class="status" :class="status.kind" role="status"><span class="dot" />{{ statusText }}</p>
    <p v-if="noticeText" class="error">
      {{ noticeText }}
      <button v-if="notice === 'version-mismatch'" class="link" @click="reload">重新整理</button>
    </p>

    <div v-if="showShare" class="card share">
      <QrCode :text="joinUrl" />
      <p class="hint">用手機相機掃描，或分享以下連結</p>
      <div class="link-row">
        <input :value="joinUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="small" @click="copyLink">{{ copied ? '已複製' : '複製' }}</button>
      </div>
    </div>

    <MembershipNotice
      v-if="!isHost && (membership === 'removed' || membership === 'pending' || membership === 'rejected')"
      :membership="membership"
      @request-rejoin="emit('requestRejoin')"
      @leave="confirmLeave"
    />

    <template v-else-if="state">
      <JoinRequests
        v-if="isHost && state.joinRequests.length"
        :requests="state.joinRequests"
        @intent="emit('intent', $event)"
      />

      <SettlementResult
        v-if="settlement"
        :state="state"
        :settlement="settlement"
        :client-id="clientId"
        :is-host="isHost"
        @intent="emit('intent', $event)"
      />

      <div v-else class="card">
        <h2>新增帳目</h2>
        <ExpenseForm :members="state.members" :client-id="clientId" :is-host="isHost" @submit="addExpense" />
        <p v-if="!connected" class="hint">連線恢復後才能送出</p>
      </div>

      <div class="card">
        <h2>
          帳目 <span class="count">{{ state.expenses.length }}</span>
          <span v-if="state.expenses.length" class="count push-right">合計 {{ formatAmount(total) }}</span>
        </h2>
        <p v-if="!state.expenses.length" class="hint">還沒有帳目。誰先付了錢，就由誰新增一筆。</p>
        <p v-else-if="!settlement" class="hint">點名字可以切換是否參與；你可以切換自己的{{ isHost ? '，房主可以切換所有人的' : '' }}</p>
        <ul class="expenses">
          <ExpenseItem
            v-for="e in state.expenses"
            :key="e.id"
            :expense="e"
            :members="state.members"
            :client-id="clientId"
            :is-host="isHost"
            :locked="!!settlement || !connected"
            @intent="emit('intent', $event)"
          />
        </ul>
      </div>

      <div v-if="!settlement && state.expenses.length" class="card">
        <h2>目前收支</h2>
        <p class="hint">預覽，以小數進位計算；實際結果以房主結算時的選擇為準</p>
        <BalanceSummary :members="state.members" :balances="previewBalances" :client-id="clientId" />
      </div>

      <MemberList
        :state="state"
        :client-id="clientId"
        :is-host="isHost"
        :connection-kinds="connectionKinds"
        @intent="emit('intent', $event)"
      />

      <SettlePanel v-if="isHost && !settlement" :state="state" @intent="emit('intent', $event)" />
    </template>

    <p v-else-if="status.kind !== 'failed' && !notice" class="hint center">等待房間資料…</p>
  </section>
</template>
