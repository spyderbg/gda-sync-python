// Egt::Game::AlphaFamily::BetManager (AlphaFamilyStatesLibrary/BetManager.h/.cpp): the bet and the lines, their
// allowed values and limit, changed by the bet buttons and menu.

import { Event } from '@game/engine/Core/Event';
import { State } from '@game/engine/Fsm/Fsm';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IDecreaseBetHwButton, IIncreaseBetHwButton, IMaxBetHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IRecovery, type IStateChangeAction } from '@game/engine/Game/RuntimeImport/IRecovery';
import { AssertIf, AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import type { AnyData } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { BetManagerNvrams, BetManagerStatics, type Bets, IBetManager, type IBetManagerEvents, type Lines } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { ILineDownSwButtonView, ILineUpSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ChangeBetAction } from './BetManager.data';

export class BetManager extends State implements IBetManager, IBetManagerEvents {
  static Interfaces = [IBetManager, IBetManager.Events];
  static Nvrams = [BetManagerNvrams];
  static Statics = [BetManagerStatics];

  readonly betChanged = new Event<[number]>();
  readonly linesChanged = new Event<[number]>();
  readonly startMatchRequested = new Event();
  readonly currencyChanged = new Event<[CurrencyType]>();

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    // IRecovery
    this.ReactOn(this.RuntimeGetConst(IRecovery.Events).onStateChangeAction, this.OnStateChangeAction);

    // hw buttons
    this.ReactOn(this.RuntimeGetConst(IMaxBetHwButton.Events).buttonPressedEvent, this.OnMaxBetHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IIncreaseBetHwButton.Events).buttonPressedEvent, this.OnIncreaseBetHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IDecreaseBetHwButton.Events).buttonPressedEvent, this.OnDecreaseBetHwButtonPressed);
    // view events
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).requestIncreaseBetEvent, this.OnBetUpRequest);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).requestDecreaseBetEvent, this.OnBetDownRequest);
    this.ReactOn(this.RuntimeGetConst(ILineUpSwButtonView.Events).buttonPressedEvent, this.OnLineUpSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ILineDownSwButtonView.Events).buttonPressedEvent, this.OnLineDownSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).requestBetChanged, this.OnViewBetChanged);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).requestLinesChanged, this.OnViewLinesChanged);
  }

  SetEditMode(enabled: boolean) {
    this.m_editEnabled = enabled;
  }

  SetAllowedBets(bets: Bets) {
    bets.sort((a, b) => a - b);
    this.Static(BetManagerStatics).allowedBets = bets;
  }

  GetAllowedBets() {
    return this.ConstStatic(BetManagerStatics).allowedBets;
  }

  SetAllowedLines(lines: Lines) {
    lines.sort((a, b) => a - b);
    this.Static(BetManagerStatics).allowedLines = lines;
  }

  GetAllowedLines() {
    return this.ConstStatic(BetManagerStatics).allowedLines;
  }

  SetBetLimit(limit: number) {
    this.Static(BetManagerStatics).betLimit = limit;
  }

  GetBetLimit() {
    return this.ConstStatic(BetManagerStatics).betLimit;
  }

  SetCurrentBet(bet: number) {
    if (this.ConstNvram(BetManagerNvrams).currentBet !== bet) {
      this.Nvram(BetManagerNvrams).currentBet = bet;

      this.betChanged.Post(bet);
    }
  }

  GetCurrentBet() {
    return this.ConstNvram(BetManagerNvrams).currentBet;
  }

  SetCurrentLines(lines: number) {
    if (this.ConstNvram(BetManagerNvrams).currentLines !== lines) {
      this.Nvram(BetManagerNvrams).currentLines = lines;

      this.linesChanged.Post(lines);
    }
  }

  GetCurrentLines() {
    return this.ConstNvram(BetManagerNvrams).currentLines;
  }

  SetInitialBetFromCurrent() {
    const nvrams = this.Nvram(BetManagerNvrams);
    nvrams.initialBet = nvrams.currentBet;
    nvrams.initialLines = nvrams.currentLines;
    nvrams.initialBetModified = true;
  }

  GetInitialBet() {
    return this.ConstNvram(BetManagerNvrams).initialBet;
  }

  GetInitialLines() {
    return this.ConstNvram(BetManagerNvrams).initialLines;
  }

  GetMinBet() {
    const bets = this.GetAllowedBets();
    if (AssertIf(bets.length === 0)) return 0;

    return bets[0];
  }

  GetMaxBet() {
    const bets = this.GetBetsWithinLimits();
    if (bets.length === 0) return 0;

    return bets[bets.length - 1];
  }

  GetNextBet() {
    const bets = this.GetBetsWithinLimits();
    if (bets.length === 0) return 0;
    const currentBet = this.GetCurrentBet();

    for (const bet of bets) {
      if (bet > currentBet) return bet;
    }

    return bets[0];
  }

  GetPrevBet() {
    const bets = this.GetBetsWithinLimits();
    if (bets.length === 0) return 0;
    const currentBet = this.GetCurrentBet();

    for (const bet of [...bets].reverse()) {
      if (bet < currentBet) return bet;
    }

    return bets[bets.length - 1];
  }

  SetBetCurrency(type: CurrencyType) {
    if (this.ConstNvram(BetManagerNvrams).currencyBet !== type) {
      this.Nvram(BetManagerNvrams).currencyBet = type;

      this.currencyChanged.Post(type);
    }
  }

  GetBetCurrency() {
    return this.ConstNvram(BetManagerNvrams).currencyBet;
  }

  GetMinLines() {
    const lines = this.GetAllowedLines();
    if (AssertIf(lines.length === 0)) return 0;

    return lines[0];
  }

  GetMaxLines() {
    const lines = this.GetAllowedLines();
    if (AssertIf(lines.length === 0)) return 0;

    return lines[lines.length - 1];
  }

  GetNextLines() {
    const lines = this.GetAllowedLines();
    if (AssertIf(lines.length === 0)) return 0;
    const currentLines = this.GetCurrentLines();

    for (const l of lines) {
      if (l > currentLines) return l;
    }

    return lines[0];
  }

  GetPrevLines() {
    const lines = this.GetAllowedLines();
    if (AssertIf(lines.length === 0)) return 0;
    const currentLines = this.GetCurrentLines();

    for (const l of [...lines].reverse()) {
      if (l < currentLines) return l;
    }

    return lines[lines.length - 1];
  }

  GetAllowedBetsIncludingSelected() {
    const bets = [...this.GetAllowedBets()];
    const currentBet = this.GetCurrentBet();

    // C++'s std::ranges::lower_bound: the first bet not below the current one
    let it = bets.findIndex(bet => bet >= currentBet);
    if (it < 0) it = bets.length;
    if (it === bets.length || bets[it] !== currentBet) {
      bets.splice(it, 0, currentBet);
    }

    return bets;
  }

  GetBetsWithinLimits() {
    const result: Bets = [];
    const limit = this.GetBetLimit();
    const allowedBets = this.GetAllowedBets();
    if (AssertIf(allowedBets.length === 0)) return result;

    for (const bet of allowedBets) {
      if (bet <= limit) result.push(bet);
    }

    if (result.length === 0) {
      result.push(allowedBets[0]); // not sure for this
    }

    return result;
  }

  SetInitialBetModified(modified: boolean) {
    this.Nvram(BetManagerNvrams).initialBetModified = modified;
  }

  GetInitialBetModified() {
    return this.ConstNvram(BetManagerNvrams).initialBetModified;
  }

  private RequestStateChangeAction(action: AnyData) {
    this.RuntimeGetConst(IRecovery).RequestStateChangeAction(action);
    /// When requesting a state change, we always reject the event, acting as if nothing happened and stopping propagation.
    return this.Reject();
  }

  private OnStateChangeAction(stateChangeAction: IStateChangeAction) {
    if (AssertUnless(stateChangeAction)) return this.Reject();
    const action = stateChangeAction.GetData(ChangeBetAction);
    if (Unless(action)) return this.Reject();
    if (Unless(this.m_editEnabled)) return this.Reject();

    let changed = this.ConstNvram(BetManagerNvrams).currentBet !== action.bet;
    if (!changed && !action.autoStart) return this.Reject();

    {
      /// Commit the state change action forcing openMenu=false, because during replays, we don't want the bet menu animations.
      const commitAction = Object.assign(new ChangeBetAction(), action);
      commitAction.openMenu = false;
      stateChangeAction.Commit(commitAction);
    }

    if (changed) {
      this.Nvram(BetManagerNvrams).currentBet = action.bet;
      this.betChanged.Post(action.bet);
    }
    if (action.openMenu) {
      this.RuntimeGet(IBetMenuView).OpenMenu();
    }
    if (action.autoStart) {
      this.startMatchRequested.Post();
    }
    return this.Consume();
  }

  private OnMaxBetHwButtonPressed() {
    if (Unless(this.m_editEnabled)) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetMaxBet();
    if (this.RuntimeGetConst(ILimits).IsMaxBetStartingGame()) {
      action.autoStart = true;
    } else {
      action.openMenu = true;
    }
    return this.RequestStateChangeAction(action);
  }

  private OnIncreaseBetHwButtonPressed() {
    if (Unless(this.m_editEnabled)) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetNextBet();
    action.openMenu = true;
    return this.RequestStateChangeAction(action);
  }

  private OnDecreaseBetHwButtonPressed() {
    if (Unless(this.m_editEnabled)) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetPrevBet();
    action.openMenu = true;
    return this.RequestStateChangeAction(action);
  }

  private OnBetUpRequest() {
    if (Unless(this.m_editEnabled)) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetNextBet();
    return this.RequestStateChangeAction(action);
  }

  private OnBetDownRequest() {
    if (Unless(this.m_editEnabled)) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetPrevBet();
    return this.RequestStateChangeAction(action);
  }

  private OnViewBetChanged(bet: number) {
    this.SetCurrentBet(bet);
    return this.Forward();
  }

  private OnViewLinesChanged(lines: number) {
    this.SetCurrentLines(lines);
    return this.Forward();
  }

  private OnLineUpSwButtonPressed() {
    if (Unless(this.m_editEnabled)) return this.Skip();

    const lines = this.GetNextLines();
    this.SetCurrentLines(lines);

    return this.Consume();
  }

  private OnLineDownSwButtonPressed() {
    if (Unless(this.m_editEnabled)) return this.Skip();

    const lines = this.GetPrevLines();
    this.SetCurrentLines(lines);

    return this.Consume();
  }

  private m_editEnabled = false;
}

EgtALogCategoryClass(BetManager, 'BetManager');
