// Egt::Game::AlphaFamily::ThemeLayout (BurningCrownTetraSpins10View/ThemeLayout.h/.cpp): the panel's main and Tetra
// layouts. An element of a panel view's JSON may have an alternate, of its id followed by _tetra, with its own
// position, scale and resources: the Tetra theme shows the alternate in the element's place. A panel view keeps one
// ThemeLayout of its elements list and its theme (BaseView.m_theme, which C++ holds by const reference: tweeny.ref
// here, which the translator writes as the field), and applies it in OnThemeChanged.

import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { ref_t } from '@game/hat_libs/tweeny/tween_common';
import { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';

const TetraSuffix = '_tetra';

export class ThemeLayout {
  constructor(
    private readonly m_elementsList: ElementsList,
    private readonly m_theme: ref_t<ThemeType>,
  ) {}

  IsTetra() {
    return this.m_theme.get() === ThemeType.Tetra;
  }

  /** The id of the element that shows `id` in this theme: its Tetra alternate, where the list has one. */
  ElementId(id: string) {
    if (!this.IsTetra()) return id;

    const tetraId = id + TetraSuffix;
    if (this.m_elementsList.TryGet(tetraId) === null) return id;

    return tetraId;
  }

  /** Whether an element shows in its theme: its JSON can hide it, as it hides the Tetra copies of the sound and
   * language buttons. */
  IsShown(elementId: string) {
    const element = this.m_elementsList.TryGet(elementId);
    return element !== null && !element.GetElementData().hidden;
  }

  /** Hides the elements of the other theme, and shows this theme's as their JSON does. The view then sets what it
   * shows of them. */
  Apply() {
    for (const element of this.m_elementsList.GetElements()) {
      const id = element.GetId();
      const isTetraElement = id.endsWith(TetraSuffix);
      const pairedId = isTetraElement ? id.slice(0, -TetraSuffix.length) : id + TetraSuffix;
      if (this.m_elementsList.TryGet(pairedId) === null) continue;

      element.SetHidden(isTetraElement !== this.IsTetra() || element.GetElementData().hidden === true);
    }
  }
}
