<script setup lang="ts">
// A queued sequence's preview (C++'s RngQueueGridPreview::GridPreview::ImGuiDraw): the symbols the round would stop on,
// a mini grid per screen (two per row of the tetra round's four), or the wheel's sector, or "Grid preview unavailable".
// A symbol's name on its colour shows until its image has loaded (the backend decodes an image file when first asked).
import type { IRngGridPreviewPtr } from '@game/integration/Runtime/IRngQueueGridPreview';
import RssImage from './RssImage.vue';

defineProps<{ preview: IRngGridPreviewPtr }>();

/** kMiniGridCellSize */
const CellSize = 18;
</script>

<template>
  <div v-if="preview && preview.GetReelGrids().length" class="rng-grid-preview" :style="{ gridTemplateColumns: `repeat(${preview.GetGridsPerRow()}, auto)` }">
    <table v-for="(grid, gridIndex) in preview.GetReelGrids()" :key="gridIndex" class="rng-grid">
      <tbody>
        <tr v-for="row in grid[0]?.length ?? 0" :key="row">
          <td v-for="(reel, reelIndex) in grid" :key="reelIndex">
            <span class="rng-grid-cell" :style="{ background: `hsl(${reel[row - 1].hue * 360}, 60%, 40%)` }" :title="reel[row - 1].text">
              {{ reel[row - 1].text }}
              <RssImage v-if="reel[row - 1].image" class="rng-grid-image" :image="reel[row - 1].image!" :width="CellSize" :height="CellSize" :title="reel[row - 1].text" />
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else-if="preview?.GetWheelSector()" class="rng-grid-sector">
    <span>{{ preview.GetWheelSector()!.text }}</span>
    <RssImage v-if="preview.GetWheelSector()!.image" class="rng-grid-image" :image="preview.GetWheelSector()!.image!" :height="preview.GetWheelSector()!.height" :title="preview.GetWheelSector()!.text" />
  </div>
  <div v-else>Grid preview unavailable</div>
</template>

<style scoped lang="scss">
.rng-grid-preview {
  display: grid;
  gap: 0.35rem;
}

.rng-grid {
  border-collapse: collapse;

  td {
    padding: 0;
  }
}

.rng-grid-cell {
  position: relative;
  display: block;
  width: 18px;
  height: 18px;
  overflow: hidden;
  color: #fff;
  font-size: 9px;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}

.rng-grid-sector {
  position: relative;
  min-height: 1.5em;
}

// over the name, once loaded
.rng-grid-image {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
