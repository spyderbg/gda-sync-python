// Egt::Game::AlphaFamily::IBetMenuView (AlphaFamily/Views/IBetMenuView.bridge.h).

import { Event } from '../../../../engine/Core/Event';
import type { CurrencyType } from '../../../../engine/Game/Math/Common.data';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import { type IControlView, type IMenuView, IMenuViewEvents } from './BaseInterfaces/IControlView';

export interface IBetMenuView extends IControlView, IMenuView {
  SetPossibleTotalBets(bets: number[]): void;
  SetSelectedTotalBet(bet: number): void;
  SetBetLimit(limit: number): void;
  SetCurrency(type: CurrencyType): void;
  SetPossibleLines(lines: number[]): void;
  SetSelectedLines(lines: number): void;
  SetButtonUpEnabled(enabled: boolean): void;
  SetButtonDownEnabled(enabled: boolean): void;
}

export class IBetMenuViewEvents extends IMenuViewEvents {
  readonly requestBetChanged = new Event<[number]>();
  readonly requestLinesChanged = new Event<[number]>();
  readonly requestIncreaseBetEvent = new Event();
  readonly requestDecreaseBetEvent = new Event();
  readonly requestIncreaseLinesEvent = new Event();
  readonly requestDecreaseLinesEvent = new Event();
}

export const IBetMenuView = Interface<IBetMenuView, IBetMenuViewEvents>('IBetMenuView');
