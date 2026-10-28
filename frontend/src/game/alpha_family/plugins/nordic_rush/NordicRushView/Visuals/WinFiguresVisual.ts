// Egt::Game::AlphaFamily::WinFigureVisual (NordicRushView/Visuals/WinFiguresVisual.h/.cpp): the win animation of
// one winning symbol, centred on its reel cell, with its symbol's overlay image and text above it.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { SymbolGridCoordinates, SymbolViewInfo } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';
import type { WinFiguresVisualConfig } from './WinFiguresVisual.data';

// A single win figure over one reel cell - the animated symbol of a winning combination together
// with the overlay image and text of its symbol. WinFiguresView keeps an array of them.
export class WinFigureVisual extends BaseVisual {
  private m_animId = '';

  constructor(
    elementsList: ElementsList,
    private readonly m_subScreensConfig: ReelSubScreensConfig,
    private readonly m_winFiguresVisualConfig: WinFiguresVisualConfig,
  ) {
    super(elementsList);
  }

  ////////////////////////////////////////////////////////////////////////////////

  // BaseVisual
  Clear() {
    super.Clear();

    this.m_animId = '';
  }

  // WinFigureVisual
  CreateWinFigure(viewInfo: SymbolViewInfo, playFromLoop: boolean) {
    const winFigures = this.m_winFiguresVisualConfig.winFigures;
    const it = winFigures.find(figure => {
      return figure.id === viewInfo.symbolId;
    });
    if (it === undefined) return false;

    if (AssertUnless(IsValidIndex(this.m_subScreensConfig.subScreens, this.GetSubScreenIdx()))) return false;

    this.Clear();

    const position = this.GetCellCenter(viewInfo.coord);

    const element = this.m_elementsList.Create(AnimElement, it.rssId);
    element.SetAlignment(Alignment.MiddleCenter).SetPosition(position);

    if (playFromLoop) {
      element.PlayFromLoopFrame();
      element.Stop();
    }

    this.m_animId = element.GetId();
    this.StoreElementId(this.m_animId);

    if ((it.overlayImage?.rssId ?? '') !== '') {
      const overlayImage =
        this.m_elementsList.Create(ImageElement, it.overlayImage!.rssId)
          .SetAlignment(Alignment.MiddleCenter)
          .SetPosition({ x: position.x + it.overlayImage!.ox, y: position.y + it.overlayImage!.oy });

      this.StoreElementId(overlayImage.GetId());
    }

    if ((it.overlayText?.text ?? '') !== '') {
      const overlayText =
        this.m_elementsList.Create(TextElement)
          .SetText(it.overlayText!.text)
          .SetStyleId(it.overlayText!.styleId)
          .SetAlignment(Alignment.MiddleCenter)
          .SetPosition({ x: position.x + it.overlayText!.ox, y: position.y + it.overlayText!.oy });

      this.StoreElementId(overlayText.GetId());
    }

    return true;
  }

  PauseAnimation() {
    if (this.m_animId === '') return;

    const anim = this.m_elementsList.TryGet(this.m_animId, AnimElement);
    if (Unless(anim)) return;

    anim!.Stop();
  }

  ResumeAnimation() {
    if (this.m_animId === '') return;

    const anim = this.m_elementsList.TryGet(this.m_animId, AnimElement);
    if (Unless(anim)) return;

    anim!.Play();
  }

  ////////////////////////////////////////////////////////////////////////////////

  private GetCellPosition(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];

    return {
      x: subScreen.reelAreaX + subScreen.reelStepX * coord.reelId,
      y: subScreen.reelAreaY + subScreen.reelStepY * coord.rowId,
    };
  }

  private GetCellCenter(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];
    const position = this.GetCellPosition(coord);

    return {
      x: position.x + subScreen.symbolWidth / 2.0,
      y: position.y + subScreen.symbolHeight / 2.0,
    };
  }
}

EgtALogCategoryClass(WinFigureVisual, 'WinFigureVisual');
