<script setup lang="ts">
// The RNG Queue window of RngPresetManager (C++'s ImGuiDraw, "RNG Queue"): the queued RNG sequences, the next round's
// first, each opened to its numbers; Clear All, Copy Rngs, the visible columns and what a row's tooltip shows; each
// row's ↓ ↑ x, and dragging a row onto another moves it there.
import { computed, reactive, ref } from 'vue';
import {
  type RngPresetManager, RngPresetManager as Manager, type RngQueueRow, RngQueueDataColumnCount, RngQueueTooltipContentCount,
} from '@game/integration/RngPresetManager/RngPresetManager';
import RngGridPreview from './RngGridPreview.vue';
import ToolPanel from './ToolPanel.vue';

const props = defineProps<{ manager: RngPresetManager; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

const columns = Array.from({ length: RngQueueDataColumnCount }, (_, index) => ({ index, name: Manager.GetRngQueueDataColumnName(index) }));
const tooltipContents = Array.from({ length: RngQueueTooltipContentCount }, (_, index) => ({ index, name: Manager.GetRngQueueTooltipContentName(index) }));

const rows = computed(() => {
  void props.tick;
  return props.manager.GetRngQueueRows();
});
const visible = computed(() => {
  void props.tick;
  return [...props.manager.m_rngQueueColumnVisible];
});
const tooltipColumn = computed(() => {
  void props.tick;
  return props.manager.m_rngQueueTooltipColumn;
});

/** The open rows, by their tree node's label ("1. Main"), as ImGui keeps them. */
const open = reactive(new Set<string>());
const menu = ref<'columns' | 'tooltip' | null>(null);
const dragFrom = ref<number | null>(null);
const hover = ref<{ row: RngQueueRow; x: number; y: number } | null>(null);
const tooltip = computed(() => (hover.value ? props.manager.GetRngQueueRowTooltip(hover.value.row) : null));

function run(command: () => void) {
  command();
  emit('changed');
}

async function copyRngs() {
  try {
    await navigator.clipboard.writeText(props.manager.GetRngsAsText());
  } catch {
    window.prompt('Copy the RNGs', props.manager.GetRngsAsText());
  }
}

function toggle(row: RngQueueRow) {
  const label = row.columnTexts[0];
  if (open.has(label)) open.delete(label);
  else open.add(label);
}

function drop(toIndex: number) {
  if (dragFrom.value !== null && dragFrom.value !== toIndex) {
    const fromIndex = dragFrom.value;
    run(() => props.manager.MoveOverrideRngTo(fromIndex, toIndex));
  }
  dragFrom.value = null;
}

function showTooltip(row: RngQueueRow, event: MouseEvent) {
  hover.value = { row, x: event.clientX + 14, y: event.clientY + 14 };
}

</script>

<template>
  <ToolPanel title="RNG Queue">
    <div class="rng-queue-commands">
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="run(() => manager.DeleteAllOverrideRngs())">Clear All</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="copyRngs">Copy Rngs</button>
      <div class="rng-queue-combo">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="menu === 'columns'" :title="manager.BuildRngQueueVisibleColumnsPreview()" @click="menu = menu === 'columns' ? null : 'columns'">Visible Columns <i class="mdi mdi-menu-down" aria-hidden="true" /></button>
        <div v-if="menu === 'columns'" class="rng-queue-combo-menu card shadow-sm">
          <label v-for="column in columns" :key="column.index" class="mb-0">
            <input type="checkbox" :checked="visible[column.index]" :disabled="column.index === 0 || (visible[column.index] && visible.filter(Boolean).length <= 1)"
              @change="run(() => manager.SetRngQueueColumnVisible(column.index, ($event.target as HTMLInputElement).checked))"> {{ column.name }}
          </label>
        </div>
      </div>
      <div class="rng-queue-combo">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="menu === 'tooltip'" @click="menu = menu === 'tooltip' ? null : 'tooltip'">Tooltip Content <i class="mdi mdi-menu-down" aria-hidden="true" /></button>
        <div v-if="menu === 'tooltip'" class="rng-queue-combo-menu card shadow-sm">
          <label v-for="content in tooltipContents" :key="content.index" class="mb-0">
            <input type="radio" name="rng-queue-tooltip" :checked="tooltipColumn === content.index" @change="run(() => (manager.m_rngQueueTooltipColumn = content.index))"> {{ content.name }}
          </label>
        </div>
      </div>
    </div>

    <table class="rng-queue-table">
      <thead>
        <tr>
          <template v-for="column in columns" :key="column.index"><th v-if="visible[column.index]" scope="col">{{ column.name }}</th></template>
          <th scope="col"><span class="sr-only">Commands</span></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, position) in rows" :key="position">
          <tr :style="{ background: row.background ?? undefined }" draggable="true" :class="{ 'rng-queue-drop': dragFrom !== null && dragFrom !== position }"
            @dragstart="dragFrom = position" @dragend="dragFrom = null" @dragover.prevent @drop.prevent="drop(position)"
            @mousemove="showTooltip(row, $event)" @mouseleave="hover = null">
            <td>
              <button type="button" class="rng-queue-node" :aria-expanded="open.has(row.columnTexts[0])" @click="toggle(row)">
                <i :class="['mdi', open.has(row.columnTexts[0]) ? 'mdi-chevron-down' : 'mdi-chevron-right']" aria-hidden="true" />{{ row.columnTexts[0] }}
              </button>
            </td>
            <td v-if="visible[1]" class="rng-queue-name"><span :class="{ 'text-muted': row.columnTexts[1] === '--' }">{{ row.columnTexts[1] }}</span></td>
            <td v-if="visible[2]" class="text-muted">--</td>
            <td v-if="visible[3]" class="text-muted rng-queue-numbers">{{ row.columnTexts[3] }}</td>
            <td v-if="visible[4]" class="text-muted rng-queue-numbers">{{ row.columnTexts[4] }}</td>
            <td class="rng-queue-row-commands">
              <button type="button" class="btn btn-light btn-sm" title="Move down" :disabled="position + 1 >= rows.length" @click="run(() => manager.MoveOverrideRngsDown(position))">↓</button>
              <button type="button" class="btn btn-light btn-sm" title="Move up" :disabled="position === 0" @click="run(() => manager.MoveOverrideRngsUp(position))">↑</button>
              <button type="button" class="btn btn-danger btn-sm" title="Delete" @click="run(() => manager.DeleteOverrideRngsAt(position))">x</button>
            </td>
          </tr>
          <template v-if="open.has(row.columnTexts[0])">
            <tr v-for="(child, index) in row.children" :key="`${position}:${index}`" :style="{ background: child.background ?? undefined }" class="rng-queue-child"
              @mousemove="showTooltip(child, $event)" @mouseleave="hover = null">
              <td>{{ child.columnTexts[0] }}</td>
              <td v-if="visible[1]" class="text-muted">--</td>
              <td v-if="visible[2]">{{ child.columnTexts[2] }}</td>
              <td v-if="visible[3]">{{ child.columnTexts[3] }}</td>
              <td v-if="visible[4]">{{ child.columnTexts[4] }}</td>
              <td />
            </tr>
          </template>
        </template>
        <tr v-if="!rows.length"><td :colspan="visible.filter(Boolean).length + 1" class="text-muted">The queue is empty: the next rounds play the game server's random numbers.</td></tr>
      </tbody>
    </table>

    <div v-if="hover && tooltip" class="rng-queue-tooltip card shadow-sm" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }">
      <RngGridPreview v-if="'preview' in tooltip" :preview="tooltip.preview" />
      <span v-else>{{ tooltip.text }}</span>
    </div>
  </ToolPanel>
</template>

<style scoped lang="scss">
.rng-queue-commands {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}

.rng-queue-combo {
  position: relative;
}

.rng-queue-combo-menu {
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  min-width: 140px;
  padding: 0.35rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.rng-queue-table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.15rem 0.35rem;
    border-bottom: 1px solid #e3e6ea;
    vertical-align: top;
  }

  th {
    font-weight: 600;
  }
}

.rng-queue-node {
  padding: 0;
  border: 0;
  background: none;
  white-space: nowrap;
  cursor: pointer;
}

.rng-queue-name {
  font-size: 0.8em;
}

.rng-queue-numbers {
  overflow-wrap: anywhere;
}

.rng-queue-child td:first-child {
  padding-left: 1.4rem;
}

.rng-queue-row-commands {
  white-space: nowrap;
  text-align: right;

  .btn {
    padding: 0 0.35rem;
    line-height: 1.3;
  }
}

.rng-queue-drop {
  outline: 1px dashed #4b49ac;
}

.rng-queue-tooltip {
  position: fixed;
  z-index: 1060;
  max-width: 480px;
  padding: 0.35rem 0.5rem;
  pointer-events: none;
}
</style>
