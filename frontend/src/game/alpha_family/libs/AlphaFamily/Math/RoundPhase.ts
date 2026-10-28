// Egt::Game::AlphaFamily::RoundPhase (AlphaFamily/Math/RoundPhase.h): std::variant<SpinReelsPhase, HoldAndSpinPhase,
// TetraSpinPhase, WheelRoundPhase>, a union of classes here (std::get_if is instanceof).

import type { HoldAndSpinPhase } from './HoldAndSpin/HoldAndSpinRoundPhase.data';
import type { SpinReelsPhase, TetraSpinPhase } from './Reel/ReelRoundPhase.data';
import type { WheelRoundPhase } from './Wheel/WheelRoundPhase.data';

export type RoundPhase = SpinReelsPhase | HoldAndSpinPhase | TetraSpinPhase | WheelRoundPhase;
export type RoundPhases = RoundPhase[];
