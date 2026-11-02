<script setup lang="ts">
// A symbol's button in the RNG Picker (C++'s SymbolButton): its IMAGE_RNG_PICKER_ image (its name until it loads), its
// name, or "?" for any symbol; green when searched, outlined yellow when selected and red when on the marked payline,
// faded and disabled when locked.
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';
import RssImage from './RssImage.vue';

defineProps<{ text: string; image: ImageData | null; selected?: boolean; searched?: boolean; disabled?: boolean; lineMarked?: boolean }>();
const emit = defineEmits<{ press: [event: MouseEvent] }>();
</script>

<template>
  <button type="button" :class="['rng-symbol', { 'rng-symbol-selected': selected, 'rng-symbol-searched': searched, 'rng-symbol-line': lineMarked }]"
    :disabled="disabled" :title="text" :aria-label="text" :aria-pressed="selected" @click="emit('press', $event)">
    <span class="rng-symbol-text">{{ text }}</span>
    <RssImage v-if="image" class="rng-symbol-image" :image="image" :width="30" :height="30" />
  </button>
</template>

<style scoped lang="scss">
.rng-symbol {
  position: relative;
  width: 36px;
  height: 36px;
  padding: 2px;
  border: 1px solid #ced4da;
  border-radius: 3px;
  background: #f1f3f5;
  overflow: hidden;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #e2e6ea;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.rng-symbol-text {
  display: block;
  font-size: 9px;
  line-height: 30px;
  white-space: nowrap;
  overflow: hidden;
}

.rng-symbol-image {
  position: absolute;
  top: 2px;
  left: 2px;
}

.rng-symbol-searched {
  background: #009900;
  color: #fff;

  &:hover:not(:disabled) {
    background: #00cc00;
  }
}

.rng-symbol-selected {
  outline: 2px solid #ffff00;
  outline-offset: 1px;
}

.rng-symbol-line {
  outline: 2px solid #ff0000;
  outline-offset: 1px;
}
</style>
