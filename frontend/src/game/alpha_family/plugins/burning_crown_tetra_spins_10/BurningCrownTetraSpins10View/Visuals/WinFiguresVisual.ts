// Egt::Game::AlphaFamily::WinFigureVisual (BurningCrownTetraSpins10View/Visuals/WinFiguresVisual.h/.cpp): the
// animation of a winning symbol over its cell.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { Alignment, BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { FadeIn, FadeOut } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { SymbolGridCoordinates, SymbolViewInfo } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { WinFiguresVisualConfig } from '../Views/ReelsView.data';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';

export enum EWinFigureType {
  None,
  WinFigure,
  Wild,
  SingleWild,
}

export class WinFigureVisual extends BaseVisual {
  private m_type = EWinFigureType.None;

  constructor(elementsList: ElementsList, private readonly m_subScreensConfig: ReelSubScreensConfig,
    private readonly m_config: WinFiguresVisualConfig) {
    super(elementsList);
  }

  GetType() {
    return this.m_type;
  }

  private get scale() {
    return this.m_config.figureScale ?? { x: 1, y: 1 };
  }

  CreateWinFigure(viewInfo: SymbolViewInfo, playFromLoop: boolean) {
    const key = this.m_config.winFiguresRssKeys?.[viewInfo.symbolId];
    if (!key) return false;
    const element = this.m_elementsList.Create(AnimElement, key);
    element.SetPosition(this.GetCellCenter(viewInfo.coord)).SetScale(this.scale).SetAlignment(Alignment.MiddleCenter);
    element.Rewind();
    if (playFromLoop) {
      element.PlayFromLoopFrame();
      element.Stop();
    }
    void element.Load();
    this.m_type = EWinFigureType.WinFigure;
    super.Clear();
    this.StoreElementId(element.GetId());
    this.SetVisible(true);
    return true;
  }

  CreateWild(viewInfo: SymbolViewInfo) {
    // the symbol id of a stacked figure is the size of the stack, which picks the wild anim
    const key = this.m_config.wildFiguresRssKeys?.[viewInfo.symbolId];
    if (!key) return false;
    const cell = this.GetCellPosition(viewInfo.coord);
    const element = this.m_elementsList.Create(AnimElement, key).SetPosition({
      x: cell.x - (this.m_config.wildSymbolAnimOffsetX ?? 0) * this.scale.x, y: cell.y - (this.m_config.wildSymbolAnimOffsetY ?? 0) * this.scale.y,
    }).SetScale(this.scale).SetHidden(false);
    this.m_type = EWinFigureType.Wild;
    super.Clear();
    this.StoreElementId(element.GetId());
    this.SetVisible(true);
    return true;
  }

  CreateSingleWild(coord: SymbolGridCoordinates) {
    if (!this.m_config.singleWildFigureRssKey) return false;
    const element = this.m_elementsList.Create(ImageElement, this.m_config.singleWildFigureRssKey)
      .SetPosition(this.GetCellCenter(coord)).SetScale(this.scale).SetHidden(false).SetAlignment(Alignment.MiddleCenter);
    this.m_type = EWinFigureType.SingleWild;
    super.Clear();
    this.StoreElementId(element.GetId());
    this.SetVisible(true);
    return true;
  }

  CreateCrossFade(duration: tweeny.duration_t) {
    const noAction = new tweeny.tween_action();
    if (!this.HasStoredElementId()) return noAction;

    const element = this.m_elementsList.Find(this.FirstElementId(), BaseElement);
    if (!element) return noAction;

    switch (this.m_type) {
      case EWinFigureType.Wild: {
        const action = FadeIn(element, duration, tweeny.ease.linear);

        action.on_begin.connect(() => {
          this.OnCrossFadeBegin();
        });
        action.on_end.connect(() => {
          this.OnCrossFadeEnd();
        });

        return action;
      }

      case EWinFigureType.SingleWild:
        return FadeOut(element, duration, tweeny.ease.linear);

      default:
        return noAction;
    }
  }

  /** *GetElementIds().begin() */
  private FirstElementId() {
    for (const id of this.GetElementIds()) return id;
    return '';
  }

  private Element() {
    for (const id of this.GetElementIds()) return this.m_elementsList.TryGet(id, AnimElement);
    return null;
  }

  PauseAnimation() {
    this.Element()?.Stop();
  }

  ResumeAnimation() {
    this.Element()?.Play();
  }

  private GetCellPosition(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];
    return { x: subScreen.reelAreaX + subScreen.reelStepX * coord.reelId, y: subScreen.reelAreaY + subScreen.reelStepY * coord.rowId };
  }

  private GetCellCenter(coord: SymbolGridCoordinates): Point {
    const subScreen = this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];
    const position = this.GetCellPosition(coord);
    return { x: position.x + subScreen.reelStepX / 2, y: position.y + subScreen.reelStepY / 2 };
  }

  private OnCrossFadeBegin() {
    const element = this.Element();
    if (!element) return;

    element.SetHidden(false);
    element.Rewind();
    element.Stop();
  }

  private OnCrossFadeEnd() {
    const element = this.Element();
    if (!element) return;

    element.Rewind();
    element.Play();
  }
}

EgtALogCategoryClass(WinFigureVisual, 'WinFigureVisual');
