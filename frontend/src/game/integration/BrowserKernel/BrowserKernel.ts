// The BrowserKernel module: the cabinet around the game, in the browser. It keeps the player's credit (in the
// browser's storage), plays the kernel's part in matches, and provides the services a C++ integration provides: the
// wallet, the limits, the localization, the hardware buttons (the keyboard and the page's panel), the recovery's state
// change actions, responsible gaming and the application control.

import { EventQueue } from '@game/engine/Core/Event';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { HW_BUTTONS, HwButtonLight, type HwButtonName, type HwButtonState, IHwButtonEvents, type IHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ECapTiming, ILimits, ILimitsEvents } from '@game/engine/Game/RuntimeImport/ILimits';
import { ILocalization, ILocalizationEvents } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IRecovery, IRecoveryEvents, type IStateChangeAction } from '@game/engine/Game/RuntimeImport/IRecovery';
import { IAppControl, IResponsibleGaming, IResponsibleGamingEvents } from '@game/engine/Game/RuntimeImport/IResponsibleGaming';
import { IWallet, IWalletEvents, TransactionType } from '@game/engine/Game/RuntimeImport/IWallet';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { IKernelIntegration, IKernelIntegrationEvents, type IKernelApi } from './IKernelIntegration';

const CREDIT_STORAGE_KEY = 'egt-game-credit';
const LANGUAGES = ['en-GB', 'it-IT'];

export interface BrowserKernelConfig extends ModuleConfig {
  /** The credit a new player starts with. */
  initialCredit?: number;
  /** The highest win of a match, in credits (0: none). */
  capping?: number;
  minBet?: number;
  maxBet?: number;
  /** Called when the game exits (the exit button): the page leaves the game. */
  onExit?: () => void;
}

class HwButton implements IHwButton {
  readonly events = new IHwButtonEvents();
  state: Required<HwButtonState> = { enabled: false, light: HwButtonLight.Off };

  SetButtonState(state: HwButtonState) {
    this.state = { enabled: state.enabled ?? false, light: state.light ?? (state.enabled ? HwButtonLight.On : HwButtonLight.Off) };
  }

  GetButtonState() {
    return { ...this.state };
  }

  SimulateButtonPress() {
    this.events.buttonPressedEvent.Post();
  }

  /** A press of the cabinet's button, which a disabled button ignores. */
  Press() {
    if (this.state.enabled) this.events.buttonPressedEvent.Post();
  }
}

export class BrowserKernel extends BaseModule implements IKernelApi, IKernelIntegration {
  private readonly queue = new EventQueue();
  private readonly kernelEvents = new IKernelIntegrationEvents();
  private readonly walletEvents = new IWalletEvents();
  private readonly limitsEvents = new ILimitsEvents();
  private readonly localizationEvents = new ILocalizationEvents();
  private readonly recoveryEvents = new IRecoveryEvents();
  private readonly responsibleEvents = new IResponsibleGamingEvents();
  readonly buttons = new Map<HwButtonName, HwButton>();
  private credit = 0;
  private language = LANGUAGES[0];
  private config: BrowserKernelConfig = {};
  private capping = 0;

  Init(runtime: Runtime, config: BrowserKernelConfig) {
    super.Init(runtime, config);
    this.config = config;
    this.capping = config.capping ?? 0;
    this.credit = this.LoadCredit(config.initialCredit ?? 10000);
    const kernel = this;
    this.RuntimeAdd(IKernelIntegration, this);
    this.RuntimeAdd(IKernelIntegration.Events, this.kernelEvents);
    this.RuntimeAdd(IWallet, { GetCredit: () => kernel.credit, StartCashout: () => kernel.Cashout() });
    this.RuntimeAdd(IWallet.Events, this.walletEvents);
    this.RuntimeAdd(ILimits, {
      GetBetLimits: () => ({ minBet: config.minBet ?? 0, maxBet: config.maxBet ?? Number.MAX_SAFE_INTEGER, defaultBet: 0 }),
      GetWinCapping: () => ({ capping: kernel.capping, capTiming: ECapTiming.AfterRoundOutcome, capValueWinBar: true }),
      IsMaxBetStartingGame: () => false,
      IsTaxThresholdBreached: () => false,
      ShowTaxMessage: () => kernel.queue.AddCallback(() => kernel.limitsEvents.taxMessageClosed.Post()),
      CloseTaxMessage: () => kernel.limitsEvents.taxMessageClosed.Post(),
    });
    this.RuntimeAdd(ILimits.Events, this.limitsEvents);
    this.RuntimeAdd(ILocalization, {
      GetLanguage: () => kernel.language,
      SetLanguage: language => {
        if (!LANGUAGES.includes(language) || language === kernel.language) return;
        kernel.language = language;
        kernel.localizationEvents.languageChanged.Post(language);
      },
      GetSupportedLanguages: () => [...LANGUAGES],
      FormatCurrency: value => BrowserKernel.FormatCurrency(value),
      FormatNumber: value => BrowserKernel.FormatCurrency(value),
    });
    this.RuntimeAdd(ILocalization.Events, this.localizationEvents);
    this.RuntimeAdd(IRecovery, {
      // The action comes back as an event the machine delivers to the states, which commit it.
      RequestStateChangeAction: action => kernel.recoveryEvents.onStateChangeAction.Post(BrowserKernel.StateChangeAction(action)),
      // the browser game does not recover: nothing is a replay
      IsReplayStateChangeAction: () => false,
    });
    this.RuntimeAdd(IRecovery.Events, this.recoveryEvents);
    this.RuntimeAdd(IResponsibleGaming, {
      IsResponsibleGamingSetupEnable: () => false,
      HasPendingResponsibleGamingWarning: () => false,
      OpenResponsibleGamingWarning: () => {},
      OpenResponsibleGamingSetupView: () => {},
    });
    this.RuntimeAdd(IResponsibleGaming.Events, this.responsibleEvents);
    this.RuntimeAdd(IAppControl, {
      ExitGracefully: () => {
        if (!kernel.config.onExit) return false;
        kernel.config.onExit();
        return true;
      },
    });
    for (const [name, token] of Object.entries(HW_BUTTONS) as [HwButtonName, (typeof HW_BUTTONS)[HwButtonName]][]) {
      const button = new HwButton();
      this.buttons.set(name, button);
      this.RuntimeAdd(token, button);
      this.RuntimeAdd(token.Events, button.events);
    }
    return true;
  }

  Deinit() {
    for (const token of Object.values(HW_BUTTONS)) {
      this.RuntimeRemove(token);
      this.RuntimeRemove(token.Events);
    }
    for (const token of [IKernelIntegration, IWallet, ILimits, ILocalization, IRecovery, IResponsibleGaming]) {
      this.RuntimeRemove(token);
      this.RuntimeRemove(token.Events);
    }
    this.RuntimeRemove(IAppControl);
    super.Deinit();
  }

  /** The kernel answers its requests here, after the game's frame. */
  Process() {
    this.queue.ExecuteAllCallbacks();
  }

  static FormatCurrency(value: number) {
    const sign = value < 0 ? '-' : '';
    const [whole, cents] = (Math.abs(value) / 100).toFixed(2).split('.');
    return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
  }

  private static StateChangeAction(action: object): IStateChangeAction {
    return {
      GetData: <T>(type: new () => T) => (action instanceof type ? (action as T) : null),
      Commit: () => {},
    };
  }

  // The cabinet

  GetCredit() {
    return this.credit;
  }

  /** Puts money in: the cabinet's bill acceptor. */
  CashIn(amount: number) {
    this.SetCredit(this.credit + amount, TransactionType.CashIn, amount);
  }

  PressButton(name: HwButtonName) {
    this.buttons.get(name)?.Press();
  }

  GetButtonStates() {
    return Object.fromEntries([...this.buttons].map(([name, button]) => [name, button.GetButtonState()])) as Record<HwButtonName, Required<HwButtonState>>;
  }

  private Cashout() {
    const amount = this.credit;
    this.walletEvents.onCashoutStart.Post();
    this.queue.AddCallback(() => {
      this.SetCredit(0, TransactionType.Cashout, -amount);
      this.walletEvents.onCashoutEnd.Post(true);
    });
  }

  private SetCredit(credit: number, transactionType: TransactionType, amount: number) {
    this.credit = credit;
    try {
      localStorage.setItem(CREDIT_STORAGE_KEY, String(credit));
    } catch {
      // the credit lasts until the page closes
    }
    this.walletEvents.onCreditChanged.Post({ transactionType, amount, newCreditTotal: credit });
  }

  /** The maximum award of a match, in credits: the setup's, or a developer's to test the capping. */
  GetCapping() {
    return this.capping;
  }

  SetCapping(capping: number) {
    this.capping = capping;
  }

  /** The setup's maximum award. */
  GetConfiguredCapping() {
    return this.config.capping ?? 0;
  }

  private LoadCredit(initial: number) {
    try {
      const stored = Number(localStorage.getItem(CREDIT_STORAGE_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : initial;
    } catch {
      return initial;
    }
  }

  // IKernelIntegration

  GetKernelApi(): IKernelApi {
    return this;
  }

  RequestStartMatch(creditBet: number) {
    this.queue.AddCallback(() => {
      const approved = creditBet > 0 && creditBet <= this.credit;
      if (approved) this.SetCredit(this.credit - creditBet, TransactionType.Bet, -creditBet);
      this.kernelEvents.startMatchReply.Post(approved);
    });
  }

  RequestStartRound(_roundName: string) {
    this.queue.AddCallback(() => this.kernelEvents.startRoundReply.Post());
  }

  RequestRandoms(count: number) {
    this.queue.AddCallback(() => this.kernelEvents.randomsReply.Post([...crypto.getRandomValues(new Uint32Array(count))]));
  }

  RequestRoundOutcome(_creditWin: number) {
    this.queue.AddCallback(() => this.kernelEvents.roundOutcomeReply.Post());
  }

  RequestEndMatch(creditWin: number) {
    this.queue.AddCallback(() => {
      if (creditWin > 0) this.SetCredit(this.credit + creditWin, TransactionType.Win, creditWin);
      this.kernelEvents.endMatchReply.Post(creditWin);
    });
  }
}
