<script setup lang="ts">
// 撕邊收據造型的 Logo，與 index.html 的 favicon 為同一個圖形
withDefaults(defineProps<{ size?: number }>(), { size: 64 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="AA Room">
    <path d="M12 6H52V54L47 59L42 54L37 59L32 54L27 59L22 54L17 59L12 54Z" fill="#1a1a1a" />
    <path
      d="M17 42L24 17L31 42M19.6 34H28.4M33 42L40 17L47 42M35.6 34H44.4"
      fill="none"
      stroke="#fbfaf6"
      stroke-width="4"
    />
  </svg>
</template>
