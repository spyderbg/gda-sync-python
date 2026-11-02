// Egt::Game::IRngPreset (Egt/Game/RuntimeImport/IRngPreset.h): the kernel's queue of RNG sequences a debug tool (the
// RNG Picker, the RNG Presets) adds to; the round of the sequence's type plays them instead of the kernel's numbers.

import type { GameRoundType } from '../Math/Common.data';
import type { RngSequence } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { RuntimeCategory } from '../RuntimeCategory';

export interface IRngPreset {
  AddRngSequence(roundType: GameRoundType, sequence: RngSequence, name?: string): boolean;

  AreMathDetailsHidden(): boolean; // try to hide math details in rng tools (ie reel size, number of rolls)
}

export class IRngPresetEvents {
  static readonly RuntimeCategory = RuntimeCategory.GameDebug;
}

export const IRngPreset = Interface<IRngPreset, IRngPresetEvents>('IRngPreset');
