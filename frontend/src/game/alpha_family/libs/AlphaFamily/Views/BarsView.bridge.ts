// Egt::Game::AlphaFamily numeric bars (AlphaFamily/Views/BarsView.bridge.h): ICreditBarView, ICreditsWinBarView,
// IBetBarView, the round counters (ITetraSpinBarView, IFreeSpinBarView...), and the coins games' bars (ICoinsBarView,
// ICoinsWinBarView, IExtraSpinBarView, IHoldAndSpinBarView).

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

export interface IWinBarViewWithShow extends IControlView, INumericBarView {
  ShowRemainder(visible: boolean): void;
  AddWinResult(summary: PayoutSummary): void;
}

export interface IExtraSpinBarView extends IWinBarViewWithShow {}

export const IExtraSpinBarView = Interface<IExtraSpinBarView, INumericBarViewEvents>('IExtraSpinBarView');

export interface IHoldAndSpinBarView extends IWinBarViewWithShow {
  SetBet(bet: number): void;
}

export const IHoldAndSpinBarView = Interface<IHoldAndSpinBarView, INumericBarViewEvents>('IHoldAndSpinBarView');

export interface ICoinsBarView {
  Minimize(instant: boolean): void;
  Maximize(instant: boolean): void;
  SetValueNow(value: number): void;
  SetValue(value: number): void;
}

export class ICoinsBarViewEvents {
  readonly minimized = new Event();
  readonly maximized = new Event();
}

export const ICoinsBarView = Interface<ICoinsBarView, ICoinsBarViewEvents>('ICoinsBarView');

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

export interface IFreeSpinBarView extends IBaseCounterBarView {}

export const IFreeSpinBarView = Interface<IFreeSpinBarView, IControlViewEvents>('IFreeSpinBarView');

export interface IExtraFreeSpinBarView extends IBaseCounterBarView {}

export const IExtraFreeSpinBarView = Interface<IExtraFreeSpinBarView, IControlViewEvents>('IExtraFreeSpinBarView');

export interface ICoinsFreeSpinBarView extends IBaseCounterBarView {}

export const ICoinsFreeSpinBarView = Interface<ICoinsFreeSpinBarView, IControlViewEvents>('ICoinsFreeSpinBarView');
