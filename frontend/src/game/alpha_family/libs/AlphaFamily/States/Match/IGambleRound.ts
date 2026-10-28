// Egt::Game::AlphaFamily::States::IGambleRound and its substates (AlphaFamily/States/Match/IGambleRound.h): the red or
// black gamble of the match's win, whose rules are a wheel's (WheelRoundRules, the GambleRoundRules).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { WheelRoundRules } from '../../Math/Wheel/WheelRoundRules';
import type { IRound } from './IRound';

export interface IGambleRound extends IRound {
  GetRoundRules(): WheelRoundRules;
  SetupViews(options: GambleViewOptions): void;
}

export interface GambleViewOptions {
  // TODO: add history ?
  // TODO: check do we need them
  enableInput?: boolean; // used for input state
  overrideWinBar?: number; // value for win bar
  autoSelectInfoPage?: boolean;
}

export const IGambleRound = Interface<IGambleRound>('IGambleRound');
export const IGambleRoundIntro = Interface<object>('IGambleRoundIntro');
export const IGambleRoundInput = Interface<object>('IGambleRoundInput');
export const IGambleRoundStarting = Interface<object>('IGambleRoundStarting');
export const IGambleRoundReeling = Interface<object>('IGambleRoundReeling');
export const IGambleRoundPresenting = Interface<object>('IGambleRoundPresenting');
export const IGambleRoundEnding = Interface<object>('IGambleRoundEnding');
export const IGambleRoundOutro = Interface<object>('IGambleRoundOutro');
