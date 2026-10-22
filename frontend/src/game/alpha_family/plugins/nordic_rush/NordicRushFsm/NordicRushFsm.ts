// Egt::Game::AlphaFamily::NordicRushFsm (NordicRushFsm.h/.cpp): the game's state machine, built from the states
// library: managers around Idle and Match; a match starts with the main round and plays free, coins, coins free, hold
// and spin and wheel rounds.

import { Node, type StateNode } from '@game/engine/Fsm/Fsm';
import { GameFsm } from '@game/engine/Game/Fsm/GameFsm';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { BetManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/BetManager';
import { GameManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/GameManager';
import { IdleState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Idle/Idle';
import { CoinsFreeRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRound';
import { CoinsFreeRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundEnding';
import { CoinsFreeRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundIntro';
import { CoinsFreeRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundOutro';
import { CoinsFreeRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundPresenting';
import { CoinsFreeRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundReeling';
import { CoinsFreeRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundStarting';
import { CoinsRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRound';
import { CoinsRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundEnding';
import { CoinsRoundInputState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundInput';
import { CoinsRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundIntro';
import { CoinsRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundOutro';
import { CoinsRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundPresenting';
import { CoinsRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundReeling';
import { CoinsRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundStarting';
import { CreditTaxationState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CreditTaxation/CreditTaxation';
import { FreeRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRound';
import { FreeRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundEnding';
import { FreeRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundIntro';
import { FreeRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundOutro';
import { FreeRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundPresenting';
import { FreeRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundReeling';
import { FreeRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundStarting';
import { HoldAndSpinRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRound';
import { HoldAndSpinRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundEnding';
import { HoldAndSpinRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundIntro';
import { HoldAndSpinRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundOutro';
import { HoldAndSpinRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundPresenting';
import { HoldAndSpinRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundReeling';
import { HoldAndSpinRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundStarting';
import { MainRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRound';
import { MainRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundEnding';
import { MainRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundPresenting';
import { MainRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundReeling';
import { MainRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundStarting';
import { MatchState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/Match';
import { MatchCappingAppliedState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchCappingApplied/MatchCappingApplied';
import { MatchEndOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchEndOutro/MatchEndOutro';
import { MatchEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchEnding/MatchEnding';
import { MatchStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchStarting/MatchStarting';
import { MatchTakeWinState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchTakeWin/MatchTakeWin';
import { WheelRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRound';
import { WheelRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundEnding';
import { WheelRoundInputState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundInput';
import { WheelRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundIntro';
import { WheelRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundOutro';
import { WheelRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundPresenting';
import { WheelRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundReeling';
import { WheelRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundStarting';
import { SystemManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/SystemManager';
import { ViewManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/ViewManager';

export class NordicRushFsm extends GameFsm {
  protected CreateBuilder(): StateNode {
    return Node(SystemManager, 'SystemManager', [
      Node(BetManager, 'BetManager', [
        Node(GameManager, 'GameManager', [
          Node(ViewManager, 'ViewManager', [
            Node(IdleState, 'Idle'),
            Node(MatchState, 'Match', [
              Node(MatchStartingState, 'MatchStarting'),
              Node(MainRoundState, 'MainRound', [
                Node(MainRoundStartingState, 'MainRoundStarting'),
                Node(MainRoundReelingState, 'MainRoundReeling'),
                Node(MainRoundPresentingState, 'MainRoundPresenting'),
                Node(MainRoundEndingState, 'MainRoundEnding'),
              ]),
              Node(FreeRoundState, 'FreeRound', [
                Node(FreeRoundIntroState, 'FreeRoundIntro'),
                Node(FreeRoundStartingState, 'FreeRoundStarting'),
                Node(FreeRoundReelingState, 'FreeRoundReeling'),
                Node(FreeRoundPresentingState, 'FreeRoundPresenting'),
                Node(FreeRoundEndingState, 'FreeRoundEnding'),
                Node(FreeRoundOutroState, 'FreeRoundOutro'),
              ]),
              Node(CoinsRoundState, 'CoinsRound', [
                Node(CoinsRoundIntroState, 'CoinsRoundIntro'),
                Node(CoinsRoundInputState, 'CoinsRoundInput'),
                Node(CoinsRoundStartingState, 'CoinsRoundStarting'),
                Node(CoinsRoundReelingState, 'CoinsRoundReeling'),
                Node(CoinsRoundPresentingState, 'CoinsRoundPresenting'),
                Node(CoinsRoundEndingState, 'CoinsRoundEnding'),
                Node(CoinsRoundOutroState, 'CoinsRoundOutro'),
              ]),
              Node(CoinsFreeRoundState, 'CoinsFreeRound', [
                Node(CoinsFreeRoundIntroState, 'CoinsFreeRoundIntro'),
                Node(CoinsFreeRoundStartingState, 'CoinsFreeRoundStarting'),
                Node(CoinsFreeRoundReelingState, 'CoinsFreeRoundReeling'),
                Node(CoinsFreeRoundPresentingState, 'CoinsFreeRoundPresenting'),
                Node(CoinsFreeRoundEndingState, 'CoinsFreeRoundEnding'),
                Node(CoinsFreeRoundOutroState, 'CoinsFreeRoundOutro'),
              ]),
              Node(HoldAndSpinRoundState, 'HoldAndSpinRound', [
                Node(HoldAndSpinRoundIntroState, 'HoldAndSpinRoundIntro'),
                Node(HoldAndSpinRoundStartingState, 'HoldAndSpinRoundStarting'),
                Node(HoldAndSpinRoundReelingState, 'HoldAndSpinRoundReeling'),
                Node(HoldAndSpinRoundPresentingState, 'HoldAndSpinRoundPresenting'),
                Node(HoldAndSpinRoundEndingState, 'HoldAndSpinRoundEnding'),
                Node(HoldAndSpinRoundOutroState, 'HoldAndSpinRoundOutro'),
              ]),
              Node(WheelRoundState, 'WheelRound', [
                Node(WheelRoundIntroState, 'WheelRoundIntro'),
                Node(WheelRoundInputState, 'WheelRoundInput'),
                Node(WheelRoundStartingState, 'WheelRoundStarting'),
                Node(WheelRoundReelingState, 'WheelRoundReeling'),
                Node(WheelRoundPresentingState, 'WheelRoundPresenting'),
                Node(WheelRoundEndingState, 'WheelRoundEnding'),
                Node(WheelRoundOutroState, 'WheelRoundOutro'),
              ]),
              Node(MatchTakeWinState, 'MatchTakeWin'),
              Node(MatchCappingAppliedState, 'MatchCappingApplied'),
              Node(MatchEndingState, 'MatchEnding'),
              Node(CreditTaxationState, 'CreditTaxation'),
              Node(MatchEndOutroState, 'MatchEndOutro'),
            ]),
          ]),
        ]),
      ]),
    ]);
  }
}

EgtALogCategoryClass(NordicRushFsm, 'NordicRushFsm');
