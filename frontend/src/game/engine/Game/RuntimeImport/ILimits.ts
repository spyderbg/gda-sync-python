// Egt::Game::ILimits: the bet limits, the win capping and the tax threshold of the jurisdiction.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum ECapTiming {
  BeforeRoundOutcome,
  AfterRoundOutcome,
}

export interface BetLimits {
  minBet: number;
  maxBet: number;
  defaultBet: number;
}

export interface WinCapping {
  capping: number;
  capTiming: ECapTiming;
  capValueWinBar: boolean;
}

export interface ILimits {
  GetBetLimits(): BetLimits;
  GetWinCapping(): WinCapping;
  IsMaxBetStartingGame(): boolean;
  IsTaxThresholdBreached(credits: number): boolean;
  ShowTaxMessage(credits: number): void;
  CloseTaxMessage(): void;
}

export class ILimitsEvents {
  readonly taxMessageClosed = new Event();
}

export const ILimits = Interface<ILimits, ILimitsEvents>('ILimits');
