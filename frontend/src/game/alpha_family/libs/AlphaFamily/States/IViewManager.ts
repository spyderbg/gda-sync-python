// Egt::Game::AlphaFamily::States::IViewManager (AlphaFamily/States/IViewManager.h, IViewManager.data.h).

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { EStatusLine, RoundType } from '../Math/Common/Common.data';
import type { RoundResult } from '../Math/RoundResult.data';

export class ViewManagerStatics {
  betMenuVisible = false;
  betMenuMoving = false;
  languageMenuVisible = false;
  languageMenuMoving = false;
}

export interface SetupViewsOptions {
  statusLine?: EStatusLine; // status line to show
  blockGameInput?: boolean; // disable all game views
  enableButtons?: boolean; // used for input states
  startReeling?: boolean; // start reeling instead of instant set
  stopFirstReel?: boolean; // stop first reel in reeling state
  showInitialStop?: boolean; // show reels using initial stop
  showSpinReelsCombinations?: boolean; // show reel combinations when there is a win (default true)
  setupOverlay?: boolean; // skips setup of overlay views (default true)
  setupReels?: boolean; // skips setup of reels view (default true)
  overrideCredits?: number; // value for credits bar
  overrideCoinsBar?: number; // value for coins bar
  overrideWinBar?: number; // value for win bar
  overrideBetBar?: number; // value for bet bar
  overrideFakeReels?: RoundType; // value for which fake reels to use
  autoSelectInfoPage?: boolean; // automaticaly adjust the infopage based on the round type
  disableInfoButton?: boolean;
  enableFastForwardCollect?: boolean;
  pauseWinAnimations?: boolean;
  showFastLine?: boolean;
  playAnimationFromLoop?: boolean;
  changeCreditBar?: boolean; // default true
  resetLeftStatusLine?: boolean;
  showGambleCompletedStatus?: boolean;
  overrideSpecialRoundView?: RoundType; // used to override special rounds views
}

export interface IViewManager {
  SetupViews(roundResultOrType: RoundResult | RoundType, options: SetupViewsOptions): void;
  SetupViewsLastResult(options: SetupViewsOptions): void;
  SetupSpecialRoundView(roundResult: RoundResult, options: SetupViewsOptions): void;
}

export interface IViewManagerEvents {
  readonly betMenuStateChanged: Event;
  readonly languageMenuStateChanged: Event;
}

export const IViewManager = Interface<IViewManager, IViewManagerEvents>('IViewManager');
