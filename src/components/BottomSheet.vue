<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <section class="sheet" role="dialog" aria-modal="true" :aria-label="label">
        <header class="sheet-head">
          <span class="mono-label">{{ label }}</span>
          <button type="button" class="icon-button" aria-label="關閉" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
