// Egt::Game::AlphaFamily::KnobsTetraView (BurningCrownTetraSpins10View/Views/KnobsTetraView.h/.cpp): the tetra
// screens' line knobs and their sparkles, which the knobs view shows in the tetra round.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const KnobsTetraViewId = 'KnobsTetraView';

export class KnobsTetraView extends BaseView {
  constructor() {
    super(KnobsTetraViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(KnobsTetraViewId);

    super.SetVisible(false);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    super.Deinit();
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
  }
}
