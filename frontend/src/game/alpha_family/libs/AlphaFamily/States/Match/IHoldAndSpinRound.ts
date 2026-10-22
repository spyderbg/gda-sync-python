// Egt::Game::AlphaFamily::States::IHoldAndSpinRound and its substates (AlphaFamily/States/Match/IHoldAndSpinRound.h).

import type { Reaction } from '@game/engine/Fsm/Fsm';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../../Math/Common/Common.data';
import type { HoldAndSpinRoundRules } from '../../Math/HoldAndSpin/HoldAndSpinRoundRules';
import type { IRound } from './IRound';

export interface HoldAndSpinViewOptions {
  disableInfoButton?: boolean;
  startReeling?: boolean; // start reeling instead of instant set
  setupReels?: boolean; // setup of reels view from result (default true)
  setupHoldAndSpinReels?: boolean; // HoldAndSpin phase reeling
  overrideWinBar?: number; // value for win bar
  showMainInfo?: boolean; // show HoldAndSpin info view main mode
}

export interface IHoldAndSpinRound extends IRound {
  GetTriggerRoundType(): RoundType;
  GetRoundRules(): HoldAndSpinRoundRules;

  SetupViews(options: HoldAndSpinViewOptions): void;
}

export interface IHoldAndSpinRoundIntro {
  ToRoundInput(): Reaction;
}

export interface IHoldAndSpinRoundStarting {
  ToRoundReeling(): Reaction;
}

export interface IHoldAndSpinRoundReeling {
  ToRoundPresenting(): Reaction;
}

export interface IHoldAndSpinRoundPresenting {
  ToRoundEnding(): Reaction;
}

export interface IHoldAndSpinRoundEnding {
  ToRoundOutro(): Reaction;
}

export const IHoldAndSpinRound = Interface<IHoldAndSpinRound>('IHoldAndSpinRound');
export const IHoldAndSpinRoundIntro = Interface<IHoldAndSpinRoundIntro>('IHoldAndSpinRoundIntro');
export const IHoldAndSpinRoundInput = Interface<object>('IHoldAndSpinRoundInput');
export const IHoldAndSpinRoundStarting = Interface<IHoldAndSpinRoundStarting>('IHoldAndSpinRoundStarting');
export const IHoldAndSpinRoundReeling = Interface<IHoldAndSpinRoundReeling>('IHoldAndSpinRoundReeling');
export const IHoldAndSpinRoundPresenting = Interface<IHoldAndSpinRoundPresenting>('IHoldAndSpinRoundPresenting');
export const IHoldAndSpinRoundEnding = Interface<IHoldAndSpinRoundEnding>('IHoldAndSpinRoundEnding');
export const IHoldAndSpinRoundOutro = Interface<object>('IHoldAndSpinRoundOutro');
