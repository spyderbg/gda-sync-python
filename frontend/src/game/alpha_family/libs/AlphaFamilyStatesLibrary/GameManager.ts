// Egt::Game::AlphaFamily::GameManager (AlphaFamilyStatesLibrary/GameManager.h/.cpp): autoplay, the last match win and
// the last round results, which the reels show between matches.

import { State } from '../../../engine/Fsm/Fsm';
import { IsValidIndex, RandomDevice } from '../../../engine/GameCore/Common/ContainerHelpers';
import { IAutoPlayHwButton, IInfoHwButton } from '../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { IWallet, type TransactionInfo, TransactionType } from '../../../engine/Game/RuntimeImport/IWallet';
import { RoundType } from '../AlphaFamily/Math/Common/Common.data';
import { GenerateRandomZeroRewardRound } from '../AlphaFamily/Math/Reel/Helpers/ReelRoundGenerators';
import { ReelRoundInput } from '../AlphaFamily/Math/Reel/ReelRoundInput.data';
import { RoundResult } from '../AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '../AlphaFamily/RuntimeExport/IMathRules';
import { GameManagerNvrams, GameManagerStatics, IGameManager } from '../AlphaFamily/States/IGameManager';
import { ICreditBarView } from '../AlphaFamily/Views/BarsView.bridge';
import { IInfoView } from '../AlphaFamily/Views/IInfoView.bridge';
import { IAutoPlayView } from '../AlphaFamily/Views/IOverlayViews.bridge';
import { IInfoSwButtonView } from '../AlphaFamily/Views/SwButtonViews.bridge';

export class GameManager extends State implements IGameManager {
  static Interfaces = [IGameManager];
  static Nvrams = [GameManagerNvrams];
  static Statics = [GameManagerStatics];

  OnTransit() {
    const nvram = this.ConstNvram(GameManagerNvrams);
    if (!nvram.lastRoundResults.length) {
      // No lastRoundResult => show random non-winning Main round reel stop
      const zeroRewardRound = this.FindRandomZeroRewardRound(RoundType.Main);
      if (zeroRewardRound) this.SetLastRoundResult(zeroRewardRound);
      else console.error('GameManager: Failed to FindRandomZeroRewardRound().');
    }
    this.AtachCallbacks();
  }

  SetAutoPlay(autoPlayOn: boolean) {
    this.Static(GameManagerStatics).isAutoplay = autoPlayOn;
    this.RuntimeTryGet(IAutoPlayView)?.SetAutoPlay(autoPlayOn);
  }

  IsAutoPlayOn() {
    return this.ConstStatic(GameManagerStatics).isAutoplay;
  }

  GetLastMatchWin() {
    return this.ConstStatic(GameManagerStatics).lastMatchWin;
  }

  GetHasEnteredRound(roundType: RoundType) {
    return this.ConstNvram(GameManagerNvrams).hasEnteredRound.has(roundType);
  }

  SetHasEnteredRound(roundType: RoundType, hasEntered: boolean) {
    const hasEnteredRound = this.Nvram(GameManagerNvrams).hasEnteredRound;
    if (hasEntered) hasEnteredRound.add(roundType);
    else hasEnteredRound.delete(roundType);
  }

  FindRandomZeroRewardRound(roundType: RoundType) {
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    const input = new ReelRoundInput();
    input.roundType = roundType;
    input.bet = rules.GetMinBet();
    input.lines = rules.GetMinLines();
    input.betPerLine = input.bet / input.lines;
    if (roundType === RoundType.Tetra) input.betPerLine /= rules.GetTetraSpinRules().GetSubScreenCount();
    return GenerateRandomZeroRewardRound(rules, input, [this.GetLastRoundResultVisualSeed()]);
  }

  SetLastRoundResult(result: RoundResult) {
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(result.GetInput().roundType);
    const slot = rules.GetLastResultSlot();
    const nvrams = this.Nvram(GameManagerNvrams);
    if (slot >= nvrams.lastRoundResults.length) nvrams.lastRoundResults.length = slot + 1;
    nvrams.lastRoundResults[slot] = result;
    nvrams.lastRoundSlot = slot;
  }

  GetLastRoundResult() {
    const nvrams = this.ConstNvram(GameManagerNvrams);
    return nvrams.lastRoundResults[nvrams.lastRoundSlot];
  }

  GetLastNHistoryResultsBy(_roundType: RoundType, n: number) {
    // NOTE: it is made to work ONLY with Gamble rounds, for now
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const gambleRoundResults: RoundResult[] = [];
    for (const result of nvrams.gambleHistoryResults) {
      if (gambleRoundResults.length >= n) break;
      gambleRoundResults.push(result);
    }
    return gambleRoundResults;
  }

  AddHistoryResult(result: RoundResult) {
    // NOTE: it is made to work ONLY with Gamble rounds, for now
    const MAX_HISTORY_SIZE = 6;
    const history = this.Nvram(GameManagerNvrams).gambleHistoryResults;
    history.unshift(result);
    // Trim from the back if exceeding maximum size
    if (history.length > MAX_HISTORY_SIZE) history.pop();
  }

  private AtachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);
    this.ReactOn(this.RuntimeGetConst(IInfoHwButton.Events).buttonPressedEvent, this.OnInfoHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IInfoSwButtonView.Events).buttonPressedEvent, this.OnInfoSwButtonPressed);
  }

  private GetLastRoundResultVisualSeed() {
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const results = nvrams.lastRoundResults;
    const slot = nvrams.lastRoundSlot;
    if (IsValidIndex(results, slot)) return results[slot].m_replay.input.visualSeed;
    return RandomDevice();
  }

  OnCreditChanged(transaction: TransactionInfo) {
    if (transaction.transactionType === TransactionType.CashIn) {
      this.RuntimeGet(ICreditBarView).SetValueNow(this.RuntimeGet(IWallet).GetCredit());
    }
    return this.Forward();
  }

  OnInfoSwButtonPressed() {
    this.RuntimeGet(IInfoView).ShowNextPage();
    return this.Consume();
  }

  OnInfoHwButtonPressed() {
    this.RuntimeGet(IInfoView).ShowNextPage();
    return this.Consume();
  }

  OnAutoPlayHwButtonPressed() {
    if (!this.IsAutoPlayOn()) return this.Skip();
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
    this.SetAutoPlay(false);
    return this.Consume();
  }
}
