<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDivElement>();
let previous: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
  if (event.key !== 'Tab') return;
  // Keep keyboard focus inside the dialog.
  const elements = dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
  if (!elements?.length) return;
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => {
  previous = document.activeElement as HTMLElement | null;
  dialog.value?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  previous?.focus();
});
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <div ref="dialog" :class="['modal', { 'modal-wide': wide }]" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-header"><h2>{{ title }}</h2><button class="icon-button" aria-label="Close dialog" @click="emit('close')"><X :size="19" /></button></div>
      <slot />
    </div>
  </div>
</template>
