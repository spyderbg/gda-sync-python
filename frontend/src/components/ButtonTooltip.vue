<script lang="ts">
import { ref as sharedRef } from 'vue';

// Opening a balloon replaces the previous one, even while its trigger still has focus.
const activeTooltip = sharedRef<string | null>(null);
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';

defineProps<{ text: string }>();

// The trigger stays a direct child of its button group; the balloon lives outside cards that could clip it.
const id = useId();
const visible = computed(() => activeTooltip.value === id);
const focused = ref(false);
const balloon = ref<HTMLElement>();
const position = ref({ left: '0px', bottom: '0px', width: '0px', '--arrow-left': '0px', '--content-height': '0px' });
let closing: ReturnType<typeof setTimeout> | undefined;

function keepOpen() { clearTimeout(closing); }

function show(event: Event) {
  keepOpen();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  const center = rect.left + rect.width / 2;
  const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12));
  position.value = {
    left: `${left}px`, bottom: `${window.innerHeight - rect.top + 10}px`, width: `${width}px`,
    '--arrow-left': `${Math.max(12, Math.min(center - left, width - 12))}px`,
    '--content-height': `${Math.max(0, rect.top - 22)}px`,
  };
  activeTooltip.value = id;
}

function hide() { keepOpen(); if (visible.value) activeTooltip.value = null; }
function leave() {
  keepOpen();
  if (!focused.value) closing = setTimeout(hide, 150);
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
function scroll(event: Event) { if (!balloon.value?.contains(event.target as Node)) hide(); }

const bindings = computed(() => ({
  'aria-describedby': visible.value ? id : undefined,
  onMouseenter: show,
  onMouseleave: leave,
  onFocus: (event: FocusEvent) => { focused.value = true; show(event); },
  onBlur: () => { focused.value = false; leave(); },
}));

onMounted(() => {
  window.addEventListener('keydown', escape);
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', scroll, true);
});
onBeforeUnmount(() => {
  hide();
  window.removeEventListener('keydown', escape);
  window.removeEventListener('resize', hide);
  window.removeEventListener('scroll', scroll, true);
});
</script>

<template>
  <slot :bindings="bindings" />
  <Teleport to="body">
    <div v-if="visible" :id="id" ref="balloon" role="tooltip" class="button-tooltip" :style="position" @mouseenter="keepOpen" @mouseleave="leave">
      <div class="button-tooltip-content">{{ text }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.button-tooltip { position: fixed; z-index: 1080; color: #29383b; font-size: 12px; font-weight: 400; line-height: 1.5; text-align: left; }
.button-tooltip::after { content: ''; position: absolute; bottom: -5px; left: var(--arrow-left); width: 10px; height: 10px; border-right: 1px solid #c9d1dc; border-bottom: 1px solid #c9d1dc; background: #fff; transform: translateX(-50%) rotate(45deg); }
.button-tooltip-content { max-height: var(--content-height); overflow-y: auto; padding: 12px 14px; border: 1px solid #c9d1dc; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(34, 51, 70, 0.12); white-space: pre-line; overflow-wrap: anywhere; }
</style>
