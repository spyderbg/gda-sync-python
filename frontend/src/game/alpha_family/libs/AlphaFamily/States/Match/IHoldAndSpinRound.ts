// Egt::Game::AlphaFamily::States::IHoldAndSpinRound and its substates (AlphaFamily/States/Match/IHoldAndSpinRound.h).

import type { Reaction } from '@game/engine/Fsm/Fsm';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../../Math/Common/Common.data';
import type { HoldAndSpinRoundRules } from '../../Math/HoldAndSpin/HoldAndSpinRoundRules';
import type { IRound } from './IRound';

export enum HoldAndSpinReelSetup {
  None,
  Trigger, // trigger shields only (no reel spin)
  Spinning, // HoldAndSpin phase reeling
  Presenting, // HS grid after a phase (no spin)
  Outro, // final HS grid during outro (from last round result)
}

export interface HoldAndSpinViewOptions {
  disableInfoButton?: boolean;
  startReeling?: boolean; // start reeling instead of instant set
  setupReels?: boolean; // setup of reels view from result (default true)
  reelSetup?: HoldAndSpinReelSetup; // default None
  overrideWinBar?: number; // value for credits win bar
  overrideCoinsBar?: number; // value for coins win bar
  showMainInfo?: boolean; // show HoldAndSpin info view main mode
  featureStarted?: boolean; // reels fire, banner and spins bar are shown
  showSpinsCompleted?: boolean; // spins bar shows "Spins Completed" without animation
  showSpinsCompletedWhenExhausted?: boolean; // like showSpinsCompleted, gated on round energy override
  showLastPhaseSpinsCompletedAnimated?: boolean; // on last phase when exhausted, ShowCompleted(animated)
}

export interface IHoldAndSpinRound extends IRound {
  GetTriggerRoundType(): RoundType;
  GetRoundRules(): HoldAndSpinRoundRules;

  SetupViews(options: HoldAndSpinViewOptions): void;
  SetFeatureStartedViews(featureStarted: boolean): void;
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
