// Egt::Game::AlphaFamily::WinFiguresView (BurningHotCoinsView/Views/WinFiguresView.h/.cpp): the animations of the
// reels' winning symbols.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { SymbolViewInfo, SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IWinFiguresView, IWinFiguresViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { WinFigureVisual } from '../Visuals/WinFiguresVisual';
import type { WinFiguresViewConfig } from './WinFiguresView.data';

const WinFiguresViewId = 'WinFiguresView';

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

  private m_config!: WinFiguresViewConfig;

  private m_winFigures: WinFigureVisual[] = [];

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

    return true;
  }

  Deinit() {
    this.ClearFigures();
    this.DeinitElementsList();

    this.RuntimeRemove(IWinFiguresView);
    this.RuntimeRemove(IWinFiguresView.Events);

    super.Deinit();
  }

  // IWinFiguresView
  ShowCombinations(combinations: ReelCombinations, playFromLoop: boolean) {
    const allWinSymbols = SymbolViewInfoSet(combinations.flatMap(combination => combination.symbolViewInfos));

    if (allWinSymbols.map(info => info.key()).join('|') === this.m_allWinSymbols.map(info => info.key()).join('|')) return;

    this.RemoveWinFigures();

    this.CreateWinFigures(allWinSymbols, playFromLoop);

    this.m_allWinSymbols = allWinSymbols;
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

    this.m_allWinSymbols = [];
  }

  PauseAnimations() {
    for (const figure of this.m_winFigures) {
      figure.PauseAnimation();
    }
  }

  ResumeAnimations() {
    for (const figure of this.m_winFigures) {
      figure.ResumeAnimation();
    }
  }

  SetStackedFigures(_infos: SymbolViewInfos) {}

  ////////////////////////////////////////////////////////////////////////////////

  private RemoveWinFigures() {
    BaseVisual.ClearAll(this.m_winFigures);
  }

  private CreateWinFigures(winSymbols: SymbolViewInfo[], playFromLoop: boolean) {
    for (const viewInfo of winSymbols) {
      const figure = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      figure.SetSubScreenIdx(0);
      if (Unless(figure.CreateWinFigure(viewInfo, playFromLoop))) continue;

      this.m_winFigures.push(figure);
    }
  }
}
