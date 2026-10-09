<script setup lang="ts">
import { nextTick, ref } from 'vue';

// A number that can be edited three ways: a click opens a field to type the exact value in (Enter or leaving it keeps
// it, Escape restores the value it had); in the field, Up and Down add and subtract 1 (10 with Shift); and dragging the
// number changes it by a pixel per pixel the pointer moves (10 with Shift), left and right for the x axis, up and down
// for the y axis, so it follows the pointer the way the element moves on the screen. begin marks where one change
// starts, for undo; each new value is a change.
const props = defineProps<{ value: number; axis: 'x' | 'y'; label: string }>();
const emit = defineEmits<{ change: [number]; begin: [] }>();

const DRAG_THRESHOLD = 3;
const editing = ref(false);
const text = ref('');
const field = ref<HTMLInputElement>();
let start: { x: number; y: number; value: number; pointer: number } | null = null;
let dragging = false;
let original = 0;

const shown = (value: number) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000));

function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || editing.value) return;
  start = { x: event.clientX, y: event.clientY, value: props.value, pointer: event.pointerId };
  dragging = false;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (!start || event.pointerId !== start.pointer) return;
  const moved = props.axis === 'x' ? event.clientX - start.x : event.clientY - start.y;
  if (!dragging && Math.abs(event.clientX - start.x) < DRAG_THRESHOLD && Math.abs(event.clientY - start.y) < DRAG_THRESHOLD) return;
  if (!dragging) { dragging = true; emit('begin'); }
  emit('change', start.value + Math.round(moved) * (event.shiftKey ? 10 : 1));
}
function pointerUp(event: PointerEvent) {
  if (!start || event.pointerId !== start.pointer) return;
  start = null;
  if (!dragging) void edit();
  dragging = false;
}

function cancel() { start = null; dragging = false; }

async function edit() {
  original = props.value;
  text.value = shown(props.value);
  editing.value = true;
  emit('begin');
  await nextTick();
  field.value?.focus();
  field.value?.select();
}
function commit() {
  if (!editing.value) return;
  const value = Number(text.value.trim().replace(',', '.'));
  editing.value = false;
  if (text.value.trim() !== '' && Number.isFinite(value) && value !== props.value) emit('change', value);
}
function keydown(event: KeyboardEvent) {
  // The keys edit the number: the dialog does not close on Escape, nor move between assets on the arrows.
  event.stopPropagation();
  if (event.key === 'Enter') { event.preventDefault(); commit(); }
  else if (event.key === 'Escape') {
    event.preventDefault();
    if (props.value !== original) emit('change', original);
    editing.value = false;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const current = Number(text.value.trim().replace(',', '.'));
    const next = (Number.isFinite(current) ? current : props.value) + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
    text.value = shown(next);
    emit('change', next);
  }
}
</script>

<template>
  <input v-if="editing" ref="field" v-model="text" type="text" inputmode="decimal" class="number-scrub-field" :aria-label="label" @keydown="keydown" @blur="commit" @click.stop>
  <button v-else type="button" :class="['number-scrub', `is-${axis}`]" :aria-label="`${label}: ${shown(value)}`" :title="`Click to type ${axis}, then Up and Down to step it, or drag ${axis === 'x' ? 'left and right' : 'up and down'} to change it`"
          @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancel" @click.stop @keydown.enter.prevent="edit" @keydown.space.prevent="edit">{{ shown(value) }}</button>
</template>

<style scoped>
.number-scrub { min-width: 44px; padding: 1px 4px; border: 1px dashed transparent; border-radius: 3px; background: transparent; color: inherit; font: inherit; font-variant-numeric: tabular-nums; text-align: right; touch-action: none; user-select: none; }
.number-scrub.is-x { cursor: ew-resize; }
.number-scrub.is-y { cursor: ns-resize; }
.number-scrub:hover, .number-scrub:focus-visible { border-color: #90a4ae; background: #f5f7f9; }
.number-scrub-field { width: 64px; padding: 0 4px; border: 1px solid #2196f3; border-radius: 3px; font: inherit; font-variant-numeric: tabular-nums; text-align: right; }
</style>
