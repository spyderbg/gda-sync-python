<script lang="ts">
/** The windows' stacking order: the last opened or clicked is in front, as ImGui brings a window to the front. */
let topZ = 1050;
</script>

<script setup lang="ts">
// A debug tool's window, as ImGui draws one over the game (ImGui::Begin(title, &open)): a title bar to drag it by and a
// close button, over the page. Its place is kept per title, and per page (the game's, the Game tools page's), in the
// browser's local storage.
import { onBeforeUnmount, reactive, ref } from 'vue';
import { GetSettingsScope } from '@game/engine/ImGuiEx/Extensions/Utils';

const props = defineProps<{ title: string; width?: number; offset?: number }>();
const emit = defineEmits<{ close: [] }>();

const storageKey = `egt-imgui-window:${GetSettingsScope() ? `${GetSettingsScope()}:` : ''}${props.title}`;
const start = 80 + (props.offset ?? 0) * 32;
const position = reactive({ x: start, y: start });
try {
  const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as { x: number; y: number } | null;
  if (saved) Object.assign(position, saved);
} catch {
  // the default place
}
// keep the window on the screen
position.x = Math.min(Math.max(0, position.x), Math.max(0, window.innerWidth - 120));
position.y = Math.min(Math.max(0, position.y), Math.max(0, window.innerHeight - 40));

let drag: { x: number; y: number } | null = null;
const zIndex = ref(++topZ);

function toFront() {
  if (zIndex.value !== topZ) zIndex.value = ++topZ;
}

function onPointerDown(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button')) return;
  drag = { x: event.clientX - position.x, y: event.clientY - position.y };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return;
  position.x = Math.min(Math.max(0, event.clientX - drag.x), window.innerWidth - 120);
  position.y = Math.min(Math.max(0, event.clientY - drag.y), window.innerHeight - 40);
}

function onPointerUp() {
  if (!drag) return;
  drag = null;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // not kept
  }
}

onBeforeUnmount(onPointerUp);
</script>

<template>
  <section class="tool-window card shadow" :style="{ left: `${position.x}px`, top: `${position.y}px`, width: width ? `${width}px` : undefined, zIndex }" role="dialog" :aria-label="title" @pointerdown.capture="toFront">
    <header class="tool-window-title" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <span>{{ title }}</span>
      <button type="button" class="tool-window-close" :aria-label="`Close ${title}`" title="Close" @click="emit('close')"><i class="mdi mdi-close" aria-hidden="true" /></button>
    </header>
    <div class="tool-window-body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.tool-window {
  position: fixed;
  z-index: 1050;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  min-width: 260px;
  display: flex;
  flex-direction: column;
  resize: both;
  overflow: hidden;
}

.tool-window-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem 0.35rem 0.75rem;
  background: #4b49ac;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: move;
  user-select: none;
  touch-action: none;
}

.tool-window-close {
  padding: 0 0.25rem;
  border: 0;
  background: none;
  color: inherit;
  line-height: 1;
  cursor: pointer;
}

.tool-window-body {
  padding: 0.5rem 0.75rem 0.75rem;
  overflow: auto;
  font-size: 0.8rem;
}
</style>
