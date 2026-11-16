// Egt::Game::AlphaFamily::FlyingSymbolsVisual (BurningCrownTetraSpins10View/Visuals/FlyingSymbolsVisual.h/.cpp): a
// crown flying from its cell in one tetra sub screen to the same cell of a later one.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { MoveTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { FlyingSymbolData } from '../Views/ReelsView.data';
import { BaseVisual } from './BaseVisual';

export class FlyingSymbolsVisual extends BaseVisual {
  private m_reelIdx = 0;
  private m_startingSubScreenIdx = 0;
  private m_endSubScreenIdx = 0;

  private m_flyingElementId = '';
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
    // the crown keeps cycling after it lands, until TetraRoundView clears it on its reel's stop
    const flying = this.m_elementsList.CreatePtr(AnimElement, data.flyingRssId);
    flying.SetPosition(movePath[0]).SetAlignment(Alignment.MiddleCenter).SetHidden(true);

    this.m_flyingElementId = flying.GetId();
    this.StoreElementId(this.m_flyingElementId);

    this.m_animation = MoveTo(flying, movePath[1], duration, tweeny.ease.linear);
  }

  SetHidden(isHidden: boolean) {
    this.m_elementsList.SetHidden(isHidden, this.GetElementIds());
  }

  StartAnimation(subScreenIdx: number) {
    if (subScreenIdx !== this.m_startingSubScreenIdx) return false;

    const flying = this.m_elementsList.TryGet(this.m_flyingElementId, AnimElement);
    if (flying) {
      flying.SetHidden(false);
      flying.Play();
    }

    tweeny.start(this.m_animation);
    return true;
  }
}
