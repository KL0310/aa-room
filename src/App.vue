<script setup lang="ts">
import ConfirmDialog from './components/ConfirmDialog.vue'
import HomeView from './components/HomeView.vue'
import RoomView from './components/RoomView.vue'
import { loadNickname } from './storage'
import { readRoomFromUrl, useRoomSession } from './useRoomSession'

const session = useRoomSession()
const invitedCode = readRoomFromUrl()
// 透過邀請連結進來、且不是重新整理回到原本的房間時，先向房主詢問房間名稱
if (!session.resume() && invitedCode) session.startPreview(invitedCode)
</script>

<template>
  <main class="app">
    <RoomView
      v-if="session.role.value && session.roomCode.value"
      :role="session.role.value"
      :room-code="session.roomCode.value"
      :state="session.state.value"
      :status="session.status.value"
      :notice="session.notice.value"
      :membership="session.membership.value"
      :client-id="session.clientId"
      :connection-kinds="session.connectionKinds.value"
      :join-url="session.joinUrl.value"
      @intent="session.dispatch"
      @request-rejoin="session.requestRejoin"
      @leave="session.leave"
    />
    <HomeView
      v-else
      :initial-code="readRoomFromUrl()"
      :initial-nickname="loadNickname()"
      :invite-info="session.inviteInfo.value"
      @create="session.createRoom"
      @join="session.joinRoom"
      @cancel-invite="session.stopPreview"
    />
    <ConfirmDialog />
  </main>
</template>
