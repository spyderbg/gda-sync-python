<script setup lang="ts">
// RngPresetManager's "RNG Picker##7" window (C++'s ImGuiDraw), the RNG tool of a build whose math details are hidden
// (its config's mathDetailsHidden): the main round's stops to add, comma-separated, and the last ten texts added.
import { computed } from 'vue';
import type { RngPresetManager } from '@game/integration/RngPresetManager/RngPresetManager';
import ToolWindow from './ToolWindow.vue';

const props = defineProps<{ manager: RngPresetManager; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

const text = computed({
  get: () => {
    void props.tick;
    return props.manager.m_unlockWindowText;
  },
  set: value => {
    props.manager.m_unlockWindowText = value;
  },
});
const history = computed(() => {
  void props.tick;
  return [...props.manager.m_unlockWindowTextLines];
});

function add() {
  props.manager.AddUnlockWindowText();
  emit('changed');
}

function close() {
  props.manager.m_imguiUnlockWindowOpen.value = false;
  emit('changed');
}
</script>

<template>
  <ToolWindow title="RNG Picker" :width="480" :offset="1" @close="close">
    <label for="rng-unlock-rngs" class="mb-1">Rngs to add:</label>
    <div class="input-group input-group-sm mb-2">
      <input id="rng-unlock-rngs" v-model="text" class="form-control" type="text" inputmode="numeric" autocomplete="off" @keydown.enter.prevent="add">
      <div class="input-group-append"><button type="button" class="btn btn-outline-primary" @click="add">Add</button></div>
    </div>
    <div>History:</div>
    <pre class="rng-unlock-history mb-0">{{ history.join('\n') }}</pre>
  </ToolWindow>
</template>

<style scoped lang="scss">
.rng-unlock-history {
  max-height: 160px;
  overflow: auto;
}
</style>
