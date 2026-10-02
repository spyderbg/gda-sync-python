<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

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
  document.body.classList.add('modal-open');
  dialog.value?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('modal-open');
  previous?.focus();
});
</script>

<template>
  <div class="modal fade show d-block" role="dialog" aria-modal="true" :aria-label="title" @mousedown.self="emit('close')">
    <div ref="dialog" :class="['modal-dialog', 'modal-dialog-centered', { 'modal-lg': wide }]" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ title }}</h5>
          <button type="button" class="close" aria-label="Close dialog" @click="emit('close')"><span aria-hidden="true">&times;</span></button>
        </div>
        <slot />
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show" />
</template>
