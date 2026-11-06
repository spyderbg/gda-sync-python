// Egt::Game::AlphaFamily::ThemeLayout (BurningCrownTetraSpins10View/ThemeLayout.h/.cpp): the panel's layouts by theme.
// An element of a panel view's JSON may have a variant for a theme, of its id followed by the theme's suffix
// (ThemeSuffix: _tetra), with its own position, scale and resources: that theme shows the variant in the element's
// place. A panel view keeps one ThemeLayout of its elements list and its theme (BaseView.m_theme, which C++ holds by
// const reference: tweeny.ref here, which the translator writes as the field), and applies it in OnThemeChanged.

import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { ref_t } from '@game/hat_libs/tweeny/tween_common';
import { ThemeSuffix, ThemeSuffixes, type ThemeSuffixEntry, type ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';

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

function MatchThemeSuffix(id: string) {
  let match: ThemeSuffixEntry | null = null;
  for (const entry of ThemeSuffixes) {
    if (Unless(id.length > entry.suffix.length && id.endsWith(entry.suffix))) continue;
    if (match && match.suffix.length >= entry.suffix.length) continue;
    match = entry;
  }
  return match;
}

export class ThemeLayout {
  constructor(
    private readonly m_elementsList: ElementsList,
    private readonly m_theme: ref_t<ThemeType>,
  ) {}

  /** The id of the element that shows `id` in this theme: its variant for the theme, where the list has one. */
  ElementId(id: string) {
    const themeId = id + ThemeSuffix(this.m_theme.get());
    if (this.m_elementsList.TryGet(themeId) === null) return id;

    return themeId;
  }

  /** Whether an element shows in its theme: its JSON can hide it, as it hides the Tetra copies of the sound and
   * language buttons. */
  IsShown(elementId: string) {
    const element = this.m_elementsList.TryGet(elementId);
    return element !== null && !element.GetElementData().hidden;
  }

  // Layout naming contract: "x" + ThemeSuffix(theme) ("x_tetra", "x_hold_and_spin") shows only in that theme,
  // even without an "x"; several variants of one "x" for a theme are indexed ("x_01_tetra", "x_02_tetra").
  // An "x" with any variant shows unless the current theme has one of its own; every other element is left
  // as it is. Ids that end in a theme suffix are therefore reserved for variants. The view then sets what it shows of
  // them.
  Apply() {
    const elements = this.m_elementsList.GetElements();

    const mainIds = new Set<string>();
    const replacedMainIds = new Set<string>();
    for (const element of elements) {
      const id = element.GetId();
      const match = MatchThemeSuffix(id);
      if (Unless(match)) continue;

      const mainId = id.slice(0, id.length - match.suffix.length);
      mainIds.add(mainId);
      mainIds.add(WithoutIndex(mainId));
      if (Unless(match.theme === this.m_theme.get())) continue;

      replacedMainIds.add(mainId);
      replacedMainIds.add(WithoutIndex(mainId));
    }

    for (const element of elements) {
      const id = element.GetId();
      const match = MatchThemeSuffix(id);
      if (Unless(match || mainIds.has(id))) continue;

      const hiddenByTheme: boolean = match ? match.theme !== this.m_theme.get() : replacedMainIds.has(id);
      element.SetHidden(hiddenByTheme || element.GetElementData().hidden === true);
    }
  }
}
