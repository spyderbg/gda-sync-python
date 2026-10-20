// Egt::Game::AlphaFamily::States::ITetraRound and its substates (AlphaFamily/States/Match/ITetraRound.h).

import { Interface } from '../../../../../engine/GameCore/RuntimeAccess';
import type { ReelRoundRules } from '../../Math/Reel/ReelRoundRules';
import type { IRound } from './IRound';

export interface TetraViewOptions {
  autoSelectInfoPage?: boolean; // automaticaly adjust the infopage based on the round type
  disableInfoButton?: boolean;
  enableButtons?: boolean; // used for input states
  enableInput?: boolean; // used for input state
  overrideWinBar?: number; // value for win bar
  startReeling?: boolean; // start reeling instead of instant set
}

export interface ITetraRound extends IRound {
  GetRoundRules(): ReelRoundRules;
  SetupViews(options: TetraViewOptions): void;
}

export const ITetraRound = Interface<ITetraRound>('ITetraRound');
export const ITetraRoundIntro = Interface<object>('ITetraRoundIntro');
export const ITetraRoundInput = Interface<object>('ITetraRoundInput');
export const ITetraRoundStarting = Interface<object>('ITetraRoundStarting');
export const ITetraRoundPresenting = Interface<object>('ITetraRoundPresenting');
export const ITetraRoundEnding = Interface<object>('ITetraRoundEnding');
export const ITetraRoundOutro = Interface<object>('ITetraRoundOutro');
