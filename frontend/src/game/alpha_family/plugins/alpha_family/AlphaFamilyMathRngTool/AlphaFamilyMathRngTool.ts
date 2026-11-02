// Egt::Game::AlphaFamily::AlphaFamilyMathRngTool (AlphaFamilyMathRngTool/AlphaFamilyMathRngTool.h/.cpp, a module of the
// QA and debug builds' modules config): the RNG Picker, Tools → RNG Picker. Its window picks a round's outcome (the
// reels' stops, a wheel's sector) and adds its RNG numbers to the kernel's RNG queue (IRngPreset). With Tab Sync, it
// shows the tab of the round the game plays next: the round starting, the gameflow's next round when one ends, and the
// wheel or the gamble when the player's button enters it. The Play page draws its window (debug/RngPickerWindow.vue).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IDebugOverlay, type MainMenuBar } from '@game/engine/Game/RuntimeExport/IDebugOverlay';
import { IMathTypes } from '@game/engine/Game/RuntimeExport/IMathTypes';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { ICashoutHwButton, IGambleHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { IRngPreset } from '@game/engine/Game/RuntimeImport/IRngPreset';
import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import { GetImageData, type ImageData } from '@game/engine/GameVideoCtrl/ImageData';
import { SBool } from '@game/engine/ImGuiEx/Extensions/Utils';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { IGameflowIntegration } from '@game/integration/Runtime/IGameflowIntegration';
import { Currency, RoundType, type SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { RngTool } from './RngTool';
import { RngToolContext, RngToolContextCallbacks } from './RngToolContext';
import { RngToolReel } from './RngToolReel';

export class AlphaFamilyMathRngTool extends BaseModule {
  readonly m_imguiWindowOpen = new SBool('RngPicker_open');
  private m_context: RngToolContext | null = null;
  m_data: RngTool | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.m_context = new RngToolContext();
    this.m_data = new RngTool();
    this.m_imguiWindowOpen.Load();

    const debugOverlay = this.RuntimeTryGetConst(IDebugOverlay.Events);
    if (debugOverlay) {
      debugOverlay.imguiMainMenuBar.RegisterInstant(this, menuBar => this.OnImGuiMainMenuBar(menuBar));
    }

    return true;
  }

  PostInit() {
    this.m_context!.m_mathRules = this.RuntimeTryGetConst(IMathRules) ?? null;
    this.m_context!.m_kernelRngPresets = this.RuntimeTryGet(IRngPreset) ?? null;
    const callbacks = this.GetCtxCallbacks();
    this.m_context!.m_callbacks.imageGetter = callbacks.imageGetter;
    this.m_context!.m_callbacks.symbolNameGetter = callbacks.symbolNameGetter;
    this.m_data!.Init(this.m_context);

    const gameflowEvents = this.RuntimeGetConst(IGameflowIntegration.Events);
    gameflowEvents.roundStarting.RegisterInstant(this, roundType => this.OnGameflowRoundStarting(roundType));
    gameflowEvents.roundEnded.RegisterInstant(this, roundType => this.OnGameflowRoundEnded(roundType));

    this.RegisterPlayerRoundEntryEvents();

    return true;
  }

  PreDeinit() {
    this.m_data!.Deinit();
    this.m_context!.m_mathRules = null;
    this.m_context!.m_kernelRngPresets = null;
  }

  Deinit() {
    this.RuntimeTryGetConst(IDebugOverlay.Events)?.imguiMainMenuBar.Unregister(this);
    const gameflowEvents = this.RuntimeTryGetConst(IGameflowIntegration.Events);
    gameflowEvents?.roundStarting.Unregister(this);
    gameflowEvents?.roundEnded.Unregister(this);
    this.RuntimeTryGetConst(ITakeCoinsSwButtonView.Events)?.buttonPressedEvent.Unregister(this);
    this.RuntimeTryGetConst(ICashoutHwButton.Events)?.buttonPressedEvent.Unregister(this);
    this.RuntimeTryGetConst(IGambleHwButton.Events)?.buttonPressedEvent.Unregister(this);

    this.m_data = null;
    this.m_context = null;
    super.Deinit();
  }

  Process() {
    super.Process();

    // C++ saves the window's state at the end of its ImGuiDraw, every frame
    this.m_imguiWindowOpen.Save();
  }

  private OnImGuiMainMenuBar(menuBar: MainMenuBar) {
    // if password protected
    const rngPreset = this.RuntimeTryGetConst(IRngPreset);
    const mathHidden = rngPreset !== undefined && rngPreset.AreMathDetailsHidden();
    if (mathHidden) return;

    menuBar.MenuItem('Tools', 'RNG Picker', () => {
      this.m_imguiWindowOpen.value = true;
    });
  }

  private OnGameflowRoundStarting(roundType: GameRoundType) {
    this.m_data!.SyncRoundType(roundType as RoundType);
  }

  private OnGameflowRoundEnded(_roundType: GameRoundType) {
    const gameflow = this.RuntimeGetConst(IGameflow);
    if (gameflow.IsIdle()) return;

    let nextRoundType = gameflow.GetNextRoundType();
    if (nextRoundType === RoundType.Undefined) {
      nextRoundType = this.RuntimeGetConst(IMathTypes).GetMainRoundType() as RoundType;
    }

    this.m_data!.SyncRoundType(nextRoundType);
  }

  private RegisterPlayerRoundEntryEvents() {
    // Wheel and Gamble are not part of the round sequence predicted by the gameflow - the player enters them
    // on demand, so the tool syncs on the input that triggers the transition, before the round is requested.
    const takeCoinsButton = this.RuntimeTryGetConst(ITakeCoinsSwButtonView.Events);
    if (takeCoinsButton) {
      takeCoinsButton.buttonPressedEvent.RegisterInstant(this, () => this.OnWheelRoundRequested());
    }
    const cashoutButton = this.RuntimeTryGetConst(ICashoutHwButton.Events);
    if (cashoutButton) {
      cashoutButton.buttonPressedEvent.RegisterInstant(this, () => this.OnWheelRoundRequested());
    }
    const gambleButton = this.RuntimeTryGetConst(IGambleHwButton.Events);
    if (gambleButton) {
      gambleButton.buttonPressedEvent.RegisterInstant(this, () => this.OnGambleRoundRequested());
    }
  }

  private OnWheelRoundRequested() {
    if (!this.CanPlayerEnterRound(RoundType.Wheel)) return;
    this.m_data!.SyncRoundType(RoundType.Wheel);
  }

  private OnGambleRoundRequested() {
    if (!this.CanPlayerEnterRound(RoundType.Gamble)) return;
    this.m_data!.SyncRoundType(RoundType.Gamble);
  }

  private CanPlayerEnterRound(roundType: RoundType) {
    // The same buttons serve other actions in the rest of the game, so sync only when the round is affordable.
    const gameflow = this.RuntimeTryGetConst(IGameflow);
    if (!(gameflow !== undefined && !gameflow.IsIdle())) return false;

    const mathRules = this.m_context!.m_mathRules;
    if (!(mathRules !== null && mathRules.HasWheelRoundRules(roundType))) return false;

    const available = gameflow.GetMatchCurrenciesAvailable();
    switch (roundType) {
      case RoundType.Wheel:
        if (this.m_data!.GetSelectedRoundType() === RoundType.Gamble) return false;
        if (!(available.Get(Currency.WheelToken) > 0)) return false;
        return available.Get(Currency.CoinsSpinEnergy) >= mathRules.GetWheelRoundRules(roundType).GetMinimumCoinBet();
      case RoundType.Gamble:
        return available.Get(Currency.GambleToken) > 0 && available.Get(Currency.Credits) > 0;
      default:
        return false;
    }
  }

  /** What a symbol's button shows (SymbolButton): "?" for any symbol, else the symbol's IMAGE_RNG_PICKER_<name> image,
   * else its name. */
  GetSymbolButton(roundType: RoundType, symId: SymbolId): { text: string; image: ImageData | null } {
    if (symId === RngToolReel.SEARCH_ANY_SYMBOL) return { text: '?', image: null };
    const [, symText] = this.m_context!.m_callbacks.symbolNameGetter!(roundType, symId); // must have
    const image = this.m_context!.m_callbacks.imageGetter!(`IMAGE_RNG_PICKER_${symText}`); // check for proper texture
    return { text: symText, image };
  }

  private GetCtxCallbacks() {
    const callbacks = new RngToolContextCallbacks();
    const mathRules = this.m_context!.m_mathRules;
    callbacks.symbolNameGetter = (roundType: RoundType, id: SymbolId): [boolean, string] => {
      if (!mathRules) return [false, ''];
      const symbols = mathRules.GetReelRoundRules(roundType).GetSymbolNames();
      for (const sym of symbols) {
        if (sym.id === id) {
          return [true, sym.name];
        }
      }
      return [false, `Undefined${id}`];
    };
    const runtime = this.GetRuntime();
    callbacks.imageGetter = (rssKey: string) => GetImageData(runtime.Get(IResources), rssKey);

    return callbacks;
  }
}
