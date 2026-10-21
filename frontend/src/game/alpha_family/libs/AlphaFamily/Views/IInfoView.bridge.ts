// Egt::Game::AlphaFamily::IInfoView (AlphaFamily/Views/IInfoView.bridge.h): the help pages and their paytables.

import { Event } from '@game/engine/Core/Event';
import type { int, int64_t, uint32_t } from '@game/engine/GameCore/Common/Types';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import type { EInfoViewPageType } from './IInfoView.data';

export enum ECurrencyPrize {
  Undefined,
  Credits,
  ExtraSpinsEnergy,
  FreeSpinsEnergy,
  CoinsSpinEnergy,
  CoinsFreeSpinEnergy,
}

export type FigureId = int;
/** Paytable coefficients by figure: [count] -> times the bet per line. */
export type PaytableCoefficients = Map<FigureId, int64_t[]>;

export interface IInfoView {
  ShowRoundInfo(roundType: RoundType, idleChange: boolean): void;
  ShowPage(page: EInfoViewPageType): void;
  ShowNextPage(): void;
  SetStakes(totalBet: number, lines: number): void;
  SetPaytables(paytables: Map<ECurrencyPrize, PaytableCoefficients>, scatterFigures: Set<FigureId>, figureNames: Map<FigureId, string>, multipliers: uint32_t[]): void;
  SetGambleLimits(gambleLimit: number, maxGambleAttempts: number): void;
  SetCertificationCode(certificationCode: string): void;
  SetLanguage(language: string): void;
  SetSerialNumber(serialNumber: string): void;
  SetWinCappingLimit(winCappingLimit: number): void;
  SetJackpotMultiplier(jackpotMultiplier: number): void;
  SetGambleCapLimit(gambleCapLimit: number): void;
  ShowCombinations(combinations: ReelCombinations): void;
  HideWins(): void;
  StartAnimation(animId: string): void;
  StopAnimation(animId: string): void;
}

export class IInfoViewEvents {
  readonly pageChanged = new Event();
  readonly pageShown = new Event();
  readonly animationStarted = new Event<[string]>();
  readonly animationFinished = new Event<[string]>();
  readonly animationStopped = new Event<[string]>();
}

export const IInfoView = Interface<IInfoView, IInfoViewEvents>('IInfoView');
