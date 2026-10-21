// Egt::Game::AlphaFamily::States::IBetManager (AlphaFamily/States/IBetManager.h, IBetManager.data.h).

import { Event } from '@game/engine/Core/Event';
import { type CurrencyType, GameCurrency } from '@game/engine/Game/Math/Common.data';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export type Bets = number[];
export type Lines = number[];

export interface IBetManager {
  SetEditMode(enabled: boolean): void;
  SetAllowedBets(bets: Bets): void;
  GetAllowedBets(): Bets;
  SetAllowedLines(lines: Lines): void;
  GetAllowedLines(): Lines;
  SetBetLimit(limit: number): void;
  GetBetLimit(): number;
  SetCurrentBet(bet: number): void;
  GetCurrentBet(): number;
  SetCurrentLines(lines: number): void;
  GetCurrentLines(): number;
  SetInitialBetFromCurrent(): void;
  GetInitialBet(): number;
  GetInitialLines(): number;
  GetMinBet(): number;
  GetMaxBet(): number;
  GetNextBet(): number;
  GetPrevBet(): number;
  SetBetCurrency(type: CurrencyType): void;
  GetBetCurrency(): CurrencyType;
  GetMinLines(): number;
  GetMaxLines(): number;
  GetNextLines(): number;
  GetPrevLines(): number;
  GetAllowedBetsIncludingSelected(): Bets;
  GetBetsWithinLimits(): Bets;
  SetInitialBetModified(modified: boolean): void;
  GetInitialBetModified(): boolean;
}

export interface IBetManagerEvents {
  readonly betChanged: Event<[number]>;
  readonly linesChanged: Event<[number]>;
  readonly startMatchRequested: Event;
  readonly currencyChanged: Event<[CurrencyType]>;
}

export class BetManagerNvrams {
  initialBet = 0;
  initialLines = 0;
  currentBet = 0;
  currentLines = 0;
  currencyBet: CurrencyType = GameCurrency.Undefined;
  initialBetModified = false; // bet modified between rounds
}

export class BetManagerStatics {
  allowedBets: Bets = [];
  allowedLines: Lines = [];
  betLimit = 0;
}

export const IBetManager = Interface<IBetManager, IBetManagerEvents>('IBetManager');
