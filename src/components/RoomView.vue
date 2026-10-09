<script setup lang="ts">
import { computed, ref } from 'vue'
import { confirmAction } from '../confirm'
import { formatAmount } from '../format'
import type { Membership } from '../room/clientRoom'
import type { Intent } from '../room/protocol'
import { ROOM_NAME_MAX_LENGTH, cleanRoomName } from '../room/roomState'
import { computeBalances } from '../room/settlement'
import type { Expense, RoomState } from '../room/types'
import type { ConnectionKind, TransportStatus } from '../transport/types'
import type { RoomNotice, Role } from '../useRoomSession'
import BalanceSummary from './BalanceSummary.vue'
import BottomSheet from './BottomSheet.vue'
import ExpenseForm, { type ExpenseDraft } from './ExpenseForm.vue'
import ExpenseItem from './ExpenseItem.vue'
import InviteSheet from './InviteSheet.vue'
import JoinRequests from './JoinRequests.vue'
import MemberList from './MemberList.vue'
import MembershipNotice from './MembershipNotice.vue'
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

/** 目前開啟的底部表單；edit 時帶著要編輯的帳目 */
type Sheet = { kind: 'invite' } | { kind: 'add' } | { kind: 'edit'; expense: Expense } | { kind: 'rename' }
const sheet = ref<Sheet | null>(null)
const renameInput = ref('')

const isHost = computed(() => props.role === 'host')
const connected = computed(() => props.status.kind === 'ready')
const settlement = computed(() => props.state?.settlement ?? null)
const total = computed(() => props.state?.expenses.reduce((sum, e) => sum + e.amount, 0) ?? 0)
const hostName = computed(() => props.state?.members.find((m) => m.id === props.state?.hostId)?.nickname ?? '')
const onlineCount = computed(() => props.state?.members.filter((m) => m.online).length ?? 0)
/** 結算前的即時預覽，以進位計算；實際結果依房主結算時的選擇 */
const previewBalances = computed(() =>
  props.state ? computeBalances(props.state.members, props.state.expenses, 'ceil') : {},
)
const myBalance = computed(() => previewBalances.value[props.clientId] ?? null)
const showRoom = computed(
  () => props.state && (isHost.value || !['removed', 'pending', 'rejected'].includes(props.membership)),
)

const statusText = computed(() => {
  const s = props.status
  switch (s.kind) {
    case 'connecting':
      return isHost.value ? '正在開啟房間…' : '正在連線到房主…'
    case 'ready':
      return props.state ? `已連線 · ${onlineCount.value}/${props.state.members.length} 人在線` : '已連線'
    case 'reconnecting':
      return `連線中斷，重新連線中（第 ${s.attempt} 次）`
    case 'closed':
      return '已離線'
    case 'failed':
      return {
        'room-not-found': '找不到這個房間，請確認邀請碼，或房主是否還在線上',
        'room-code-taken': '邀請碼已被使用',
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

function submitExpense(draft: ExpenseDraft) {
  const current = sheet.value
  if (current?.kind === 'edit') emit('intent', { kind: 'updateExpense', expenseId: current.expense.id, ...draft })
  else emit('intent', { kind: 'addExpense', ...draft })
  sheet.value = null
}

function openRename() {
  if (!isHost.value || !props.state) return
  renameInput.value = props.state.name
  sheet.value = { kind: 'rename' }
}

function submitRename() {
  const name = cleanRoomName(renameInput.value)
  if (!name) return
  emit('intent', { kind: 'renameRoom', name })
  sheet.value = null
}

async function confirmLeave() {
  const ok = await confirmAction(
    isHost.value
      ? { title: '關閉房間？', message: '你是房主，離開後其他人將無法再同步。', confirmText: '離開', danger: true }
      : { title: '離開房間？', message: '之後可以用邀請碼再加入。', confirmText: '離開' },
  )
  if (ok) emit('leave')
}

function reload() {
  location.reload()
}
</script>

<template>
  <section class="room" :class="{ 'has-dock': showRoom && !settlement }">
    <header class="room-header">
      <div class="title-block">
        <span class="mono-label">AA ROOM{{ hostName ? ` · 房主 ${hostName}` : '' }}</span>
        <button v-if="isHost && state" type="button" class="room-name editable" aria-label="修改房間名稱" @click="openRename">
          {{ state.name }}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <h1 v-else class="room-name">{{ state?.name ?? '連線中…' }}</h1>
      </div>
      <button type="button" class="outline" @click="sheet = { kind: 'invite' }">邀請</button>
    </header>

    <p class="status mono" :class="status.kind" role="status"><span class="dot" />{{ statusText }}</p>
    <p v-if="noticeText" class="error">
      {{ noticeText }}
      <button v-if="notice === 'version-mismatch'" class="text-link" @click="reload">重新整理</button>
    </p>

    <MembershipNotice
      v-if="!isHost && ['removed', 'pending', 'rejected'].includes(membership)"
      :membership="membership"
      @request-rejoin="emit('requestRejoin')"
      @leave="confirmLeave"
    />

    <template v-else-if="state">
      <JoinRequests v-if="isHost && state.joinRequests.length" :requests="state.joinRequests" @intent="emit('intent', $event)" />

      <SettlementResult
        v-if="settlement"
        :state="state"
        :settlement="settlement"
        :client-id="clientId"
        :is-host="isHost"
        @intent="emit('intent', $event)"
      />

      <section class="paper">
        <div v-if="!settlement && myBalance && state.expenses.length" class="balance-head">
          <span class="hint">{{ myBalance.net < 0 ? '目前你應付' : myBalance.net > 0 ? '目前你應收' : '目前你' }}</span>
          <span class="mono hero-amount" :class="{ owe: myBalance.net < 0 }">
            {{ myBalance.net === 0 ? '打平' : formatAmount(Math.abs(myBalance.net)) }}
          </span>
          <span class="mono meta">已付 {{ formatAmount(myBalance.paid) }} ／ 應分擔 {{ formatAmount(myBalance.share) }}</span>
        </div>

        <div class="section-head">
          <span class="mono-label">ITEM</span>
          <span class="mono-label">AMOUNT</span>
        </div>
        <p v-if="!state.expenses.length" class="hint empty">還沒有帳目。誰先付了錢，就由誰記一筆。</p>
        <p v-else-if="!settlement" class="hint">點名字切換是否參與；你可以切換自己的{{ isHost ? '，房主可以切換所有人的' : '' }}</p>
        <ul class="line-items">
          <ExpenseItem
            v-for="e in state.expenses"
            :key="e.id"
            :expense="e"
            :members="state.members"
            :client-id="clientId"
            :is-host="isHost"
            :locked="!!settlement || !connected"
            @intent="emit('intent', $event)"
            @edit="sheet = { kind: 'edit', expense: $event }"
          />
        </ul>
        <div class="total-row mono">
          <span>TOTAL</span>
          <span>{{ formatAmount(total) }}</span>
        </div>
      </section>

      <section v-if="!settlement && state.expenses.length" class="paper">
        <span class="mono-label">BALANCE · 預覽</span>
        <p class="hint">以小數進位計算；實際結果以房主結算時的選擇為準</p>
        <BalanceSummary :members="state.members" :balances="previewBalances" :client-id="clientId" />
      </section>

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

    <button type="button" class="text-link leave" @click="confirmLeave">{{ isHost ? '關閉房間' : '離開房間' }}</button>

    <div v-if="showRoom && !settlement" class="dock">
      <button type="button" class="ink block" :disabled="!connected" @click="sheet = { kind: 'add' }">
        {{ connected ? '＋ 記一筆' : '連線恢復後才能記帳' }}
      </button>
    </div>

    <InviteSheet
      v-if="sheet?.kind === 'invite'"
      :room-name="state?.name ?? roomCode"
      :room-code="roomCode"
      :join-url="joinUrl"
      @close="sheet = null"
    />

    <BottomSheet
      v-if="state && (sheet?.kind === 'add' || sheet?.kind === 'edit')"
      :label="sheet.kind === 'add' ? 'NEW ITEM' : 'EDIT ITEM'"
      @close="sheet = null"
    >
      <ExpenseForm
        :key="sheet.kind === 'edit' ? sheet.expense.id : 'new'"
        :members="state.members"
        :client-id="clientId"
        :is-host="isHost"
        :initial="sheet.kind === 'edit' ? sheet.expense : undefined"
        @submit="submitExpense"
      />
    </BottomSheet>

    <BottomSheet v-if="sheet?.kind === 'rename'" label="ROOM NAME" @close="sheet = null">
      <form class="expense-form" @submit.prevent="submitRename">
        <label class="field">
          <span class="field-label">房間名稱</span>
          <input v-model="renameInput" :maxlength="ROOM_NAME_MAX_LENGTH" />
        </label>
        <button class="ink block" :disabled="!cleanRoomName(renameInput)">儲存</button>
      </form>
    </BottomSheet>
  </section>
</template>
