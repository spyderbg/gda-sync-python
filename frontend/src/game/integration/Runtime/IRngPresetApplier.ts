// Egt::Integration::IRngPresetApplier (Egt/Integration/Runtime/IRngPresetApplier.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';

/// Applies named math RNG presets (loaded from DevMathRngPreset.json) by their
/// human-readable tree path, instead of by raw RNG numbers.  Implemented by the
/// AlphaFamilyMathRngPreset module, which owns the preset tree + the grid→RNG
/// conversion (RulesHelper/ResultToRng) and enqueues via IRngPreset.
export interface IRngPresetApplier {
  /// Apply the preset addressed by the given name path, e.g.
  /// {"Win", "Reel Main", "Cherry", "x5"}.  The override takes effect on the
  /// next matching round.  Returns false when the path does not resolve to an
  /// applicable leaf (reel/wheel/gamble/scenario).
  ApplyPresetByPath(path: string[]): boolean;

  /// Every applicable leaf path, each joined with '/', for discovery.
  ListPresetPaths(): string[];
}

export const IRngPresetApplier = Interface<IRngPresetApplier>('IRngPresetApplier');
