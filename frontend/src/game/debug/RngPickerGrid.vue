<script setup lang="ts">
// A grid of the RNG Picker (C++'s ImGuiGridEdit): the symbols by row and reel, arrows over and under the reels that move
// each reel a stop, and the reels' stops under them.
import type { RoundType, SymbolGridCoordinates } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import type { SymbolGridView } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/RngToolReelRoundSubscreen';
import RngSymbolButton from './RngSymbolButton.vue';

defineProps<{ module: AlphaFamilyMathRngTool; roundType: RoundType; grid: SymbolGridView; label: string }>();
const emit = defineEmits<{ cell: [coord: SymbolGridCoordinates, shift: boolean]; up: [reel: number]; down: [reel: number] }>();
</script>

<template>
  <table class="rng-grid" :aria-label="label">
    <tbody>
      <tr v-if="grid.hasArrows">
        <td v-for="(_, reel) in grid.rows[0]" :key="reel"><button type="button" class="rng-arrow" :disabled="!grid.isEnabled" :aria-label="`Reel ${reel + 1}: next stop`" @click="emit('up', reel)"><i class="mdi mdi-menu-up" aria-hidden="true" /></button></td>
      </tr>
      <tr v-for="(row, rowIndex) in grid.rows" :key="rowIndex">
        <td v-for="cell in row" :key="cell.coord.reelId">
          <RngSymbolButton v-bind="module.GetSymbolButton(roundType, cell.symbolId)" :selected="cell.isSelected" :searched="cell.isSearched"
            :disabled="cell.isLocked || !grid.isEnabled" :line-marked="cell.isLineMarked" @press="event => emit('cell', cell.coord, event.shiftKey)" />
        </td>
      </tr>
      <tr v-if="grid.hasArrows">
        <td v-for="(_, reel) in grid.rows[0]" :key="reel"><button type="button" class="rng-arrow" :disabled="!grid.isEnabled" :aria-label="`Reel ${reel + 1}: previous stop`" @click="emit('down', reel)"><i class="mdi mdi-menu-down" aria-hidden="true" /></button></td>
      </tr>
      <tr v-if="grid.columnLabels.length">
        <td v-for="(stop, reel) in grid.columnLabels" :key="reel" class="rng-stop">{{ stop }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped lang="scss">
.rng-grid {
  border-collapse: separate;
  border-spacing: 3px;

  td {
    padding: 0;
    text-align: center;
  }
}

.rng-arrow {
  width: 36px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: #e9ecef;
  line-height: 1.1;
  cursor: pointer;
}

.rng-stop {
  font-family: monospace;
  font-size: 0.75rem;
}
</style>
