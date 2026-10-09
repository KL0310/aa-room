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
import SettleSheet from './SettleSheet.vue'

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

/** 目前開啟的底部表單；同一時間只開一個 */
type Sheet =
  | { kind: 'invite' }
  | { kind: 'add' }
  | { kind: 'edit'; expense: Expense }
  | { kind: 'rename' }
  | { kind: 'members' }
  | { kind: 'balances' }
  | { kind: 'settle' }
  | { kind: 'menu' }
const sheet = ref<Sheet | null>(null)
const renameInput = ref('')
/** 同一時間只展開一筆帳目 */
const expandedId = ref<string | null>(null)
/** 房主關掉過的加入申請彈窗，不再自動彈出（仍可在成員列表處理） */
const dismissedRequests = ref(new Set<string>())
/** 結算後帳目清單預設收起，避免結算單下方還要捲很長 */
const showSettledItems = ref(false)

const isHost = computed(() => props.role === 'host')
const connected = computed(() => props.status.kind === 'ready')
const settlement = computed(() => props.state?.settlement ?? null)
const total = computed(() => props.state?.expenses.reduce((sum, e) => sum + e.amount, 0) ?? 0)
const onlineCount = computed(() => props.state?.members.filter((m) => m.online).length ?? 0)
/** 結算前的即時預覽，以進位計算；實際結果依房主結算時的選擇 */
const previewBalances = computed(() =>
  props.state ? computeBalances(props.state.members, props.state.expenses, 'ceil') : {},
)
const myBalance = computed(() => previewBalances.value[props.clientId] ?? null)
const isOutsider = computed(() => !isHost.value && ['removed', 'pending', 'rejected'].includes(props.membership))
const showRoom = computed(() => !!props.state && !isOutsider.value)
const pendingRequests = computed(() => (isHost.value ? (props.state?.joinRequests ?? []) : []))
const promptRequest = computed(() =>
  sheet.value ? null : (pendingRequests.value.find((r) => !dismissedRequests.value.has(r.id)) ?? null),
)

const statusText = computed(() => {
  const s = props.status
  switch (s.kind) {
    case 'connecting':
      return isHost.value ? '正在開啟房間…' : '正在連線到房主…'
    case 'ready':
      return props.state ? `${onlineCount.value}/${props.state.members.length} 人在線` : '已連線'
    case 'reconnecting':
      return `連線中斷，重新連線中（第 ${s.attempt} 次）`
    case 'closed':
      return '已離線'
    case 'failed':
      return {
        'room-not-found': '找不到這個房間，請確認邀請連結，或房主是否還在線上',
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

function toggleExpense(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function submitExpense(draft: ExpenseDraft) {
  const current = sheet.value
  if (current?.kind === 'edit') emit('intent', { kind: 'updateExpense', expenseId: current.expense.id, ...draft })
  else emit('intent', { kind: 'addExpense', ...draft })
  sheet.value = null
}

function openRename() {
  if (!props.state) return
  renameInput.value = props.state.name
  sheet.value = { kind: 'rename' }
}

function submitRename() {
  const name = cleanRoomName(renameInput.value)
  if (!name) return
  emit('intent', { kind: 'renameRoom', name })
  sheet.value = null
}

function resolveRequest(memberId: string, approve: boolean) {
  emit('intent', { kind: 'resolveJoinRequest', memberId, approve })
}

function dismissRequest(memberId: string) {
  dismissedRequests.value = new Set([...dismissedRequests.value, memberId])
}

async function confirmLeave() {
  sheet.value = null
  const ok = await confirmAction(
    isHost.value
      ? { title: '關閉房間？', message: '你是房主，離開後其他人將無法再同步。', confirmText: '離開', danger: true }
      : { title: '離開房間？', message: '之後可以用邀請連結再加入。', confirmText: '離開' },
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
        <h1 class="room-name">{{ state?.name ?? '連線中…' }}</h1>
        <button
          v-if="showRoom && connected"
          type="button"
          class="presence-button mono"
          @click="sheet = { kind: 'members' }"
        >
          <span class="dot" />{{ statusText }} ›
          <span v-if="pendingRequests.length" class="alert-dot" aria-label="有加入申請" />
        </button>
        <p v-else class="status mono" :class="status.kind" role="status"><span class="dot" />{{ statusText }}</p>
      </div>
      <div class="header-actions">
        <button type="button" class="outline" @click="sheet = { kind: 'invite' }">邀請</button>
        <button type="button" class="icon-button" aria-label="更多" @click="sheet = { kind: 'menu' }">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </div>
    </header>

    <p v-if="noticeText" class="error notice-line">
      {{ noticeText }}
      <button v-if="notice === 'version-mismatch'" class="text-link" @click="reload">重新整理</button>
    </p>

    <MembershipNotice
      v-if="isOutsider"
      :membership="membership"
      @request-rejoin="emit('requestRejoin')"
      @leave="confirmLeave"
    />

    <template v-else-if="state">
      <SettlementResult
        v-if="settlement"
        :state="state"
        :settlement="settlement"
        :client-id="clientId"
        :is-host="isHost"
        @intent="emit('intent', $event)"
      />

      <button
        v-if="settlement && state.expenses.length"
        type="button"
        class="outline block items-toggle"
        :aria-expanded="showSettledItems"
        @click="showSettledItems = !showSettledItems"
      >
        {{ showSettledItems ? '收起帳目' : `查看帳目（${state.expenses.length} 筆）` }}
      </button>

      <section v-if="!settlement || showSettledItems" class="paper">
        <button
          v-if="!settlement && myBalance && state.expenses.length"
          type="button"
          class="balance-head"
          @click="sheet = { kind: 'balances' }"
        >
          <span class="balance-figure">
            <span class="hint">{{ myBalance.net < 0 ? '目前你應付' : myBalance.net > 0 ? '目前你應收' : '目前你' }}</span>
            <span class="mono hero-amount" :class="{ owe: myBalance.net < 0 }">
              {{ myBalance.net === 0 ? '打平' : formatAmount(Math.abs(myBalance.net)) }}
            </span>
          </span>
          <span class="hint">大家的收支 ›</span>
        </button>

        <p v-if="!state.expenses.length" class="hint empty">還沒有帳目。誰先付了錢，就由誰記一筆。</p>
        <ul class="line-items">
          <ExpenseItem
            v-for="e in state.expenses"
            :key="e.id"
            :expense="e"
            :members="state.members"
            :client-id="clientId"
            :is-host="isHost"
            :locked="!!settlement || !connected"
            :expanded="expandedId === e.id"
            @toggle="toggleExpense(e.id)"
            @intent="emit('intent', $event)"
            @edit="sheet = { kind: 'edit', expense: $event }"
          />
        </ul>
        <div v-if="state.expenses.length" class="total-row mono">
          <span>TOTAL</span>
          <span>{{ formatAmount(total) }}</span>
        </div>
      </section>
    </template>

    <p v-else-if="status.kind !== 'failed' && !notice" class="hint center">等待房間資料…</p>

    <div v-if="showRoom && !settlement" class="dock" :class="{ split: isHost }">
      <button v-if="isHost" type="button" class="outline paper-fill" :disabled="!connected" @click="sheet = { kind: 'settle' }">
        結算
      </button>
      <button type="button" class="ink" :disabled="!connected" @click="sheet = { kind: 'add' }">
        {{ connected ? '＋ 記一筆' : '連線恢復後才能記帳' }}
      </button>
    </div>

    <!-- 底部表單 -->
    <InviteSheet
      v-if="sheet?.kind === 'invite'"
      :room-name="state?.name ?? roomCode"
      :join-url="joinUrl"
      @close="sheet = null"
    />

    <BottomSheet v-if="sheet?.kind === 'menu'" label="MENU" @close="sheet = null">
      <div class="menu">
        <button v-if="isHost && state" type="button" class="menu-item" @click="openRename">修改房間名稱</button>
        <button type="button" class="menu-item danger" @click="confirmLeave">{{ isHost ? '關閉房間' : '離開房間' }}</button>
      </div>
    </BottomSheet>

    <BottomSheet v-if="state && sheet?.kind === 'members'" label="MEMBERS" @close="sheet = null">
      <div class="expense-form">
        <JoinRequests v-if="pendingRequests.length" :requests="pendingRequests" @intent="emit('intent', $event)" />
        <MemberList
          :state="state"
          :client-id="clientId"
          :is-host="isHost"
          :connection-kinds="connectionKinds"
          @intent="emit('intent', $event)"
        />
      </div>
    </BottomSheet>

    <BottomSheet v-if="state && sheet?.kind === 'balances'" label="BALANCE" @close="sheet = null">
      <div class="expense-form">
        <p class="hint">預覽以小數進位計算；實際結果以房主結算時的選擇為準</p>
        <BalanceSummary :members="state.members" :balances="previewBalances" :client-id="clientId" />
      </div>
    </BottomSheet>

    <SettleSheet
      v-if="state && sheet?.kind === 'settle'"
      :state="state"
      @intent="emit('intent', $event)"
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

    <BottomSheet v-if="promptRequest" label="JOIN REQUEST" @close="dismissRequest(promptRequest.id)">
      <div class="confirm">
        <p class="confirm-title">{{ promptRequest.nickname }} 想重新加入房間</p>
        <p class="hint">他之前被移出房間。同意後會重新加入，並參與所有帳目。</p>
        <div class="button-pair">
          <button type="button" class="outline" @click="resolveRequest(promptRequest.id, false)">拒絕</button>
          <button type="button" class="ink" @click="resolveRequest(promptRequest.id, true)">同意</button>
        </div>
      </div>
    </BottomSheet>
  </section>
</template>
