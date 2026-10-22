// Egt::Game::AlphaFamily::RoundInput (AlphaFamily/Math/RoundInput.h): std::variant<ReelRoundInput,
// HoldAndSpinRoundInput, WheelRoundInput>, a union of classes here (std::get_if is instanceof).

import type { HoldAndSpinRoundInput } from './HoldAndSpin/HoldAndSpinRoundInput.data';
import type { ReelRoundInput } from './Reel/ReelRoundInput.data';
import type { WheelRoundInput } from './Wheel/WheelRoundInput.data';

export type RoundInput = ReelRoundInput | HoldAndSpinRoundInput | WheelRoundInput;
