// Egt::Game::AlphaFamily::FlyingSymbolsVisual (BurningCrownTetraSpins10View/Visuals/FlyingSymbolsVisual.h/.cpp): a
// crown flying from its cell in one tetra sub screen to the same cell of a later one.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { MoveTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { FlyingSymbolData } from '../Views/ReelsView.data';
import { BaseVisual } from './BaseVisual';

export class FlyingSymbolsVisual extends BaseVisual {
  private m_reelIdx = 0;
  private m_startingSubScreenIdx = 0;
  private m_endSubScreenIdx = 0;
  private m_animation = new tweeny.tween_action();

  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  Clear() {
    tweeny.stop(this.m_animation);

    super.Clear();
  }

  GetIdx() {
    return this.m_reelIdx;
  }

  SetIdx(idx: number) {
    this.m_reelIdx = idx;
  }

  GetStartingSubScreen() {
    return this.m_startingSubScreenIdx;
  }

  SetStartingSubScreen(subScreenIdx: number) {
    this.m_startingSubScreenIdx = subScreenIdx;
  }

  GetEndSubScreen() {
    return this.m_endSubScreenIdx;
  }

  SetEndSubScreen(id: number) {
    this.m_endSubScreenIdx = id;
  }

  AddAnimation(movePath: [Point, Point], data: FlyingSymbolData, duration: number) {
    const element = this.m_elementsList.CreatePtr(ImageElement, data.flyingRssId);
    element.SetPosition(movePath[0]);
    element.SetAlignment(Alignment.MiddleCenter);

    this.StoreElementId(element.GetId());

    const action = MoveTo(element, movePath[1], duration, tweeny.ease.linear);

    this.m_animation = action;
  }

  SetHidden(isHidden: boolean) {
    this.m_elementsList.SetHidden(isHidden, this.GetElementIds());
  }

  StartAnimation(subScreenIdx: number) {
    if (subScreenIdx !== this.m_startingSubScreenIdx) return false;

    this.m_elementsList.SetHidden(false, this.GetElementIds());

    tweeny.start(this.m_animation);
    return true;
  }
}
