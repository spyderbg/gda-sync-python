// Egt::Game::AlphaFamily::LinesVisual (BurningCrownTetraSpins10View/Visuals/LinesVisual.h/.cpp): a winning line: its
// line image (cut out under its win squares), the squares and their lights, and a darker shadow copy that blinks.

import type { RssRect } from '../../../../../engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '../../../../../engine/GameVideoCtrl/ViewElements/ElementsList';
import { BaseVisual } from './BaseVisual';

export class LinesVisual extends BaseVisual {
  private m_lineIds: string[] = [];
  private m_shadowLineIds: string[] = [];
  private m_squareIds: string[] = [];
  private m_shadowSquareIds: string[] = [];
  private m_lightIds: string[] = [];
  private m_cropRects: (() => RssRect)[] = [];
  private m_shadowVisible = false;
  private m_lightsVisible = false;
  private m_blinkInterval = 0;
  private m_blinking = false;
  private m_blinkStart = 0;
  private m_paused = false;

  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    if (this.m_blinking && !this.m_paused && this.m_blinkInterval > 0) {
      // the shadow shows in the second half of each blink
      this.m_shadowVisible = Math.floor((performance.now() - this.m_blinkStart) / this.m_blinkInterval) % 2 === 1;
    }
    const cropRects = this.m_cropRects.map(rect => rect());
    const draw = (lineIds: string[], squareIds: string[]) => {
      for (const lineId of lineIds) {
        drawList.push_crop(cropRects);
        this.m_elementsList.TryGet(lineId)?.Draw(drawList);
        drawList.pop_crop();
      }
      for (const squareId of squareIds) this.m_elementsList.TryGet(squareId)?.Draw(drawList);
    };
    if (this.m_shadowVisible) draw(this.m_shadowLineIds, this.m_shadowSquareIds);
    else draw(this.m_lineIds, this.m_squareIds);
    if (this.m_lightsVisible) for (const lightId of this.m_lightIds) this.m_elementsList.TryGet(lightId)?.Draw(drawList);
  }

  Clear() {
    super.Clear();
    this.EnableBlinking(false);
    for (const ids of [this.m_lineIds, this.m_shadowLineIds, this.m_squareIds, this.m_shadowSquareIds, this.m_lightIds]) this.m_elementsList.Remove(ids);
    this.m_lineIds = [];
    this.m_shadowLineIds = [];
    this.m_squareIds = [];
    this.m_shadowSquareIds = [];
    this.m_lightIds = [];
    this.m_cropRects = [];
    this.m_shadowVisible = false;
    this.m_lightsVisible = false;
  }

  AddLineId(elementId: string) {
    this.m_lineIds.push(elementId);
  }

  /** A win square, and the area it cuts out of the line (computed as it is drawn, once its image is loaded). */
  AddSquareId(elementId: string, bounds: () => RssRect, _isFirst: boolean) {
    this.m_squareIds.push(elementId);
    this.m_cropRects.push(bounds);
  }

  AddLightId(elementId: string) {
    this.m_lightIds.push(elementId);
  }

  AddShadowSquareId(elementId: string) {
    this.m_shadowSquareIds.push(elementId);
  }

  AddShadowLineId(elementId: string) {
    this.m_shadowLineIds.push(elementId);
  }

  SetLightsVisibility(isVisible: boolean) {
    this.m_lightsVisible = isVisible;
  }

  CreateBlinking(duration: number) {
    this.m_blinkInterval = duration;
  }

  EnableBlinking(enable: boolean) {
    this.m_blinking = enable && this.m_blinkInterval > 0;
    this.m_blinkStart = performance.now();
    if (!this.m_blinking) this.m_shadowVisible = false;
  }

  PauseAnimations() {
    this.m_paused = true;
  }

  ResumeAnimations() {
    this.m_paused = false;
  }

  GetLightIds(): readonly string[] {
    return this.m_lightIds;
  }
}
