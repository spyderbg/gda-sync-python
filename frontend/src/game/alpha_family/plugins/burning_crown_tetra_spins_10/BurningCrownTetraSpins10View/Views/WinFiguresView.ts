// Egt::Game::AlphaFamily::WinFiguresView (BurningCrownTetraSpins10View/Views/WinFiguresView.h/.cpp): the animations of
// the main reels' winning symbols.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IResources } from '../../../../../engine/Game/RuntimeExport/IResources';
import * as tweeny from '../../../../../hat_libs/tweeny/tweeny';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import { SymbolGridCoordinates, type SymbolViewInfo, type SymbolViewInfos } from '../../../../libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '../../../../libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IWinFiguresView, IWinFiguresViewEvents } from '../../../../libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { EWinFigureType, WinFigureVisual } from '../Visuals/WinFiguresVisual';
import type { WinFiguresVisualConfig } from './ReelsView.data';
import type { ReelSubScreensConfig } from './ReelSubScreen.data';

const WinFiguresViewId = 'WinFiguresView';

const wildCrossFadeDuration = 700;

interface WinFiguresViewConfig {
  subScreensConfig: ReelSubScreensConfig;
  winFiguresConfig: WinFiguresVisualConfig;
}

export class WinFiguresView extends BaseView implements IWinFiguresView {
  private readonly m_events = new IWinFiguresViewEvents();
  private m_config!: WinFiguresViewConfig;
  private m_winFigures: WinFigureVisual[] = [];
  private m_stackedFigures: SymbolViewInfos = [];
  private m_allWinSymbols = '';
  private m_wildCrossFade = new tweeny.tween_action();

  constructor() {
    super(WinFiguresViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IWinFiguresView, this);
    this.RuntimeAdd(IWinFiguresView.Events, this.m_events);
    this.InitElementsList(WinFiguresViewId);
    this.m_config = this.RuntimeGet(IResources).GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');
    return true;
  }

  Deinit() {
    this.ClearFigures();
    this.DeinitElementsList();
    this.RuntimeRemove(IWinFiguresView);
    this.RuntimeRemove(IWinFiguresView.Events);
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    BaseVisual.DrawAll(this.m_winFigures, drawList);
  }

  ShowCombinations(combinations: ReelCombinations, playFromLoop: boolean) {
    const allWinSymbols = new Map<string, SymbolViewInfo>();
    for (const combination of combinations) for (const info of combination.symbolViewInfos) allWinSymbols.set(info.key(), info);
    const key = [...allWinSymbols.keys()].sort().join('|');
    if (key === this.m_allWinSymbols) return;
    this.RemoveWinFigures();
    this.CreateWinFigures([...allWinSymbols.values()], playFromLoop);
    this.CreateWildFigures();
    this.CreateWildCrossFade();
    this.m_allWinSymbols = key;

    tweeny.start(this.m_wildCrossFade);
  }

  ShowWinFigures(_infos: SymbolViewInfos) {
    this.m_events.animatingDone.Post();
  }

  ShowComets(_infos: SymbolViewInfos) {
    this.m_events.cometsAnimDone.Post();
  }

  RequestFastForwardComets() {}

  ClearFigures() {
    this.RemoveWinFigures();
    this.m_stackedFigures = [];
    this.m_allWinSymbols = '';
  }

  SetStackedFigures(infos: SymbolViewInfos) {
    this.m_stackedFigures = infos;
  }

  PauseAnimations() {
    tweeny.pause(this.m_wildCrossFade);

    for (const figure of this.m_winFigures) figure.PauseAnimation();
  }

  ResumeAnimations() {
    tweeny.resume(this.m_wildCrossFade);

    for (const figure of this.m_winFigures) figure.ResumeAnimation();
  }

  private RemoveWinFigures() {
    tweeny.stop(this.m_wildCrossFade);

    BaseVisual.ClearAll(this.m_winFigures);
  }

  private CreateWinFigures(winSymbols: SymbolViewInfo[], playFromLoop: boolean) {
    for (const viewInfo of winSymbols) {
      const figure = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      figure.SetSubScreenIdx(0);
      if (figure.CreateWinFigure(viewInfo, playFromLoop)) this.m_winFigures.push(figure);
    }
  }

  /** The stacked wilds: BurningCrownTetraSpins10 has none (its stack figure config is empty). */
  private CreateWildFigures() {
    for (const viewInfo of this.m_stackedFigures) {
      // the fading in joker
      const wild = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      if (!wild.CreateWild(viewInfo)) continue;

      this.m_winFigures.push(wild);

      // figure's id is the figure's size
      const figureSize = viewInfo.symbolId;

      // the jokers fading out from under it
      for (let row = viewInfo.coord.rowId; row < figureSize; ++row) {
        const singleWild = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
        if (!singleWild.CreateSingleWild(new SymbolGridCoordinates(viewInfo.coord.reelId, row))) continue;

        this.m_winFigures.push(singleWild);
      }
    }
  }

  private CreateWildCrossFade() {
    tweeny.stop(this.m_wildCrossFade);

    const crossFadeActions: tweeny.tween_action[] = [];

    for (const figure of this.m_winFigures) {
      const action = figure.CreateCrossFade(wildCrossFadeDuration);
      if (!action.is_valid()) continue;

      crossFadeActions.push(action);
    }

    this.m_wildCrossFade = tweeny.together(crossFadeActions);

    this.m_wildCrossFade.on_end.connect(() => {
      // the single wilds have faded out from under the jokers, they are not needed anymore
      this.m_winFigures = this.m_winFigures.filter(figure => {
        if (figure.GetType() !== EWinFigureType.SingleWild) return true;

        figure.Clear();
        return false;
      });
    });
  }
}
