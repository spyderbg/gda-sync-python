// Egt::Game::AlphaFamily::WinFigureVisual (BurningHotCoinsView/Visuals/WinFiguresVisual.h/.cpp): the win animation of
// one winning symbol, at its reel cell's top-left.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { SymbolGridCoordinates, SymbolViewInfo } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';
import type { WinFiguresVisualConfig } from './WinFiguresVisual.data';

export class WinFigureVisual extends BaseVisual {
  constructor(
    elementsList: ElementsList,
    private readonly m_subScreensConfig: ReelSubScreensConfig,
    private readonly m_winFiguresVisualConfig: WinFiguresVisualConfig,
  ) {
    super(elementsList);
  }

  ////////////////////////////////////////////////////////////////////////////////

  // WinFigureVisual
  CreateWinFigure(viewInfo: SymbolViewInfo, playFromLoop: boolean) {
    if (!(viewInfo.symbolId in this.m_winFiguresVisualConfig.winFiguresRssKeys)) return false;
    const rssKey = this.m_winFiguresVisualConfig.winFiguresRssKeys[viewInfo.symbolId];

    if (AssertUnless(IsValidIndex(this.m_subScreensConfig.subScreens, this.GetSubScreenIdx()))) return false;

    // the figure's art is the size of a reel cell and is placed at the cell's top-left
    const element = this.m_elementsList.Create(AnimElement, rssKey);
    element.SetPosition(this.GetCellPosition(viewInfo.coord));

    if (playFromLoop) {
      element.PlayFromLoopFrame();
      element.Stop();
    }

    super.Clear();
    this.StoreElementId(element.GetId());

    return true;
  }

  PauseAnimation() {
    if (Unless(this.HasStoredElementId())) return;

    const element = this.m_elementsList.TryGet([...this.GetElementIds()][0], AnimElement);
    if (Unless(element)) return;

    element!.Stop();
  }

  ResumeAnimation() {
    if (Unless(this.HasStoredElementId())) return;

    const element = this.m_elementsList.TryGet([...this.GetElementIds()][0], AnimElement);
    if (Unless(element)) return;

    element!.Play();
  }

  ////////////////////////////////////////////////////////////////////////////////

  private GetCellPosition(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];

    return {
      x: subScreen.reelAreaX + subScreen.reelStepX * coord.reelId,
      y: subScreen.reelAreaY + subScreen.reelStepY * coord.rowId,
    };
  }
}

EgtALogCategoryClass(WinFigureVisual, 'WinFigureVisual');
