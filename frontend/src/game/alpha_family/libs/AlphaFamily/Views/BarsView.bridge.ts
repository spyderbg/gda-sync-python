// Egt::Game::AlphaFamily numeric bars (AlphaFamily/Views/BarsView.bridge.h): ICreditBarView, ICreditsWinBarView,
// IBetBarView, ITetraSpinBarView; and the other games' bars the states library uses (ICoinsWinBarView,
// IExtraSpinBarView, IHoldAndSpinBarView), which BurningCrownTetraSpins10 has not.

import { Event } from '@game/engine/Core/Event';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { PayoutSummary } from '../Math/Common/Common.data';
import { type IControlView, IControlViewEvents, type INumericBarView, INumericBarViewEvents } from './BaseInterfaces/IControlView';

export interface ICreditBarView extends IControlView, INumericBarView {
  Minimize(instant: boolean): void;
  Maximize(instant: boolean): void;
}

export class ICreditBarViewEvents extends INumericBarViewEvents {
  readonly minimized = new Event();
  readonly maximized = new Event();
}

export const ICreditBarView = Interface<ICreditBarView, ICreditBarViewEvents>('ICreditBarView');

export enum EWinBarState {
  Win = 0,
  WinnerPaid,
}

export interface ICreditsWinBarView extends IControlView, INumericBarView {
  AddWinResult(summary: PayoutSummary): void;
  AddWinResultFast(summary: PayoutSummary): void;
  SetLabelState(state: EWinBarState): void;
}

export const ICreditsWinBarView = Interface<ICreditsWinBarView, INumericBarViewEvents>('ICreditsWinBarView');

export interface IBetBarView extends IControlView, INumericBarView {
  SetCurrency(type: CurrencyType): void;
}

export const IBetBarView = Interface<IBetBarView, INumericBarViewEvents>('IBetBarView');

export interface IWinBarViewWithShow {
  ShowRemainder(visible: boolean): void;
  AddWinResult(summary: PayoutSummary): void;
}

export interface IExtraSpinBarView extends IWinBarViewWithShow {}

export const IExtraSpinBarView = Interface<IExtraSpinBarView>('IExtraSpinBarView');

export interface IHoldAndSpinBarView extends IWinBarViewWithShow {
  SetBet(bet: number): void;
}

export const IHoldAndSpinBarView = Interface<IHoldAndSpinBarView>('IHoldAndSpinBarView');

export interface ICoinsWinBarView extends IControlView, INumericBarView {
  AddWinResult(summary: PayoutSummary): void;
}

export const ICoinsWinBarView = Interface<ICoinsWinBarView, INumericBarViewEvents>('ICoinsWinBarView');

export interface IBaseCounterBarView extends IControlView {
  SetCurrentCounter(current: number): void;
  SetTotalCounterTarget(target: number): void;
}

export interface ITetraSpinBarView extends IBaseCounterBarView {
  ClearCounter(): void;
}

export const ITetraSpinBarView = Interface<ITetraSpinBarView, IControlViewEvents>('ITetraSpinBarView');
