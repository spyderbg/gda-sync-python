// Egt::Game::AlphaFamily::DimSubScreenVisual (BurningCrownTetraSpins10View/Visuals/DimSubScreenVisual.h/.cpp): darkens
// a tetra sub screen once it has been presented.

import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import type { DimSubScreenVisualConfig } from '../Views/ReelsView.data';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';

const DimKey = 'dim';

export class DimSubScreenVisual extends BaseVisual {
  private m_elementId = '';

  constructor(elementsList: ElementsList, private readonly m_subScreensConfig: ReelSubScreensConfig,
    private readonly m_dimSubScreenConfig: DimSubScreenVisualConfig) {
    super(elementsList);
    this.CreateImageElement();
  }

  Draw(drawList: DrawList) {
    this.m_elementsList.TryGet(this.m_elementId)?.Draw(drawList);
  }

  SetSubScreenIdx(subScreenIdx: number) {
    super.SetSubScreenIdx(subScreenIdx);
    const subScreen = this.m_subScreensConfig.subScreens[subScreenIdx];
    if (!subScreen) return;
    const offset = this.m_dimSubScreenConfig.dimImageOffset ?? { x: 0, y: 0 };
    this.m_elementsList.TryGet(this.m_elementId)?.SetPosition({ x: subScreen.reelAreaX + offset.x, y: subScreen.reelAreaY + offset.y });
    this.SetDimmed(false);
  }

  Clear() {
    this.SetDimmed(false);
  }

  SetDimmed(isDimmed: boolean) {
    this.m_elementsList.TryGet(this.m_elementId)?.SetHidden(!isDimmed);
  }

  /** Makes its image again from its view's config, changed while the game plays, dimmed as it was.
   * @browserOnly */
  ReloadConfig() {
    const isDimmed = this.m_elementsList.TryGet(this.m_elementId)?.GetHidden() === false;
    this.RemoveElementId(this.m_elementId);
    this.m_elementId = '';
    this.CreateImageElement();
    this.SetSubScreenIdx(this.GetSubScreenIdx());
    this.SetDimmed(isDimmed);
  }

  private CreateImageElement() {
    const rssKey = this.m_dimSubScreenConfig.dimImageRssKeys?.[DimKey];
    if (!rssKey) return;
    const element = this.m_elementsList.Create(ImageElement, rssKey).SetAlignment(Alignment.TopLeft);
    element.SetHidden(true);
    this.m_elementId = element.GetId();
    this.StoreElementId(this.m_elementId);
  }
}

EgtALogCategoryClass(DimSubScreenVisual, 'DimSubScreenVisual');
