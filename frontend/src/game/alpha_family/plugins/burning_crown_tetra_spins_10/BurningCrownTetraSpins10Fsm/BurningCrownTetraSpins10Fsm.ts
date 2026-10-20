// Egt::Game::AlphaFamily::BurningCrownTetraSpins10Fsm (BurningCrownTetraSpins10Fsm.h/.cpp): the game's state machine,
// built from the states library: managers around Idle and Match; a match starts with the main round and plays tetra
// rounds while its credits allow.

import { Node, type StateNode } from '../../../../engine/Fsm/Fsm';
import { GameFsm } from '../../../../engine/Game/Fsm/GameFsm';
import { BetManager } from '../../../libs/AlphaFamilyStatesLibrary/BetManager';
import { GameManager } from '../../../libs/AlphaFamilyStatesLibrary/GameManager';
import { IdleState } from '../../../libs/AlphaFamilyStatesLibrary/Idle/Idle';
import { CreditTaxationState } from '../../../libs/AlphaFamilyStatesLibrary/Match/CreditTaxation/CreditTaxation';
import { MainRoundState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRound';
import { MainRoundEndingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundEnding';
import { MainRoundPresentingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundPresenting';
import { MainRoundReelingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundReeling';
import { MainRoundStartingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundStarting';
import { MatchState } from '../../../libs/AlphaFamilyStatesLibrary/Match/Match';
import { MatchCappingAppliedState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MatchCappingApplied/MatchCappingApplied';
import { MatchEndOutroState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MatchEndOutro/MatchEndOutro';
import { MatchEndingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MatchEnding/MatchEnding';
import { MatchStartingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MatchStarting/MatchStarting';
import { MatchTakeWinState } from '../../../libs/AlphaFamilyStatesLibrary/Match/MatchTakeWin/MatchTakeWin';
import { TetraRoundState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound';
import { TetraRoundEndingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundEnding';
import { TetraRoundInputState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundInput';
import { TetraRoundIntroState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundIntro';
import { TetraRoundOutroState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundOutro';
import { TetraRoundPresentingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundPresenting';
import { TetraRoundStartingState } from '../../../libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundStarting';
import { SystemManager } from '../../../libs/AlphaFamilyStatesLibrary/SystemManager';
import { ViewManager } from '../../../libs/AlphaFamilyStatesLibrary/ViewManager';

export class BurningCrownTetraSpins10Fsm extends GameFsm {
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
              Node(TetraRoundState, 'TetraRound', [
                Node(TetraRoundIntroState, 'TetraRoundIntro'),
                Node(TetraRoundInputState, 'TetraRoundInput'),
                Node(TetraRoundStartingState, 'TetraRoundStarting'),
                Node(TetraRoundPresentingState, 'TetraRoundPresenting'),
                Node(TetraRoundEndingState, 'TetraRoundEnding'),
                Node(TetraRoundOutroState, 'TetraRoundOutro'),
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
