<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

// A Bootstrap dropdown: the toggle slot opens the menu; clicking outside or pressing Escape closes it.
withDefaults(defineProps<{ tag?: string; menuClass?: string }>(), { tag: 'div', menuClass: '' });
const open = ref(false);
const root = ref<HTMLElement>();
const toggle = () => { open.value = !open.value; };
const close = () => { open.value = false; };

function onPointer(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) close();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}
function listen(active: boolean) {
  if (active) {
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('mousedown', onPointer);
    document.removeEventListener('keydown', onKeydown);
  }
}
watch(open, listen);
onBeforeUnmount(() => listen(false));
</script>

<template>
  <component :is="tag" ref="root" :class="['dropdown', { show: open }]">
    <slot name="toggle" :open="open" :toggle="toggle" />
    <div v-if="open" :class="['dropdown-menu', menuClass, 'show']" @click="close"><slot /></div>
  </component>
</template>
