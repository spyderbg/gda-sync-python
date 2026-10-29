// Egt::Game::AlphaFamily::WinFiguresView (JokerReelsCoins10View/Views/WinFiguresView.h/.cpp): the animations of the
// reels' winning symbols, and the jokers over a stack of winning wilds, which fade in over the single wilds.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { EraseIf } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { SymbolGridCoordinates, type SymbolViewInfo, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IWinFiguresView, IWinFiguresViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { EType, WinFigureVisual } from '../Visuals/WinFiguresVisual';
import type { WinFiguresViewConfig } from './WinFiguresView.data';

const WinFiguresViewId = 'WinFiguresView';

const wildCrossFadeDuration: tweeny.duration_t = 700;

/** C++'s std::set<SymbolViewInfo>: the infos once each, ordered as its operator< orders them (symbol, reel, row). */
function SymbolViewInfoSet(infos: SymbolViewInfos) {
  const byKey = new Map<string, SymbolViewInfo>();
  for (const info of infos) byKey.set(info.key(), info);
  return [...byKey.values()].sort((a, b) => a.symbolId - b.symbolId || a.coord.reelId - b.coord.reelId || a.coord.rowId - b.coord.rowId);
}

export class WinFiguresView extends BaseView implements IWinFiguresView {
  protected readonly m_events = new IWinFiguresViewEvents();

  /** @cppType std::set<SymbolViewInfo> */
  private m_allWinSymbols: SymbolViewInfo[] = [];
  private m_stackedFigures: SymbolViewInfos = [];

  private m_config!: WinFiguresViewConfig;

  private m_winFigures: WinFigureVisual[] = [];

  private m_wildCrossFade = new tweeny.tween_action();

  constructor() {
    super(WinFiguresViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IWinFiguresView, this);
    this.RuntimeAdd(IWinFiguresView.Events, this.m_events);

    this.InitElementsList(WinFiguresViewId);

    const resources = this.RuntimeGet(IResources);
    this.m_config = resources.GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');
    // when its config's file changes, the figures shown are made again from it
    BrowserOnly(() => this.WatchConfig('WinFiguresViewConfig', () => this.ReloadConfig()));

    return true;
  }

  Deinit() {
    this.ClearFigures();
    this.DeinitElementsList();

    this.RuntimeRemove(IWinFiguresView);
    this.RuntimeRemove(IWinFiguresView.Events);

    super.Deinit();
  }

  /** Reads its config again, when its file changed, and makes the figures shown again from it (from their loops), and the
   * jokers over the stacked wilds, which fade in again.
   * @browserOnly */
  private ReloadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');
    this.RemoveWinFigures();
    if (!this.m_allWinSymbols.length) return;

    this.CreateWinFigures(this.m_allWinSymbols, true);
    this.CreateWildFigures();
    this.CreateWildCrossFade();
    tweeny.start(this.m_wildCrossFade);
  }

  // IWinFiguresView
  ShowCombinations(combinations: ReelCombinations, playFromLoop: boolean) {
    const allWinSymbols = SymbolViewInfoSet(combinations.flatMap(combination => combination.symbolViewInfos));

    if (allWinSymbols.map(info => info.key()).join('|') === this.m_allWinSymbols.map(info => info.key()).join('|')) return;

    this.RemoveWinFigures();

    this.CreateWinFigures(allWinSymbols, playFromLoop);
    this.CreateWildFigures();
    this.CreateWildCrossFade();

    this.m_allWinSymbols = allWinSymbols;

    tweeny.start(this.m_wildCrossFade);
  }

  ShowWinFigures(_infos: SymbolViewInfos) {
    this.m_events.animatingDone.Post();
  }

  SetStackedFigures(infos: SymbolViewInfos) {
    this.m_stackedFigures = infos;
  }

  ShowComets(_infos: SymbolViewInfos) {
    this.m_events.cometsAnimDone.Post();
  }

  RequestFastForwardComets() {}

  ClearFigures() {
    this.RemoveWinFigures();

    this.m_stackedFigures = [];
    this.m_allWinSymbols = [];
  }

  PauseAnimations() {
    tweeny.pause(this.m_wildCrossFade);

    for (const figure of this.m_winFigures) {
      figure.PauseAnimation();
    }
  }

  ResumeAnimations() {
    tweeny.resume(this.m_wildCrossFade);

    for (const figure of this.m_winFigures) {
      figure.ResumeAnimation();
    }
  }

  SetVisible(isVisible: boolean) {
    super.SetVisible(isVisible);
  }

  ////////////////////////////////////////////////////////////////////////////////

  private RemoveWinFigures() {
    tweeny.stop(this.m_wildCrossFade);

    for (const figure of this.m_winFigures) {
      figure.Clear();
    }

    this.m_winFigures = [];
  }

  private CreateWinFigures(winSymbols: SymbolViewInfo[], playFromLoop: boolean) {
    for (const viewInfo of winSymbols) {
      const figure = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      figure.SetSubScreenIdx(0);
      if (Unless(figure.CreateWinFigure(viewInfo, playFromLoop))) continue;

      this.m_winFigures.push(figure);
    }
  }

  private CreateWildFigures() {
    for (const viewInfo of this.m_stackedFigures) {
      // the fading in joker
      const wild = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      if (AssertUnless(wild.CreateWild(viewInfo))) continue;

      this.m_winFigures.push(wild);

      // figure's id is the figure's size
      const figureSize = viewInfo.symbolId;

      // the jokers fading out from under it
      for (let row = viewInfo.coord.rowId; row < figureSize; ++row) {
        const singleWild = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
        if (Unless(singleWild.CreateSingleWild(new SymbolGridCoordinates(viewInfo.coord.reelId, row)))) continue;

        this.m_winFigures.push(singleWild);
      }
    }
  }

  private CreateWildCrossFade() {
    tweeny.stop(this.m_wildCrossFade);

    const crossFadeActions: tweeny.tween_action[] = [];

    for (const figure of this.m_winFigures) {
      const action = figure.CreateCrossFade(wildCrossFadeDuration);
      if (Unless(action.is_valid())) continue;

      crossFadeActions.push(action);
    }

    this.m_wildCrossFade = tweeny.together(crossFadeActions);

    this.m_wildCrossFade.on_end.connect(() => {
      // the single wilds have faded out from under the jokers, they are not needed anymore
      EraseIf(this.m_winFigures, figure => {
        if (figure.GetType() !== EType.SingleWild) {
          return false;
        }

        figure.Clear();
        return true;
      });
    });
  }
}
