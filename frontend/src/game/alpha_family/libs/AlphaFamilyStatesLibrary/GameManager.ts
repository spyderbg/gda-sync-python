// Egt::Game::AlphaFamily::GameManager (AlphaFamilyStatesLibrary/GameManager.h/.cpp): autoplay, the last match win and
// the last round results, which the reels show between matches.

import { State } from '@game/engine/Fsm/Fsm';
import { IsValidIndex, RandomDevice } from '@game/engine/GameCore/Common/ContainerHelpers';
import { IAutoPlayHwButton, IInfoHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { IWallet, type TransactionInfo, TransactionType } from '@game/engine/Game/RuntimeImport/IWallet';
import { assert, Unless } from '@game/engine/GameCore/Common/Defensive';
import type { size_t, uint32_t } from '@game/engine/GameCore/Common/Types';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IMessageBoard } from '@game/engine/Game/RuntimeImport/IMessageBoard';
import { IRecovery } from '@game/engine/Game/RuntimeImport/IRecovery';
import { EgtAError, EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { GenerateRandomZeroRewardRound } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Helpers/ReelRoundGenerators';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { HoldAndSpinRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data';
import { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { GameManagerNvrams, GameManagerStatics, IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ICreditBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { IAutoPlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IInfoSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class GameManager extends State implements IGameManager {
  static Interfaces = [IGameManager];
  static Nvrams = [GameManagerNvrams];
  static Statics = [GameManagerStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    const nvram = this.ConstNvram(GameManagerNvrams);

    if (nvram.lastRoundResults.length === 0) {
      // No lastRoundResult => show random non-winning Main round reel stop
      let zeroRewardRound = this.FindRandomZeroRewardRound(RoundType.Main);

      if (zeroRewardRound !== null) {
        this.SetLastRoundResult(zeroRewardRound);
      } else {
        EgtAError('Failed to FindRandomZeroRewardRound().');
      }
    }

    this.AtachCallbacks();
  }

  SetAutoPlay(autoPlayOn: boolean) {
    this.Static(GameManagerStatics).isAutoplay = autoPlayOn;
    const autoplayView = this.RuntimeTryGet(IAutoPlayView);
    if (autoplayView) {
      autoplayView.SetAutoPlay(autoPlayOn);
    }
  }

  IsAutoPlayOn() {
    return this.ConstStatic(GameManagerStatics).isAutoplay;
  }

  GetLastMatchWin() {
    return this.ConstStatic(GameManagerStatics).lastMatchWin;
  }

  GetHasEnteredRound(roundType: RoundType) {
    const hasEnteredRound = this.ConstNvram(GameManagerNvrams).hasEnteredRound;
    return hasEnteredRound.has(roundType);
  }

  SetHasEnteredRound(roundType: RoundType, hasEntered: boolean) {
    const hasEnteredRound = this.Nvram(GameManagerNvrams).hasEnteredRound;
    if (hasEntered) {
      hasEnteredRound.add(roundType);
    } else {
      hasEnteredRound.delete(roundType);
    }
  }

  FindRandomZeroRewardRound(roundType: RoundType): RoundResult | null {
    const mathRules = this.RuntimeGetConst(IMathRules);
    const rules = mathRules.GetReelRoundRules(roundType);

    const input = new ReelRoundInput();
    input.roundType = roundType;
    input.bet = rules.GetMinBet();
    input.lines = rules.GetMinLines();
    input.betPerLine = input.bet / input.lines;
    if (roundType === RoundType.Tetra) {
      const subScreenCount = rules.GetTetraSpinRules().GetSubScreenCount();
      input.betPerLine /= subScreenCount;
    }

    let seed = this.GetLastRoundResultVisualSeed();

    return GenerateRandomZeroRewardRound(rules, input, [seed]);
  }

  SetLastRoundResult(result: RoundResult) {
    // C++ visits the round input's variant (std::visit with an Overload of each alternative)
    const input = result.GetInput();
    let slot = 0;
    if (input instanceof ReelRoundInput) {
      const mathRules = this.RuntimeGetConst(IMathRules);
      const rules = mathRules.GetReelRoundRules(input.roundType);
      slot = rules.GetLastResultSlot();
    } else if (input instanceof HoldAndSpinRoundInput) {
      const mathRules = this.RuntimeGetConst(IMathRules);
      const rules = mathRules.GetReelRoundRules(input.triggerRoundType);
      slot = rules.GetLastResultSlot();
    } else {
      assert(false);
      slot = 0;
    }

    const nvrams = this.Nvram(GameManagerNvrams);
    const lastRoundResults = nvrams.lastRoundResults;

    if (slot >= lastRoundResults.length) {
      lastRoundResults.length = slot + 1;
    }

    lastRoundResults[slot] = result;
    nvrams.lastRoundSlot = slot;
  }

  GetLastRoundResult() {
    const nvrams = this.ConstNvram(GameManagerNvrams);
    assert(IsValidIndex(nvrams.lastRoundResults, nvrams.lastRoundSlot));

    return nvrams.lastRoundResults[nvrams.lastRoundSlot];
  }

  GetLastNHistoryResultsBy(_roundType: RoundType, n: size_t) {
    // NOTE: it is made to work ONLY with Gamble rounds, for now
    assert(_roundType === RoundType.Gamble);
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const gambleRoundResults: RoundResult[] = [];
    let historySize: size_t = Math.min(nvrams.gambleHistoryResults.length, n);

    for (let i: size_t = 0; i < historySize; ++i) {
      gambleRoundResults.push(nvrams.gambleHistoryResults[i]);
    }

    return gambleRoundResults;
  }

  AddHistoryResult(result: RoundResult) {
    // NOTE: it is made to work ONLY with Gamble rounds, for now
    assert(result.GetRoundType() === RoundType.Gamble);

    const MAX_HISTORY_SIZE: size_t = 6;

    const nvrams = this.Nvram(GameManagerNvrams);
    const history = nvrams.gambleHistoryResults;
    history.unshift(result);

    // Trim from the back if exceeding maximum size
    if (history.length > MAX_HISTORY_SIZE) {
      history.pop(); // remove the last (oldest) element
    }
  }

  private AtachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);

    this.ReactOn(this.RuntimeGetConst(IInfoHwButton.Events).buttonPressedEvent, this.OnInfoHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);

    this.ReactOn(this.RuntimeGetConst(IInfoSwButtonView.Events).buttonPressedEvent, this.OnInfoSwButtonPressed);

    const messageBoardEvents = this.RuntimeTryGet(IMessageBoard.Events);
    if (messageBoardEvents) {
      this.ReactOn(messageBoardEvents.onWaitingInput, this.OnWaitingInputMessage);
    }
  }

  private GetLastRoundResultVisualSeed() {
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const results = nvrams.lastRoundResults;
    const slot = nvrams.lastRoundSlot;
    let seed: uint32_t = 0;

    if (IsValidIndex(results, slot)) {
      seed = results[slot].m_replay.input.visualSeed;
    } else {
      seed = RandomDevice();
    }

    return seed;
  }

  private OnCreditChanged(transaction: TransactionInfo) {
    const creditBar = this.RuntimeGet(ICreditBarView);
    switch (transaction.transactionType) {
      case TransactionType.CashIn:
        creditBar.SetValueNow(transaction.newCreditTotal);
        this.RuntimeGet(IAudioApi).Play('add_to_credit');
        break;
      case TransactionType.Cashout:
        creditBar.SetValueNow(transaction.newCreditTotal);
        this.RuntimeGet(IAudioApi).Play('SOUND_TAKE_WIN');
        break;
      case TransactionType.Bet:
      case TransactionType.BetCanceled: creditBar.SetValueNow(transaction.newCreditTotal); break;
      default: break;
    }

    return this.Forward();
  }

  private OnInfoSwButtonPressed() {
    this.RuntimeGet(IInfoView).ShowNextPage();
    return this.Consume();
  }

  private OnInfoHwButtonPressed() {
    this.RuntimeGet(IInfoView).ShowNextPage();
    return this.Consume();
  }

  private OnAutoPlayHwButtonPressed() {
    if (!this.IsAutoPlayOn()) {
      /// Since auto play is not being persisted after recovery, we need to consume redundant auto-play button events during replay.
      if (this.RuntimeGetConst(IRecovery).IsReplayStateChangeAction()) {
        return this.Consume();
      }
      return this.Skip();
    }

    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
    this.SetAutoPlay(false);

    return this.Consume();
  }

  private OnWaitingInputMessage() {
    if (Unless(this.IsAutoPlayOn())) return this.Skip();

    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
    this.SetAutoPlay(false);

    return this.Consume();
  }
}

EgtALogCategoryClass(GameManager, 'GameManager');
