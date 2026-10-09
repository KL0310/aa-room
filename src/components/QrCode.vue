<script setup lang="ts">
import QRCode from 'qrcode'
import { ref, watchEffect } from 'vue'

const props = defineProps<{ text: string }>()
const dataUrl = ref('')

watchEffect(async () => {
  const text = props.text
  const url = await QRCode.toDataURL(text, {
    margin: 0,
    width: 360,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  if (text === props.text) dataUrl.value = url
})
</script>

<template>
  <img v-if="dataUrl" class="qr" :src="dataUrl" :alt="`加入房間的 QR code：${text}`" width="180" height="180" />
</template>
