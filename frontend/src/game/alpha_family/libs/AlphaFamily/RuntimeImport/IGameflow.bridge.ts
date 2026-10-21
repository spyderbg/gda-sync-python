// Egt::Game::AlphaFamily::IGameflow (AlphaFamily/RuntimeImport/IGameflow.bridge.h): the match and its rounds, with the
// currencies of the match's wallet. The integration implements it (integration/AlphaFamilyGameflow).

import { Event } from '@game/engine/Core/Event';
import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../Math/Common/Common.data';
import type {
  EndMatchReply, EndMatchRequest, EndRoundReply, EndRoundRequest, StartMatchReply, StartMatchRequest, StartRoundReply, StartRoundRequest,
} from './IGameflow.data';

export interface IGameflow {
  RequestStartMatch(request: StartMatchRequest): void;
  RequestStartRound(request: StartRoundRequest): void;
  RequestEndRound(request: EndRoundRequest): void;
  RequestEndMatch(request: EndMatchRequest): void;

  IsIdle(): boolean;
  IsMatchStarting(): boolean;
  IsMatchStarted(): boolean;
  IsRoundStarted(): boolean;
  IsRoundStarting(): boolean;

  GetMatchCurrencyRewarded(type: CurrencyType): number;
  GetMatchCurrencyConsumed(type: CurrencyType): number;
  GetMatchCurrencyAvailable(type: CurrencyType): number;
  GetMatchCurrenciesRewarded(): Currencies;
  GetMatchCurrenciesConsumed(): Currencies;
  GetMatchCurrenciesAvailable(): Currencies;
  GetMatchCurrenciesAvailableTotal(): Currencies;
  HasMatchCurrenciesAvailable(required: Currencies): boolean;

  GetConsecutiveRoundAvailable(type: CurrencyType): number;
  GetConsecutiveRoundConsumed(type: CurrencyType): number;
  GetConsecutiveTriggerRoundType(): RoundType;

  IsForcedWheel(): boolean;
  IsCappingHit(): boolean;
  HasRemainingFeaturesOnCap(): boolean;

  GetNextRoundType(): RoundType;
  GetInitialCreditsBet(): number;
  GetLastConsecutiveRoundCount(roundType?: RoundType): number;
}

export class IGameflowEvents {
  readonly startMatchReply = new Event<[StartMatchReply]>();
  readonly startRoundReply = new Event<[StartRoundReply]>();
  readonly endRoundReply = new Event<[EndRoundReply]>();
  readonly endMatchReply = new Event<[EndMatchReply]>();
}

export const IGameflow = Interface<IGameflow, IGameflowEvents>('IGameflow');
