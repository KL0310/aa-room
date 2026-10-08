<script setup lang="ts">
import QRCode from 'qrcode'
import { ref, watchEffect } from 'vue'

const props = defineProps<{ text: string }>()
const dataUrl = ref('')

watchEffect(async () => {
  const text = props.text
  const url = await QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  if (text === props.text) dataUrl.value = url
})
</script>

<template>
  <img v-if="dataUrl" class="qr" :src="dataUrl" :alt="`加入房間的 QR code：${text}`" width="240" height="240" />
</template>
