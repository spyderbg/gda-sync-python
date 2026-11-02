<script setup lang="ts">
// A reel round's screen in the RNG Picker (C++'s RngToolReelRoundSubscreen::ImGuiDraw): the reels and their palette,
// Reel Set and Line Set; the transform step; the hold and spin's phases. Its clicks go back to the screen as a click
// of a frame (Draw(click)). Shift-click a cell of the Line Set's payline to mark the line up to it.
import type { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import type { CounterView, SubscreenClick, SubscreenView } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/RngToolReelRoundSubscreen';
import RngPickerGrid from './RngPickerGrid.vue';
import RngPickerPalette from './RngPickerPalette.vue';

const props = defineProps<{ module: AlphaFamilyMathRngTool; roundType: RoundType; view: SubscreenView; index: number }>();
const emit = defineEmits<{ click: [click: SubscreenClick] }>();

function counter(kind: 'reelSet' | 'lineNumber', view: CounterView, value: number) {
  if (Number.isFinite(value)) emit('click', { kind, value: Math.min(Math.max(Math.round(value), view.min), view.max) });
}

const name = (what: string) => `${what}${props.index ? ` ${props.index + 1}` : ''}`;
</script>

<template>
  <div class="rng-subscreen">
    <div class="rng-subscreen-reeling">
      <RngPickerGrid :module="module" :round-type="roundType" :grid="view.reeling.grid" :label="name('Reel grid')"
        @cell="(coord, shift) => emit('click', { kind: 'reelingCell', coord, shift })" @up="reel => emit('click', { kind: 'reelingUp', reel })" @down="reel => emit('click', { kind: 'reelingDown', reel })" />
      <div>
        <RngPickerPalette :module="module" :round-type="roundType" :palette="view.reeling.palette" :label="name('Reel palette')" @symbol="symbolId => emit('click', { kind: 'reelingPalette', symbolId })" />
        <div v-for="item in [view.reeling.reelSet && { kind: 'reelSet' as const, view: view.reeling.reelSet }, view.reeling.lineSet && { kind: 'lineNumber' as const, view: view.reeling.lineSet }].filter(Boolean)" :key="item!.kind" class="rng-counter">
          <span>{{ item!.view.label }}</span>
          <button type="button" class="rng-counter-step" :aria-label="`${item!.view.label} down`" :disabled="item!.view.value <= item!.view.min" @click="counter(item!.kind, item!.view, item!.view.value - 1)"><i class="mdi mdi-menu-down" aria-hidden="true" /></button>
          <input type="number" class="rng-counter-value" :aria-label="item!.view.label" :min="item!.view.min" :max="item!.view.max" :value="item!.view.value" @change="counter(item!.kind, item!.view, ($event.target as HTMLInputElement).valueAsNumber)">
          <button type="button" class="rng-counter-step" :aria-label="`${item!.view.label} up`" :disabled="item!.view.value >= item!.view.max" @click="counter(item!.kind, item!.view, item!.view.value + 1)"><i class="mdi mdi-menu-up" aria-hidden="true" /></button>
        </div>
      </div>
    </div>

    <template v-if="view.transform">
      <div :class="['rng-separator', { 'text-muted': !view.transform.isEnabled }]">Transform</div>
      <select class="custom-select custom-select-sm rng-distribution" :disabled="!view.transform.isEnabled" :value="view.transform.distributionIndex" :aria-label="name('Transform distribution')"
        @change="emit('click', { kind: 'distribution', index: Number(($event.target as HTMLSelectElement).value) })">
        <option v-for="(distribution, index) in view.transform.distributions" :key="index" :value="index">{{ distribution }}</option>
      </select>
      <div class="rng-subscreen-reeling">
        <RngPickerGrid :module="module" :round-type="roundType" :grid="view.transform.grid" :label="name('Transform Coins')" @cell="coord => emit('click', { kind: 'transformCell', coord })" />
        <RngPickerPalette :module="module" :round-type="roundType" :palette="view.transform.palette" :label="name('Transform palette')" @symbol="symbolId => emit('click', { kind: 'transformPalette', symbolId })" />
      </div>
    </template>

    <template v-if="view.holdAndSpin">
      <div v-if="!view.holdAndSpin.triggered" class="rng-separator">Hold &amp; Spin is NOT triggered</div>
      <template v-else>
        <div class="rng-separator">
          Hold &amp; Spin {{ view.holdAndSpin.phaseIndex + 1 }}/{{ view.holdAndSpin.phaseCount }}
          <button type="button" class="rng-counter-step" aria-label="Previous hold and spin" :disabled="!view.holdAndSpin.isEnabled || view.holdAndSpin.phaseIndex === 0" @click="emit('click', { kind: 'holdAndSpinPhase', delta: -1 })"><i class="mdi mdi-menu-left" aria-hidden="true" /></button>
          <button type="button" class="rng-counter-step" aria-label="Next hold and spin" :disabled="!view.holdAndSpin.isEnabled || view.holdAndSpin.phaseIndex === view.holdAndSpin.phaseCount - 1" @click="emit('click', { kind: 'holdAndSpinPhase', delta: 1 })"><i class="mdi mdi-menu-right" aria-hidden="true" /></button>
        </div>
        <div class="rng-subscreen-reeling">
          <RngPickerGrid :module="module" :round-type="roundType" :grid="view.holdAndSpin.grid" :label="name('Hold and Spin Grid')" @cell="coord => emit('click', { kind: 'holdAndSpinCell', coord })" />
          <RngPickerPalette :module="module" :round-type="roundType" :palette="view.holdAndSpin.palette" :label="name('Hold and Spin palette')" @symbol="symbolId => emit('click', { kind: 'holdAndSpinPalette', symbolId })" />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.rng-subscreen-reeling {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
}

.rng-counter {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-top: 0.35rem;

  span {
    margin-right: 0.35rem;
  }
}

.rng-counter-step {
  padding: 0 0.2rem;
  border: 0;
  border-radius: 3px;
  background: #e9ecef;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.rng-counter-value {
  width: 3.5em;
  padding: 0 0.2rem;
  border: 1px solid #ced4da;
  border-radius: 3px;
  text-align: center;
}

.rng-separator {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.6rem 0 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid #dee2e6;
  font-weight: 600;
}

.rng-distribution {
  width: auto;
  margin-bottom: 0.35rem;
}
</style>
