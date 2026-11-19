// Egt::Game::AlphaFamily's replay numbers (AlphaFamily/Math/Common/ReplayRngConvert.h/.cpp): a round's replay saves the
// values of the numbers it drew, without their operations and ranges, and a recovery plays them back unchecked
// (ReplayNoCheck), so that a round recovered with changed math is calculated again from the same numbers.

import type { uint32_t } from '@game/engine/GameCore/Common/Types';
import { RngOp, type RngSequence } from '@game/engine/GameCore/Random/IRng';

export function RngSequenceToReplaySave(sequence: RngSequence): uint32_t[] {
  return sequence.data.map(t => t.value);
}

export function ReplaySaveToRngSequence(replay: readonly uint32_t[]): RngSequence {
  return { data: replay.map(value => ({ op: RngOp.ReplayNoCheck, range: 0, value })) };
}
