// Egt::Game::AlphaFamily::FlyingSymbolsVisual (BurningCrownTetraSpins10View/Visuals/FlyingSymbolsVisual.h/.cpp): a
// crown flying from its cell in one tetra sub screen to the same cell of a later one.

import type { Point } from '../../../../../engine/Game/RuntimeExport/IResources';
import { Alignment } from '../../../../../engine/GameVideoCtrl/ViewElements/BaseElement';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '../../../../../engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '../../../../../engine/GameVideoCtrl/ViewElements/ImageElement';
import type { FlyingSymbolData } from '../Views/ReelsView.data';
import { BaseVisual } from './BaseVisual';

export class FlyingSymbolsVisual extends BaseVisual {
  private m_reelIdx = 0;
  private m_startingSubScreenIdx = 0;
  private m_endSubScreenIdx = 0;
  private m_path: [Point, Point] | null = null;
  private m_duration = 0;
  private m_start: number | null = null;
  private m_elementId = '';

  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  Clear() {
    this.m_start = null;
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
    const element = this.m_elementsList.Create(ImageElement, data.flyingRssId).SetPosition(movePath[0]).SetAlignment(Alignment.MiddleCenter);
    element.SetHidden(true);
    this.m_elementId = element.GetId();
    this.StoreElementId(this.m_elementId);
    this.m_path = movePath;
    this.m_duration = duration;
  }

  StartAnimation(subScreenIdx: number) {
    if (subScreenIdx !== this.m_startingSubScreenIdx) return false;
    this.m_start = performance.now();
    this.SetVisible(true);
    return true;
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible() || !this.m_path) return;
    const element = this.m_elementsList.TryGet(this.m_elementId);
    if (!element) return;
    const t = this.m_start === null ? 0 : Math.min(1, (performance.now() - this.m_start) / Math.max(this.m_duration, 1));
    const [from, to] = this.m_path;
    element.SetPosition({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    element.Draw(drawList);
  }
}
