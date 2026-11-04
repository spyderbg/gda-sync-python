// Egt::Game::AlphaFamily::PanelLayout (BurningCrownTetraSpins10View/PanelLayout.h/.cpp): the panel's main and Tetra
// layouts. An element of a panel view's JSON may have an alternate, of its id followed by _tetra, with its own
// position, scale and resources: the Tetra layout shows the alternate in the element's place. A panel view keeps one
// PanelLayout of its elements list, follows the game background's layout with it, and binds the elements it shows.

import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import type { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { GameBackgroundView } from './Views/GameBackgroundView';

const TetraSuffix = '_tetra';

export class PanelLayout {
  private m_isTetra = false;

  constructor(private readonly m_elementsList: ElementsList) {}

  /** Follows the layout of the game's background, the plugin's GameBackgroundView (C++: dynamic_cast of the
   * interface); the main layout while the runtime has no background or another one. Whether the layout changed. */
  Update(background: IGameBackgroundView | undefined) {
    const isTetra = background instanceof GameBackgroundView && background.IsTetraLayout();
    if (isTetra === this.m_isTetra) return false;

    this.m_isTetra = isTetra;
    return true;
  }

  IsTetra() {
    return this.m_isTetra;
  }

  /** The id of the element that shows `id` in this layout: its Tetra alternate, where the list has one. */
  ElementId(id: string) {
    if (!this.m_isTetra) return id;

    const tetraId = id + TetraSuffix;
    if (this.m_elementsList.TryGet(tetraId) === null) return id;

    return tetraId;
  }

  /** Whether an element shows in its layout: its JSON can hide it, as it hides the Tetra copies of the sound and
   * language buttons. */
  IsShown(elementId: string) {
    const element = this.m_elementsList.TryGet(elementId);
    return element !== null && !element.GetElementData().hidden;
  }

  /** Hides the elements of the other layout, and shows this layout's as their JSON does. The view then sets what it
   * shows of them. */
  Apply() {
    for (const element of this.m_elementsList.GetElements()) {
      const id = element.GetId();
      const isTetraElement = id.endsWith(TetraSuffix);
      const pairedId = isTetraElement ? id.slice(0, -TetraSuffix.length) : id + TetraSuffix;
      if (this.m_elementsList.TryGet(pairedId) === null) continue;

      element.SetHidden(isTetraElement !== this.m_isTetra || element.GetElementData().hidden === true);
    }
  }
}
