// Egt::Integration::IRngPresetManager (Egt/Integration/Runtime/IRngPresetManager.h): the RNG Queue as the gameflow
// sees it. While a round runs on a queued sequence, ShouldOverrideRng is true and GetOverrideRng is its engine.

import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import type { IRng, RngSequence } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IRngPresetManager {
  ShouldOverrideRng(): boolean;
  GetOverrideRng(): IRng;
  AddRngSequence(roundType: GameRoundType, sequence: RngSequence, name?: string): boolean;
  PopRngSequence(roundType: GameRoundType): RngSequence;

  /// Discard every queued RNG override (and any active override engine).
  /// No-op when nothing is queued.
  ClearRngSequences(): void;

  /// Whether a queued override is waiting for a round to start. Distinct from
  /// ShouldOverrideRng(), which is true only while an override engine is active, i.e.
  /// while a round runs on it — between rounds the queue is what says a forced outcome
  /// is pending (the QA bridge reports it as rng_queued, F-062).
  HasRngSequences(): boolean;
}

export class IRngPresetManagerEvents {}

export const IRngPresetManager = Interface<IRngPresetManager, IRngPresetManagerEvents>('IRngPresetManager');
