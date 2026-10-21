// Egt::Game::AlphaFamily::WinValueVisual (BurningCrownTetraSpins10View/Visuals/WinValueVisual.h/.cpp): a tetra sub
// screen's win, on the plate the view's elements place over the screen.

import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { BaseVisual } from './BaseVisual';

const ImageIds = [0, 1, 2, 3].map(i => `image_tetra_screen_win_value_${i}`);
const TextIds = [0, 1, 2, 3].map(i => `text_tetra_screen_win_value_${i}`);

export class WinValueVisual extends BaseVisual {
  private m_hidden = true;

  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible() || !this.m_elementsList.IsLoaded() || this.m_hidden) return;
    const subScreenIdx = this.GetSubScreenIdx();
    for (const id of [ImageIds[subScreenIdx], TextIds[subScreenIdx]]) {
      const element = this.m_elementsList.TryGet(id);
      if (!element) continue;
      element.SetHidden(false);
      element.Draw(drawList);
      element.SetHidden(true);
    }
  }

  Clear() {
    this.SetHidden(true);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    if (!visible) this.SetHidden(true);
  }

  SetWinValue(credits: number) {
    if (!this.m_elementsList.IsLoaded()) return;
    const visible = credits > 0;
    const text = this.m_elementsList.TryGet(TextIds[this.GetSubScreenIdx()], TextElement);
    if (visible && text) text.SetText(this.m_elementsList.RuntimeGetConst(ILocalization).FormatCurrency(credits));
    this.SetHidden(!visible);
  }

  private SetHidden(hidden: boolean) {
    this.m_hidden = hidden;
  }
}
