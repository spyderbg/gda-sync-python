// Egt::Game::AlphaFamily::States::IWheelRound and its substates (AlphaFamily/States/Match/IWheelRound.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { WheelRoundRules } from '../../Math/Wheel/WheelRoundRules';
import type { IRound } from './IRound';

export interface WheelViewOptions {
  enableButtons?: boolean; // used for input state
  enableCancelButton?: boolean; // used for forced wheel, 0.9 * coins + win >= cap, disable back button
  autoSelectInfoPage?: boolean; // used for forced wheel, 0.9 * coins + win >= cap, disable back button
  overrideStartSector?: number | null; // value index for wheel start sector
  overrideCoinsBar?: number; // value for coins bar
  overrideWinBar?: number; // value for win bar
}

export interface IWheelRound extends IRound {
  GetRoundRules(): WheelRoundRules;
  SetupViews(options: WheelViewOptions): void;
}

export const IWheelRound = Interface<IWheelRound>('IWheelRound');
export const IWheelRoundIntro = Interface<object>('IWheelRoundIntro');
export const IWheelRoundInput = Interface<object>('IWheelRoundInput');
export const IWheelRoundStarting = Interface<object>('IWheelRoundStarting');
export const IWheelRoundReeling = Interface<object>('IWheelRoundReeling');
export const IWheelRoundPresenting = Interface<object>('IWheelRoundPresenting');
export const IWheelRoundEnding = Interface<object>('IWheelRoundEnding');
export const IWheelRoundOutro = Interface<object>('IWheelRoundOutro');
