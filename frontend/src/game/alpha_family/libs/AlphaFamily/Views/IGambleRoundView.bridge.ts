// Egt::Game::AlphaFamily::IGambleRoundView (AlphaFamily/Views/IGambleRoundView.bridge.h): the gamble's cards, its
// history and attempts.

import { Event } from '@game/engine/Core/Event';
import type { int, int64_t, int8_t } from '@game/engine/GameCore/Common/Types';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IGambleRoundView extends IControlView {
  SetHistory(history: int8_t[]): void;
  SetAttemptsLeft(attemptsLeft: int): void;
  SetBet(bet: int64_t): void;

  ShowIntro(force?: boolean): void; // TODO: do we need it??
  ShowSlideCards(): void;
  ShowIdle(): void;
  ShowResult(win: boolean, houseCard: int): void;
  ShowOutro(win: boolean, houseCard: int, force?: boolean): void; // TODO: do we need it??

  Clear(): void;
}

export class IGambleRoundViewEvents extends IControlViewEvents {
  readonly introFinished = new Event(); // TODO: do we need it??
  readonly outroFinished = new Event(); // TODO: do we need it??
  readonly slideCardsFinished = new Event();
  readonly idleFinished = new Event();
  readonly showResultFinished = new Event();

  readonly redCardSelected = new Event();
  readonly blackCardSelected = new Event();
}

export const IGambleRoundView = Interface<IGambleRoundView, IGambleRoundViewEvents>('IGambleRoundView');
