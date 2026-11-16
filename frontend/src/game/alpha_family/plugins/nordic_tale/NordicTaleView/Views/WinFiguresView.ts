// Egt::Game::AlphaFamily::WinFiguresView (NordicTaleView/Views/WinFiguresView.h/.cpp): the animations of the reels'
// winning symbols, the hold and spin round's held shields (looping), and its comets: one per shield with an effect,
// flying from its cell one after another (all at once when fast-forwarded). A free spins shield's comet flies to
// dummy_comet_target_pos; a monetary one's to the win bar's or the coins bar's dummy, adding its share of the win there.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources, type Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AssertIf, AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { MoveTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency, RoundType, type SymbolViewInfo, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ICoinsBarView, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IWinFiguresView, IWinFiguresViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { WinFigureVisual } from '../Visuals/WinFiguresVisual';
import type { WinFiguresViewConfig } from './WinFiguresView.data';

const WinFiguresViewId = 'WinFiguresView';

const SoundCometSilenceId = 'COMMET_SILENCE_SOUND';
const SoundCometAllSilenceId = 'COMMET_SILENCE_ALL_SOUND';
const SoundCometExplodeId = 'COMMET_EXPLODE_SOUND';
const DummyCometTargetPosId = 'dummy_comet_target_pos';
const DummyCometTargetWinBarId = 'dummy_comet_target_winbar';
const DummyCometTargetCoinBarId = 'dummy_comet_target_coinbar';
const AnimCometEndExplosionId = 'anim_comet_end_explosion';

/** C++'s std::set<SymbolViewInfo>: the infos once each, ordered as its operator< orders them (symbol, reel, row). */
function SymbolViewInfoSet(infos: SymbolViewInfos) {
  const byKey = new Map<string, SymbolViewInfo>();
  for (const info of infos) byKey.set(info.key(), info);
  return [...byKey.values()].sort((a, b) => a.symbolId - b.symbolId || a.coord.reelId - b.coord.reelId || a.coord.rowId - b.coord.rowId);
}

/** C++'s == of two std::set<SymbolViewInfo>. */
function SameSymbolViewInfoSets(lhs: SymbolViewInfo[], rhs: SymbolViewInfo[]) {
  return lhs.map(info => info.key()).join('|') === rhs.map(info => info.key()).join('|');
}

enum EMode {
  None,
  Symbols,
  HoldAndSpinHeld,
  Comets,
}

type CometAction = tweeny.tween_action;

interface WinFigureSlot {
  visual: WinFigureVisual;
  cell: SymbolViewInfo;
}

interface CometSlot {
  action: CometAction;
  sourceCell: SymbolViewInfo;
}

export class WinFiguresView extends BaseView implements IWinFiguresView {
  protected readonly m_events = new IWinFiguresViewEvents();

  private m_mode = EMode.None;
  /** @cppType std::set<SymbolViewInfo> */
  private m_allWinSymbols: SymbolViewInfo[] = [];

  private m_config!: WinFiguresViewConfig;

  private m_winFigures: WinFigureSlot[] = [];
  private m_cometIds: string[] = [];

  private m_animWait = new tweeny.tween_action();
  private m_cometActions: CometSlot[] = [];
  private m_nextCometToStart = 0;
  private m_finishedComets = 0;
  private m_fastForwardComets = false;

  private m_cometUseCoinBar = false;
  private m_cometBarDisplayedValue = 0;
  private m_cometBarPerStep = 0;

  constructor() {
    super(WinFiguresViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.RuntimeAdd(IWinFiguresView, this);
    this.RuntimeAdd(IWinFiguresView.Events, this.m_events);

    this.InitElementsList(WinFiguresViewId, () => {
      this.AdjustSymbolViewSet(false);
    });

    const resources = this.RuntimeGet(IResources);
    this.m_config = resources.GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');
    // when its config's file changes, the figures shown are made again from it
    BrowserOnly(() => this.WatchConfig('WinFiguresViewConfig', () => this.ReloadConfig()));

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_animWait);
    this.StopComets();
    this.RemoveFigures();

    this.DeinitElementsList();

    this.RuntimeRemove(IWinFiguresView);
    this.RuntimeRemove(IWinFiguresView.Events);

    super.Deinit();
  }

  /** Reads its config again, when its file changed, and makes the figures shown again from it (from their loops), once
   * no comets fly; the wait for their animations goes on.
   * @browserOnly */
  private ReloadConfig() {
    if (this.m_mode === EMode.Comets) return false;
    this.m_config = this.RuntimeGet(IResources).GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');
    if (this.m_mode === EMode.HoldAndSpinHeld) {
      this.CreateHoldAndSpinHeldFigures();
      return true;
    }
    if (this.m_mode !== EMode.Symbols) return true;

    // CreateWinFigures stops the wait, which goes on
    const animWait = this.m_animWait;
    this.m_animWait = new tweeny.tween_action();
    this.CreateWinFigures(true, false);
    this.m_animWait = animWait;
    return true;
  }

  // IWinFiguresView
  ShowCombinations(combinations: ReelCombinations, playFromLoop: boolean) {
    const allWinSymbols = SymbolViewInfoSet(combinations.flatMap(combination => combination.symbolViewInfos));

    if (this.m_mode === EMode.Symbols && SameSymbolViewInfoSets(this.m_allWinSymbols, allWinSymbols)) return;

    this.m_mode = EMode.Symbols;
    this.m_allWinSymbols = allWinSymbols;

    this.AdjustSymbolViewSet(playFromLoop);
  }

  ShowWinFigures(infos: SymbolViewInfos) {
    const allWinSymbols = SymbolViewInfoSet(infos);

    if (this.m_mode === EMode.Symbols && SameSymbolViewInfoSets(this.m_allWinSymbols, allWinSymbols)) return;

    this.m_mode = EMode.Symbols;
    this.m_allWinSymbols = allWinSymbols;

    this.AdjustSymbolViewSet(false);
  }

  ShowHoldAndSpinHeldFigures(infos: SymbolViewInfos) {
    const heldSymbols = SymbolViewInfoSet(infos);

    if (this.m_mode === EMode.HoldAndSpinHeld && SameSymbolViewInfoSets(this.m_allWinSymbols, heldSymbols)) return;

    this.m_mode = EMode.HoldAndSpinHeld;
    this.m_allWinSymbols = heldSymbols;

    this.AdjustSymbolViewSet(false);
  }

  private static CountMonetaryCometShields(config: WinFiguresViewConfig, infos: SymbolViewInfos) {
    let count = 0;
    for (const info of infos) {
      const winFigures = config.winFiguresConfig.winFigures;
      const it = winFigures.find(figureInfo => {
        return figureInfo.id === info.symbolId;
      });
      if (it === undefined) continue;
      if ((it.effectId ?? '') === '') continue;
      if ((it.effectValue ?? 0) > 0) continue;

      ++count;
    }

    return count;
  }

  ShowComets(infos: SymbolViewInfos) {
    if (!infos.length) {
      this.m_events.cometsAnimDone.Post();
      return;
    }

    this.m_mode = EMode.Comets;
    this.m_allWinSymbols = [];

    this.m_allWinSymbols = SymbolViewInfoSet(infos);

    const gameflow = this.RuntimeGetConst(IGameflow);
    const triggerRound = gameflow.GetConsecutiveTriggerRoundType();
    this.m_cometUseCoinBar = triggerRound === RoundType.Coins || triggerRound === RoundType.CoinsFree;

    const monetaryCometCount = WinFiguresView.CountMonetaryCometShields(this.m_config, infos);
    if (monetaryCometCount > 0) {
      const currency = this.m_cometUseCoinBar ? Currency.CoinsSpinEnergy : Currency.Credits;
      const totalAvailable = gameflow.GetMatchCurrencyAvailable(currency);
      const cometCount = monetaryCometCount;
      this.m_cometBarPerStep = Math.max(1, Math.trunc(totalAvailable / cometCount));
      this.m_cometBarDisplayedValue = Math.max(0, totalAvailable - this.m_cometBarPerStep * cometCount);

      if (this.m_cometUseCoinBar) {
        this.RuntimeGet(ICoinsBarView).SetValueNow(this.m_cometBarDisplayedValue);
      } else {
        this.RuntimeGet(ICreditsWinBarView).SetValueNow(this.m_cometBarDisplayedValue);
      }
    } else {
      this.m_cometBarPerStep = 0;
    }

    this.AdjustSymbolViewSet(false);
  }

  RequestFastForwardComets() {
    if (this.m_mode !== EMode.Comets) return;

    this.m_fastForwardComets = true;
    this.StartAllPendingComets();
  }

  ClearFigures() {
    this.m_mode = EMode.None;
    this.m_allWinSymbols = [];

    this.StopComets();
    this.RemoveFigures();
  }

  private AdjustSymbolViewSet(playFromLoop: boolean) {
    if (!this.m_elementsList.IsLoaded()) return;

    switch (this.m_mode) {
      case EMode.Symbols:
        this.StopComets();
        this.CreateWinFigures(playFromLoop);
        tweeny.stop_and_finish(this.m_animWait);
        tweeny.start(this.m_animWait, 'WinFiguresView:Wait');
        break;
      case EMode.HoldAndSpinHeld:
        this.StopComets();
        this.CreateHoldAndSpinHeldFigures();
        break;
      case EMode.Comets:
        this.CreateComets();
        if (this.m_cometActions.length !== 0) {
          this.RuntimeGet(IAudioApi).Play(SoundCometAllSilenceId);
          this.StartNextComet();
        }
        break;
      case EMode.None: // fallthrough
      default: break;
    }
  }

  private RemoveFigures() {
    for (const slot of this.m_winFigures) {
      slot.visual.Clear();
    }
    this.m_winFigures = [];

    this.m_elementsList.Remove(this.m_cometIds);
    this.m_cometIds = [];
  }

  private CreateHoldAndSpinHeldFigures() {
    this.RemoveFigures();

    const orderedSymbols = [...this.m_allWinSymbols];
    orderedSymbols.sort((lhs, rhs) => {
      if (lhs.coord.reelId !== rhs.coord.reelId) {
        return lhs.coord.reelId - rhs.coord.reelId;
      }
      if (lhs.coord.rowId !== rhs.coord.rowId) {
        return lhs.coord.rowId - rhs.coord.rowId;
      }
      return lhs.symbolId - rhs.symbolId;
    });

    for (const viewInfo of orderedSymbols) {
      const figure =
        new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      figure.SetSubScreenIdx(0);
      if (Unless(figure.CreateWinFigure(viewInfo, true))) continue;
      figure.ResumeAnimation();

      this.m_winFigures.push({ visual: figure, cell: viewInfo });
    }
  }

  private CreateWinFigures(playFromLoop: boolean, signalAnimatingDone = true) {
    this.RemoveFigures();

    const orderedSymbols = [...this.m_allWinSymbols];
    orderedSymbols.sort((lhs, rhs) => {
      if (lhs.coord.reelId !== rhs.coord.reelId) {
        return lhs.coord.reelId - rhs.coord.reelId;
      }
      if (lhs.coord.rowId !== rhs.coord.rowId) {
        return lhs.coord.rowId - rhs.coord.rowId;
      }
      return lhs.symbolId - rhs.symbolId;
    });

    for (const viewInfo of orderedSymbols) {
      const figure =
        new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      figure.SetSubScreenIdx(0);
      if (Unless(figure.CreateWinFigure(viewInfo, playFromLoop))) continue;

      this.m_winFigures.push({ visual: figure, cell: viewInfo });
    }

    tweeny.stop(this.m_animWait);
    if (signalAnimatingDone) {
      this.m_animWait = tweeny.delay(1000);
      this.m_animWait.on_end.connect(() => {
        this.m_events.animatingDone.Post();
      });
    }
  }

  private CreateComets() {
    this.StopComets();
    this.RemoveFigures();
    this.CreateWinFigures(false, false);

    const subScreens = this.m_config.subScreensConfig;
    const winFigures = this.m_config.winFiguresConfig.winFigures;
    const pivot: Point = { x: 200, y: 500 };

    const orderedSymbols = [...this.m_allWinSymbols];
    orderedSymbols.sort((lhs, rhs) => {
      if (lhs.coord.reelId !== rhs.coord.reelId) {
        return lhs.coord.reelId - rhs.coord.reelId;
      }
      if (lhs.coord.rowId !== rhs.coord.rowId) {
        return lhs.coord.rowId - rhs.coord.rowId;
      }
      return lhs.symbolId - rhs.symbolId;
    });

    for (const viewInfo of orderedSymbols) {
      const it = winFigures.find(figureInfo => {
        return figureInfo.id === viewInfo.symbolId;
      });

      if (it === undefined) continue;
      if ((it.effectId ?? '') === '') continue;
      if (AssertUnless(IsValidIndex(subScreens.subScreens, 0))) continue;

      const freeSpinsComet: boolean = (it.effectValue ?? 0) > 0;
      const targetElementId = freeSpinsComet
        ? DummyCometTargetPosId
        : (this.m_cometUseCoinBar ? DummyCometTargetCoinBarId : DummyCometTargetWinBarId);
      const target = this.m_elementsList.Get(targetElementId, BaseElement).GetPosition();

      const subScreen = subScreens.subScreens[0];
      const x = subScreen.reelAreaX + subScreen.reelStepX * viewInfo.coord.reelId +
        subScreen.reelStepX / 2;
      const y = subScreen.reelAreaY + subScreen.reelStepY * viewInfo.coord.rowId +
        subScreen.reelStepY / 2;
      const pos: Point = { x, y };
      const deg = Math.atan2(x - target.x, target.y - y) * 180 / Math.PI;

      const effect = this.m_elementsList.CreatePtr(AnimElement, it.effectId!);
      effect.SetPivot({ x: pivot.x, y: pivot.y });
      effect.SetPosition({ x: pos.x - pivot.x, y: pos.y - pivot.y });
      effect.SetRotation(deg);
      effect.SetHidden(true);

      const effectId = effect.GetId();
      this.m_cometIds.push(effectId);

      const cometIndex = this.m_cometActions.length;

      const move = MoveTo(effect, { x: target.x - pivot.x, y: target.y - pivot.y }, 750);
      move.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, [effectId]);
        if (AssertIf(!IsValidIndex(this.m_cometActions, cometIndex))) return;
        this.DimWinFigureAt(this.m_cometActions[cometIndex].sourceCell);
      });
      move.on_end.connect(() => {
        this.m_elementsList.Remove(effectId);
        this.m_cometIds = this.m_cometIds.filter(id => id !== effectId);
        this.OnCometReachedTarget(!freeSpinsComet);
        ++this.m_finishedComets;

        if (!this.m_fastForwardComets) {
          this.StartNextComet();
        }

        if (this.m_finishedComets === this.m_cometActions.length) {
          this.RuntimeGet(IAudioApi).Play(SoundCometExplodeId);
          this.m_events.cometsAnimDone.Post();
        }
      });

      this.m_cometActions.push({ action: move, sourceCell: viewInfo });
    }

    if (this.m_cometActions.length === 0) {
      this.m_events.cometsAnimDone.Post();
    }
  }

  private DimWinFigureAt(info: SymbolViewInfo) {
    for (const slot of this.m_winFigures) {
      if (slot.cell.key() !== info.key()) continue;

      slot.visual.PauseAnimation();
      slot.visual.SetDimmed(true);
    }
  }

  private OnCometReachedTarget(updateWinBar: boolean) {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const endExpl = this.m_elementsList.Get(AnimCometEndExplosionId, AnimElement);
    endExpl.Stop();
    endExpl.Rewind();
    endExpl.Play();
    endExpl.SetHidden(false);

    if (Unless(updateWinBar)) return;

    this.m_cometBarDisplayedValue += this.m_cometBarPerStep;
    if (this.m_cometUseCoinBar) {
      this.RuntimeGet(ICoinsBarView).SetValueNow(this.m_cometBarDisplayedValue);
    } else {
      this.RuntimeGet(ICreditsWinBarView).SetValueNow(this.m_cometBarDisplayedValue);
    }
  }

  private StartNextComet() {
    if (this.m_nextCometToStart >= this.m_cometActions.length) return;

    const cometAction = this.m_cometActions[this.m_nextCometToStart++].action;
    tweeny.start(cometAction, 'WinFiguresView::Comets');
  }

  private StartAllPendingComets() {
    while (this.m_nextCometToStart < this.m_cometActions.length) {
      this.StartNextComet();
    }
  }

  private StopComets() {
    for (const comet of this.m_cometActions) {
      tweeny.stop(comet.action);
    }

    this.m_cometActions = [];
    this.m_nextCometToStart = 0;
    this.m_finishedComets = 0;
    this.m_fastForwardComets = false;
  }

  SetStackedFigures(_infos: SymbolViewInfos) {
  }

  PauseAnimations() {
    tweeny.pause(this.m_animWait);

    for (const slot of this.m_winFigures) {
      slot.visual.PauseAnimation();
    }

    for (const id of this.m_cometIds) {
      const anim = this.m_elementsList.TryGet(id, AnimElement);
      if (Unless(anim)) continue;

      anim!.Stop();
    }

    for (const comet of this.m_cometActions) {
      tweeny.pause(comet.action);
    }
  }

  ResumeAnimations() {
    tweeny.resume(this.m_animWait);

    for (const slot of this.m_winFigures) {
      slot.visual.ResumeAnimation();
    }

    for (const id of this.m_cometIds) {
      const anim = this.m_elementsList.TryGet(id, AnimElement);
      if (Unless(anim)) continue;

      anim!.Play();
    }

    for (const comet of this.m_cometActions) {
      tweeny.resume(comet.action);
    }
  }
}
