// Egt::Game::AlphaFamily::JokerReelsCoins10Fsm (JokerReelsCoins10Fsm.h/.cpp): the game's state machine, built from the
// states library: managers around Idle and Match; a match starts with the main round and plays coins, wheel and gamble
// rounds.

import { Node, type StateNode } from '@game/engine/Fsm/Fsm';
import { GameFsm } from '@game/engine/Game/Fsm/GameFsm';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { BetManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/BetManager';
import { GameManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/GameManager';
import { IdleState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Idle/Idle';
import { CoinsRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRound';
import { CoinsRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundEnding';
import { CoinsRoundInputState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundInput';
import { CoinsRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundIntro';
import { CoinsRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundOutro';
import { CoinsRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundPresenting';
import { CoinsRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundReeling';
import { CoinsRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundStarting';
import { CreditTaxationState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CreditTaxation/CreditTaxation';
import { GambleRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRound';
import { GambleRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundEnding';
import { GambleRoundInputState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundInput';
import { GambleRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundIntro';
import { GambleRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundOutro';
import { GambleRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundPresenting';
import { GambleRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundReeling';
import { GambleRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundStarting';
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

export class JokerReelsCoins10Fsm extends GameFsm {
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
              Node(CoinsRoundState, 'CoinsRound', [
                Node(CoinsRoundIntroState, 'CoinsRoundIntro'),
                Node(CoinsRoundInputState, 'CoinsRoundInput'),
                Node(CoinsRoundStartingState, 'CoinsRoundStarting'),
                Node(CoinsRoundReelingState, 'CoinsRoundReeling'),
                Node(CoinsRoundPresentingState, 'CoinsRoundPresenting'),
                Node(CoinsRoundEndingState, 'CoinsRoundEnding'),
                Node(CoinsRoundOutroState, 'CoinsRoundOutro'),
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
              Node(GambleRoundState, 'GambleRound', [
                Node(GambleRoundIntroState, 'GambleRoundIntro'),
                Node(GambleRoundInputState, 'GambleRoundInput'),
                Node(GambleRoundStartingState, 'GambleRoundStarting'),
                Node(GambleRoundReelingState, 'GambleRoundReeling'),
                Node(GambleRoundPresentingState, 'GambleRoundPresenting'),
                Node(GambleRoundEndingState, 'GambleRoundEnding'),
                Node(GambleRoundOutroState, 'GambleRoundOutro'),
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

EgtALogCategoryClass(JokerReelsCoins10Fsm, 'JokerReelsCoins10Fsm');
