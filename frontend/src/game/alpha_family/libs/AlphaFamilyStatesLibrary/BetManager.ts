// Egt::Game::AlphaFamily::BetManager (AlphaFamilyStatesLibrary/BetManager.h/.cpp): the bet and the lines, their
// allowed values and limit, changed by the bet buttons and menu.

import { Event } from '../../../engine/Core/Event';
import { State } from '../../../engine/Fsm/Fsm';
import type { CurrencyType } from '../../../engine/Game/Math/Common.data';
import { IDecreaseBetHwButton, IIncreaseBetHwButton, IMaxBetHwButton } from '../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '../../../engine/Game/RuntimeImport/ILimits';
import { IRecovery, type IStateChangeAction } from '../../../engine/Game/RuntimeImport/IRecovery';
import { BetManagerNvrams, BetManagerStatics, type Bets, IBetManager, type IBetManagerEvents, type Lines } from '../AlphaFamily/States/IBetManager';
import { IBetMenuView } from '../AlphaFamily/Views/IBetMenuView.bridge';
import { ILineDownSwButtonView, ILineUpSwButtonView } from '../AlphaFamily/Views/SwButtonViews.bridge';
import { ChangeBetAction } from './BetManager.data';

export class BetManager extends State implements IBetManager, IBetManagerEvents {
  static Interfaces = [IBetManager, IBetManager.Events];
  static Nvrams = [BetManagerNvrams];
  static Statics = [BetManagerStatics];

  readonly betChanged = new Event<[number]>();
  readonly linesChanged = new Event<[number]>();
  readonly startMatchRequested = new Event();
  readonly currencyChanged = new Event<[CurrencyType]>();
  private m_editEnabled = false;

  OnTransit() {
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

  private get nvrams() {
    return this.Nvram(BetManagerNvrams);
  }

  private get statics() {
    return this.Static(BetManagerStatics);
  }

  SetEditMode(enabled: boolean) {
    this.m_editEnabled = enabled;
  }

  SetAllowedBets(bets: Bets) {
    this.statics.allowedBets = [...bets].sort((a, b) => a - b);
  }

  GetAllowedBets() {
    return this.statics.allowedBets;
  }

  SetAllowedLines(lines: Lines) {
    this.statics.allowedLines = [...lines].sort((a, b) => a - b);
  }

  GetAllowedLines() {
    return this.statics.allowedLines;
  }

  SetBetLimit(limit: number) {
    this.statics.betLimit = limit;
  }

  GetBetLimit() {
    return this.statics.betLimit;
  }

  SetCurrentBet(bet: number) {
    if (this.nvrams.currentBet !== bet) {
      this.nvrams.currentBet = bet;
      this.betChanged.Post(bet);
    }
  }

  GetCurrentBet() {
    return this.nvrams.currentBet;
  }

  SetCurrentLines(lines: number) {
    if (this.nvrams.currentLines !== lines) {
      this.nvrams.currentLines = lines;
      this.linesChanged.Post(lines);
    }
  }

  GetCurrentLines() {
    return this.nvrams.currentLines;
  }

  SetInitialBetFromCurrent() {
    const nvrams = this.nvrams;
    nvrams.initialBet = nvrams.currentBet;
    nvrams.initialLines = nvrams.currentLines;
    nvrams.initialBetModified = true;
  }

  GetInitialBet() {
    return this.nvrams.initialBet;
  }

  GetInitialLines() {
    return this.nvrams.initialLines;
  }

  GetMinBet() {
    return this.GetAllowedBets()[0] ?? 0;
  }

  GetMaxBet() {
    const bets = this.GetBetsWithinLimits();
    return bets[bets.length - 1] ?? 0;
  }

  GetNextBet() {
    const bets = this.GetBetsWithinLimits();
    if (!bets.length) return 0;
    return bets.find(bet => bet > this.GetCurrentBet()) ?? bets[0];
  }

  GetPrevBet() {
    const bets = this.GetBetsWithinLimits();
    if (!bets.length) return 0;
    return [...bets].reverse().find(bet => bet < this.GetCurrentBet()) ?? bets[bets.length - 1];
  }

  SetBetCurrency(type: CurrencyType) {
    if (this.nvrams.currencyBet !== type) {
      this.nvrams.currencyBet = type;
      this.currencyChanged.Post(type);
    }
  }

  GetBetCurrency() {
    return this.nvrams.currencyBet;
  }

  GetMinLines() {
    return this.GetAllowedLines()[0] ?? 0;
  }

  GetMaxLines() {
    const lines = this.GetAllowedLines();
    return lines[lines.length - 1] ?? 0;
  }

  GetNextLines() {
    const lines = this.GetAllowedLines();
    return lines.find(line => line > this.GetCurrentLines()) ?? lines[0] ?? 0;
  }

  GetPrevLines() {
    const lines = this.GetAllowedLines();
    return [...lines].reverse().find(line => line < this.GetCurrentLines()) ?? lines[lines.length - 1] ?? 0;
  }

  GetAllowedBetsIncludingSelected() {
    const bets = [...this.GetAllowedBets()];
    const currentBet = this.GetCurrentBet();
    if (!bets.includes(currentBet)) {
      bets.push(currentBet);
      bets.sort((a, b) => a - b);
    }
    return bets;
  }

  GetBetsWithinLimits() {
    const limit = this.GetBetLimit();
    const allowedBets = this.GetAllowedBets();
    if (!allowedBets.length) return [];
    const result = allowedBets.filter(bet => bet <= limit);
    return result.length ? result : [allowedBets[0]]; // not sure for this
  }

  SetInitialBetModified(modified: boolean) {
    this.nvrams.initialBetModified = modified;
  }

  GetInitialBetModified() {
    return this.nvrams.initialBetModified;
  }

  private RequestStateChangeAction(action: ChangeBetAction) {
    this.RuntimeGetConst(IRecovery).RequestStateChangeAction(action);
    /// When requesting a state change, we always reject the event, acting as if nothing happened and stopping propagation.
    return this.Reject();
  }

  OnStateChangeAction(stateChangeAction: IStateChangeAction) {
    const action = stateChangeAction.GetData(ChangeBetAction);
    if (!action || !this.m_editEnabled) return this.Reject();
    const changed = this.nvrams.currentBet !== action.bet;
    if (!changed && !action.autoStart) return this.Reject();
    /// Commit the state change action forcing openMenu=false, because during replays, we don't want the bet menu animations.
    stateChangeAction.Commit(Object.assign(new ChangeBetAction(), action, { openMenu: false }));
    if (changed) {
      this.nvrams.currentBet = action.bet;
      this.betChanged.Post(action.bet);
    }
    if (action.openMenu) this.RuntimeGet(IBetMenuView).OpenMenu();
    if (action.autoStart) this.startMatchRequested.Post();
    return this.Consume();
  }

  OnMaxBetHwButtonPressed() {
    if (!this.m_editEnabled) return this.Skip();
    const action = new ChangeBetAction();
    action.bet = this.GetMaxBet();
    if (this.RuntimeGetConst(ILimits).IsMaxBetStartingGame()) action.autoStart = true;
    else action.openMenu = true;
    return this.RequestStateChangeAction(action);
  }

  OnIncreaseBetHwButtonPressed() {
    if (!this.m_editEnabled) return this.Skip();
    return this.RequestStateChangeAction(Object.assign(new ChangeBetAction(), { bet: this.GetNextBet(), openMenu: true }));
  }

  OnDecreaseBetHwButtonPressed() {
    if (!this.m_editEnabled) return this.Skip();
    return this.RequestStateChangeAction(Object.assign(new ChangeBetAction(), { bet: this.GetPrevBet(), openMenu: true }));
  }

  OnBetUpRequest() {
    if (!this.m_editEnabled) return this.Skip();
    return this.RequestStateChangeAction(Object.assign(new ChangeBetAction(), { bet: this.GetNextBet() }));
  }

  OnBetDownRequest() {
    if (!this.m_editEnabled) return this.Skip();
    return this.RequestStateChangeAction(Object.assign(new ChangeBetAction(), { bet: this.GetPrevBet() }));
  }

  OnViewBetChanged(bet: number) {
    this.SetCurrentBet(bet);
    return this.Forward();
  }

  OnViewLinesChanged(lines: number) {
    this.SetCurrentLines(lines);
    return this.Forward();
  }

  OnLineUpSwButtonPressed() {
    if (!this.m_editEnabled) return this.Skip();
    this.SetCurrentLines(this.GetNextLines());
    return this.Consume();
  }

  OnLineDownSwButtonPressed() {
    if (!this.m_editEnabled) return this.Skip();
    this.SetCurrentLines(this.GetPrevLines());
    return this.Consume();
  }
}
