// Egt::Game::AlphaFamily::WinFiguresView (NordicRushView/Views/WinFiguresView.h/.cpp): the animations of the reels'
// winning symbols, and the hold and spin round's comets: one per coin with an effect, flying from its cell to
// dummy_comet_target_pos one after another (all at once when fast-forwarded).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources, type Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { MoveTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import type { SymbolViewInfo, SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IWinFiguresView, IWinFiguresViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { WinFigureVisual } from '../Visuals/WinFiguresVisual';
import type { WinFiguresViewConfig } from './WinFiguresView.data';

const WinFiguresViewId = 'WinFiguresView';

const SoundCometSilenceId = 'COMMET_SILENCE_SOUND';
const SoundCometAllSilenceId = 'COMMET_SILENCE_ALL_SOUND';
const SoundCometExplodeId = 'COMMET_EXPLODE_SOUND';
const DummyCometTargetPosId = 'dummy_comet_target_pos';

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
  Comets,
}

type CometAction = tweeny.tween_action;

export class WinFiguresView extends BaseView implements IWinFiguresView {
  protected readonly m_events = new IWinFiguresViewEvents();

  private m_mode = EMode.None;
  /** @cppType std::set<SymbolViewInfo> */
  private m_allWinSymbols: SymbolViewInfo[] = [];

  private m_config!: WinFiguresViewConfig;

  private m_winFigures: WinFigureVisual[] = [];
  private m_cometIds: string[] = [];

  private m_animWait = new tweeny.tween_action();
  private m_cometActions: CometAction[] = [];
  private m_nextCometToStart = 0;
  private m_finishedComets = 0;
  private m_fastForwardComets = false;

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
    if (this.m_mode !== EMode.Symbols) return true;

    const animWait = this.m_animWait;
    this.CreateWinFigures(true);
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

  ShowComets(infos: SymbolViewInfos) {
    this.m_mode = EMode.Comets;
    this.m_allWinSymbols = [];

    this.m_allWinSymbols = SymbolViewInfoSet(infos);

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
    BaseVisual.ClearAll(this.m_winFigures);

    this.m_elementsList.Remove(this.m_cometIds);
    this.m_cometIds = [];
  }

  private CreateWinFigures(playFromLoop: boolean) {
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

      this.m_winFigures.push(figure);
    }

    this.m_animWait = tweeny.delay(1000);
    this.m_animWait.on_end.connect(() => {
      this.m_events.animatingDone.Post();
    });
  }

  private CreateComets() {
    this.StopComets();
    this.RemoveFigures();

    const subScreens = this.m_config.subScreensConfig;
    const winFigures = this.m_config.winFiguresConfig.winFigures;
    const target = this.m_elementsList.Get(DummyCometTargetPosId, BaseElement).GetPosition();
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

      const move = MoveTo(effect, { x: target.x - pivot.x, y: target.y - pivot.y }, 750);
      move.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, [effectId]);
      });
      move.on_end.connect(() => {
        this.m_elementsList.Remove(effectId);
        this.m_cometIds = this.m_cometIds.filter(id => id !== effectId);
        ++this.m_finishedComets;

        if (!this.m_fastForwardComets) {
          this.StartNextComet();
        }

        if (this.m_finishedComets === this.m_cometActions.length) {
          this.RuntimeGet(IAudioApi).Play(SoundCometExplodeId);
          this.m_events.cometsAnimDone.Post();
        }
      });

      this.m_cometActions.push(move);
    }

    if (this.m_cometActions.length === 0) {
      this.m_events.cometsAnimDone.Post();
    }
  }

  private StartNextComet() {
    if (this.m_nextCometToStart >= this.m_cometActions.length) return;

    const cometAction = this.m_cometActions[this.m_nextCometToStart++];
    tweeny.start(cometAction, 'WinFiguresView::Comets');
  }

  private StartAllPendingComets() {
    while (this.m_nextCometToStart < this.m_cometActions.length) {
      this.StartNextComet();
    }
  }

  private StopComets() {
    for (const comet of this.m_cometActions) {
      tweeny.stop(comet);
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

    for (const figure of this.m_winFigures) {
      figure.PauseAnimation();
    }

    for (const id of this.m_cometIds) {
      const anim = this.m_elementsList.TryGet(id, AnimElement);
      if (Unless(anim)) continue;

      anim!.Stop();
    }

    for (const comet of this.m_cometActions) {
      tweeny.pause(comet);
    }
  }

  ResumeAnimations() {
    tweeny.resume(this.m_animWait);

    for (const figure of this.m_winFigures) {
      figure.ResumeAnimation();
    }

    for (const id of this.m_cometIds) {
      const anim = this.m_elementsList.TryGet(id, AnimElement);
      if (Unless(anim)) continue;

      anim!.Play();
    }

    for (const comet of this.m_cometActions) {
      tweeny.resume(comet);
    }
  }
}
