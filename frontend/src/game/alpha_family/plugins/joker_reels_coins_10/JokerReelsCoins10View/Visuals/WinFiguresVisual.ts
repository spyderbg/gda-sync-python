// Egt::Game::AlphaFamily::WinFigureVisual (JokerReelsCoins10View/Visuals/WinFiguresVisual.h/.cpp): a single win figure
// over one reel cell: the animated symbol of a winning combination, one of the wilds that fades in over a stacked
// symbol, or one of the single wilds that fades out from under it. WinFiguresView keeps an array of them.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { FadeIn, FadeOut } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { SymbolGridCoordinates, SymbolViewInfo } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';
import type { WinFiguresVisualConfig } from './WinFiguresVisual.data';

export enum EType {
  WinFigure,
  Wild,
  SingleWild,
}

export class WinFigureVisual extends BaseVisual {
  private m_type = EType.WinFigure;

  constructor(
    elementsList: ElementsList,
    private readonly m_subScreensConfig: ReelSubScreensConfig,
    private readonly m_winFiguresVisualConfig: WinFiguresVisualConfig,
  ) {
    super(elementsList);
  }

  ////////////////////////////////////////////////////////////////////////////////

  // WinFigureVisual
  GetType() {
    return this.m_type;
  }

  CreateWinFigure(viewInfo: SymbolViewInfo, playFromLoop: boolean) {
    if (!(viewInfo.symbolId in this.m_winFiguresVisualConfig.winFiguresRssKeys)) return false;
    const rssKey = this.m_winFiguresVisualConfig.winFiguresRssKeys[viewInfo.symbolId];

    const element = this.m_elementsList.Create(AnimElement, rssKey);
    element.SetPosition(this.GetCellCenter(viewInfo.coord))
      .SetScale(this.m_winFiguresVisualConfig.figureScale)
      .SetAlignment(Alignment.MiddleCenter);

    if (playFromLoop) {
      element.PlayFromLoopFrame();
      element.Stop();
    }

    this.m_type = EType.WinFigure;

    super.Clear();
    this.StoreElementId(element.GetId());

    return true;
  }

  CreateWild(viewInfo: SymbolViewInfo) {
    // the symbol id of a stacked figure is the size of the stack, which picks the wild anim
    if (!(viewInfo.symbolId in this.m_winFiguresVisualConfig.wildFiguresRssKeys)) return false;
    const rssKey = this.m_winFiguresVisualConfig.wildFiguresRssKeys[viewInfo.symbolId];

    const cell = this.GetCellPosition(viewInfo.coord);
    const x = cell.x - this.m_winFiguresVisualConfig.wildSymbolAnimOffsetX * (this.m_winFiguresVisualConfig.figureScale?.x ?? 1.0);
    const y = cell.y - this.m_winFiguresVisualConfig.wildSymbolAnimOffsetY * (this.m_winFiguresVisualConfig.figureScale?.y ?? 1.0);

    const element = this.m_elementsList.Create(AnimElement, rssKey)
      .SetPosition({ x, y })
      .SetScale(this.m_winFiguresVisualConfig.figureScale)
      .SetHidden(false);

    this.m_type = EType.Wild;

    super.Clear();
    this.StoreElementId(element.GetId());

    return true;
  }

  CreateSingleWild(coord: SymbolGridCoordinates) {
    if (!this.m_winFiguresVisualConfig.singleWildFigureRssKey) return false;

    const element = this.m_elementsList.Create(ImageElement, this.m_winFiguresVisualConfig.singleWildFigureRssKey)
      .SetPosition(this.GetCellCenter(coord))
      .SetScale(this.m_winFiguresVisualConfig.figureScale)
      .SetHidden(false)
      .SetAlignment(Alignment.MiddleCenter);

    this.m_type = EType.SingleWild;

    super.Clear();
    this.StoreElementId(element.GetId());

    return true;
  }

  // the wilds fade in while the single wilds fade out; an invalid action means this figure
  // takes no part in the cross fade
  CreateCrossFade(duration: tweeny.duration_t) {
    const noAction = new tweeny.tween_action();
    if (Unless(this.HasStoredElementId())) return noAction;

    const element = this.m_elementsList.Find([...this.GetElementIds()][0]);
    if (AssertUnless(element)) return noAction;

    switch (this.m_type) {
      case EType.Wild: {
        const action = FadeIn(element, duration, tweeny.ease.linear);

        action.on_begin.connect(() => {
          this.OnCrossFadeBegin();
        });
        action.on_end.connect(() => {
          this.OnCrossFadeEnd();
        });

        return action;
      }

      case EType.SingleWild: return FadeOut(element, duration, tweeny.ease.linear);

      case EType.WinFigure: // [[fallthrough]]
      default: return noAction;
    }
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

  private GetCellCenter(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];
    const position = this.GetCellPosition(coord);

    return {
      x: position.x + subScreen.reelStepX / 2,
      y: position.y + subScreen.reelStepY / 2,
    };
  }

  private OnCrossFadeBegin() {
    if (Unless(this.HasStoredElementId())) return;

    const element = this.m_elementsList.TryGet([...this.GetElementIds()][0], AnimElement);
    if (Unless(element)) return;

    element!.SetHidden(false);
    element!.Rewind();
    element!.Stop();
  }

  private OnCrossFadeEnd() {
    if (Unless(this.HasStoredElementId())) return;

    const element = this.m_elementsList.TryGet([...this.GetElementIds()][0], AnimElement);
    if (Unless(element)) return;

    element!.Rewind();
    element!.Play();
  }
}

EgtALogCategoryClass(WinFigureVisual, 'WinFigureVisual');
