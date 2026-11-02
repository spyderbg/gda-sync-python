// Egt::Integration::IRngQueueGridPreview and IRngGridPreview (Egt/Integration/Runtime/IRngQueueGridPreview.h,
// IRngGridPreview.h): what a queued sequence would show, which the RNG Queue's and the RNG Presets' tooltips draw. The
// C++ preview draws itself with ImGui (ImGuiDraw); the browser's gives what to draw, which debug/RngGridPreview.vue
// draws the same way: a symbol's IMAGE_RNG_PICKER_<name> image, or its name on a colour of its id.

import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import type { RngSequence } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';

/** A cell of a preview's grid (ImGuiDrawMiniSymbolCell): the symbol's image, else its name on its colour's hue. */
export interface RngGridPreviewCell {
  text: string;
  image: ImageData | null;
  hue: number;
}

/** A wheel's or a gamble's sector (ImGuiDrawWheelSectorImage): its image at a height, else its name. */
export interface RngGridPreviewSector {
  text: string;
  image: ImageData | null;
  height: number;
}

/// Precomputed, drawable RNG grid preview handle (factory product of
/// IRngQueueGridPreview::BuildPreview). Building runs the (potentially
/// expensive) round math once; drawing it is cheap and safe to call every
/// frame (e.g. inside a tooltip). Not a Runtime-registered service.
export interface IRngGridPreview {
  /** The symbols the round stops on, a grid per screen (the tetra round's four), by reel and row. */
  GetReelGrids(): RngGridPreviewCell[][][];
  /** How many grids a row of the preview has: two of four, else all. */
  GetGridsPerRow(): number;
  GetWheelSector(): RngGridPreviewSector | null;
}

export type IRngGridPreviewPtr = IRngGridPreview | null;

export interface IRngQueueGridPreview {
  BuildPreview(roundType: GameRoundType, rngSequence: RngSequence): IRngGridPreviewPtr;
}

export const IRngQueueGridPreview = Interface<IRngQueueGridPreview>('IRngQueueGridPreview');
