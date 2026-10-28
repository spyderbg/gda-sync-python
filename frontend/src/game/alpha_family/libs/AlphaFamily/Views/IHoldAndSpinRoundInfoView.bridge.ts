// Egt::Game::AlphaFamily::IHoldAndSpinRoundInfoView (AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge.h): the hold and
// spin round's screen on the info (top) display.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { SymbolViewInfos } from '../Math/Common/Common.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export enum ECurrencyPrize {
  Undefined = 0,
  Credits,
  ExtraSpinsEnergy,
  FreeSpinsEnergy,
  CoinsSpinEnergy,
  CoinsFreeSpinEnergy,
}

export type FigureId = number;
export type PaytableCoefficients = Map<FigureId, number[]>;

export interface IHoldAndSpinRoundInfoView extends IControlView {
  ShowIntro(): void;
  ShowMain(): void;
  ShowOutro(): void;
  ShowComets(infos: SymbolViewInfos): void;
  RequestFastForwardComets(): void;
  Clear(): void;

  SetCollectedShields(count: number): void;
  SetStakes(totalBet: number, lines: number): void;
  SetPaytables(
    paytables: Map<ECurrencyPrize, PaytableCoefficients>,
    scatterFigures: Set<FigureId>,
    figureNames: Map<FigureId, string>,
    gameMultipliers: number[],
  ): void;
}

export class IHoldAndSpinRoundInfoViewEvents extends IControlViewEvents {
  readonly introFinished = new Event();
  readonly mainFinished = new Event();
  readonly outroFinished = new Event();

  readonly cometsAnimDone = new Event();
}

export const IHoldAndSpinRoundInfoView = Interface<IHoldAndSpinRoundInfoView, IHoldAndSpinRoundInfoViewEvents>('IHoldAndSpinRoundInfoView');
