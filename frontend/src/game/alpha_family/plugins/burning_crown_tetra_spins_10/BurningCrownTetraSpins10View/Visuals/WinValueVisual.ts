// Egt::Game::AlphaFamily::WinValueVisual (BurningCrownTetraSpins10View/Visuals/WinValueVisual.h/.cpp): a tetra sub
// screen's win, on the plate the view's elements place over the screen. Its win hides and shows the elements; hiding the
// visual (or its view) leaves them as they are, so the win shows again with it.

import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf, Unless } from '@game/engine/GameCore/Common/Defensive';
import type { int, int64_t } from '@game/engine/GameCore/Common/Types';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { BaseVisual } from './BaseVisual';

const ImageTetraScreenWinValue0Id = 'image_tetra_screen_win_value_0';
const TextTetraScreenWinValue0Id = 'text_tetra_screen_win_value_0';

const ImageTetraScreenWinValue1Id = 'image_tetra_screen_win_value_1';
const TextTetraScreenWinValue1Id = 'text_tetra_screen_win_value_1';

const ImageTetraScreenWinValue2Id = 'image_tetra_screen_win_value_2';
const TextTetraScreenWinValue2Id = 'text_tetra_screen_win_value_2';

const ImageTetraScreenWinValue3Id = 'image_tetra_screen_win_value_3';
const TextTetraScreenWinValue3Id = 'text_tetra_screen_win_value_3';

const ImageIds = [ImageTetraScreenWinValue0Id, ImageTetraScreenWinValue1Id, ImageTetraScreenWinValue2Id, ImageTetraScreenWinValue3Id];

const TextIds = [TextTetraScreenWinValue0Id, TextTetraScreenWinValue1Id, TextTetraScreenWinValue2Id, TextTetraScreenWinValue3Id];

export class WinValueVisual extends BaseVisual {
  constructor(elementsList: ElementsList) {
    super(elementsList);
  }

  ////////////////////////////////////////////////////////////////////////////////

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    if (!this.m_elementsList.IsLoaded()) return;

    const subScreenIdx: int = this.GetSubScreenIdx();

    // draw win value image
    if (AssertIf(!IsValidIndex(ImageIds, subScreenIdx))) return;
    this.m_elementsList.Get(ImageIds[subScreenIdx]).Draw(drawList);

    // draw win value text
    if (AssertIf(!IsValidIndex(TextIds, subScreenIdx))) return;
    this.m_elementsList.Get(TextIds[subScreenIdx]).Draw(drawList);
  }

  Clear() {
    this.SetHidden(true);
  }

  SetWinValue(credits: int64_t) {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    if (AssertIf(!IsValidIndex(TextIds, this.GetSubScreenIdx()))) return;

    const textId = TextIds[this.GetSubScreenIdx()];
    const visible: boolean = credits > 0;
    const text = this.m_elementsList.Get(textId, TextElement);

    if (visible) {
      text.SetText(this.m_elementsList.RuntimeGetConst(ILocalization).FormatCurrency(credits));
    }

    this.SetHidden(!visible);
  }

  ////////////////////////////////////////////////////////////////////////////////

  private SetHidden(hidden: boolean) {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const subScreenIdx: int = this.GetSubScreenIdx();

    if (AssertIf(!IsValidIndex(ImageIds, subScreenIdx))) return;
    this.m_elementsList.Get(ImageIds[subScreenIdx]).SetHidden(hidden);

    if (AssertIf(!IsValidIndex(TextIds, subScreenIdx))) return;
    this.m_elementsList.Get(TextIds[subScreenIdx]).SetHidden(hidden);
  }
}

EgtALogCategoryClass(WinValueVisual, 'WinValueVisual');
