// Egt::Game::AlphaFamily::ThemeLayout (BurningCrownTetraSpins10View/ThemeLayout.h/.cpp): the panel's main and Tetra
// layouts. An element of a panel view's JSON may have an alternate, of its id followed by _tetra, with its own
// position, scale and resources: the Tetra theme shows the alternate in the element's place. A panel view keeps one
// ThemeLayout of its elements list and its theme (BaseView.m_theme, which C++ holds by const reference: tweeny.ref
// here, which the translator writes as the field), and applies it in OnThemeChanged.

import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { ref_t } from '@game/hat_libs/tweeny/tween_common';
import { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';

const TetraSuffix = '_tetra';

function IsDigit(c: string) {
  return c >= '0' && c <= '9';
}

function WithoutIndex(id: string) {
  const pos = id.lastIndexOf('_');
  if (pos === -1 || pos + 1 === id.length) return id;

  const index = id.slice(pos + 1);
  if (Unless([...index].every(IsDigit))) return id;

  return id.slice(0, pos);
}

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

  // Layout naming contract: "x_tetra" shows only in the Tetra theme, even without an "x"; several Tetra
  // variants of one "x" are indexed ("x_01_tetra", "x_02_tetra"). An "x" with any of these shows only
  // outside the Tetra theme; every other element is left as it is. The view then sets what it shows of them.
  Apply() {
    const elements = this.m_elementsList.GetElements();

    const mainIds = new Set<string>();
    for (const element of elements) {
      const id = element.GetId();
      if (Unless(id.endsWith(TetraSuffix))) continue;

      const mainId = id.slice(0, id.length - TetraSuffix.length);
      mainIds.add(mainId);
      mainIds.add(WithoutIndex(mainId));
    }

    for (const element of elements) {
      const isTetraElement: boolean = element.GetId().endsWith(TetraSuffix);
      if (Unless(isTetraElement || mainIds.has(element.GetId()))) continue;

      element.SetHidden(isTetraElement !== this.IsTetra() || element.GetElementData().hidden === true);
    }
  }
}
