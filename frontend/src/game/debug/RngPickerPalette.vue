<script setup lang="ts">
// A palette of the RNG Picker (C++'s SymbolPalette): "Symbols", five a row.
import type { RoundType, SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import type { SymbolPaletteView } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/RngToolReelRoundSubscreen';
import RngSymbolButton from './RngSymbolButton.vue';

defineProps<{ module: AlphaFamilyMathRngTool; roundType: RoundType; palette: SymbolPaletteView; label: string }>();
const emit = defineEmits<{ symbol: [symbolId: SymbolId] }>();
</script>

<template>
  <div class="rng-palette" role="group" :aria-label="label">
    <div>Symbols</div>
    <div class="rng-palette-symbols">
      <RngSymbolButton v-for="symbol in palette.symbols" :key="symbol.symbolId" v-bind="module.GetSymbolButton(roundType, symbol.symbolId)"
        :selected="symbol.isSelected" :searched="symbol.isSearched" :disabled="symbol.isDisabled || !palette.isEnabled" @press="emit('symbol', symbol.symbolId)" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.rng-palette-symbols {
  display: grid;
  grid-template-columns: repeat(5, 36px);
  gap: 3px;
  margin-top: 0.15rem;
}
</style>
