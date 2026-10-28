// Egt::Game::AlphaFamily::LinesVisual (NordicRushView/Visuals/LinesVisual.h/.cpp): a winning line: its
// line image (cut out under its win squares), the squares and their lights, and a darker shadow copy that blinks.

import type { RssRect } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { BaseVisual } from './BaseVisual';

export class LinesVisual extends BaseVisual {
  private m_lineIds: string[] = [];
  private m_shadowLineIds: string[] = [];
  private m_squareIds: string[] = [];
  private m_shadowSquareIds: string[] = [];
  private m_lightIds: string[] = [];
  private m_cropRects: (() => RssRect)[] = [];
  private m_shadowBlinking = new tweeny.tween_action();
  private m_shadowVisible = false;
  private m_lightsVisible = false;

  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
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

  CreateBlinking(duration: tweeny.duration_t) {
    tweeny.stop(this.m_shadowBlinking);

    const actionBlinking = tweeny.delay(duration);
    actionBlinking.on_begin.connect(() => {
      this.SetShadowVisible(false);
    });

    actionBlinking.on_end.connect(() => {
      this.SetShadowVisible(true);
    });

    const actionFullBlink = tweeny.sequence_precise([actionBlinking, tweeny.delay(duration)]);

    this.m_shadowBlinking = tweeny.repeat_precise(actionFullBlink);
  }

  EnableBlinking(enable: boolean) {
    if (enable && this.m_shadowBlinking.is_valid()) {
      tweeny.start(this.m_shadowBlinking);
    } else {
      tweeny.stop(this.m_shadowBlinking);
    }
  }

  PauseAnimations() {
    tweeny.pause(this.m_shadowBlinking);
  }

  ResumeAnimations() {
    if (tweeny.is_paused(this.m_shadowBlinking)) {
      tweeny.resume(this.m_shadowBlinking);
    }
  }

  GetLightIds(): readonly string[] {
    return this.m_lightIds;
  }

  private SetShadowVisible(visible: boolean) {
    this.m_shadowVisible = visible;
  }
}

EgtALogCategoryClass(LinesVisual, 'LinesVisual');
