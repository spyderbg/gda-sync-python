// Egt::Game::AlphaFamily::KnobsView (BurningCrownTetraSpins10View/Views/KnobsView.h/.cpp): the line knobs beside the
// reels, one pair for the main reels and two for the tetra screens.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EKnobsType, IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const KnobsViewId = 'KnobsView';
const ElementsMainRoundIds = ['image_knobs_left', 'image_knobs_right', 'anim_sparkles_left', 'anim_sparkles_right'];
const ElementsTetraRoundIds = [
  'image_knobs_left_tetra_01', 'image_knobs_right_tetra_01', 'image_knobs_left_tetra_02', 'image_knobs_right_tetra_02',
  'anim_sparkles_left_tetra_01', 'anim_sparkles_right_tetra_01', 'anim_sparkles_left_tetra_02', 'anim_sparkles_right_tetra_02',
];

export class KnobsView extends BaseView implements IKnobsView {
  private readonly m_events = new IControlViewEvents();
  private m_knobsType = EKnobsType.Normal;

  constructor() {
    super(KnobsViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IKnobsView, this);
    this.RuntimeAdd(IKnobsView.Events, this.m_events);
    this.InitElementsList(KnobsViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(IKnobsView);
    this.RuntimeRemove(IKnobsView.Events);
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    const isTetraView = this.m_knobsType === EKnobsType.Tetra;
    this.m_elementsList.SetHidden(isTetraView, ElementsMainRoundIds);
    this.m_elementsList.SetHidden(!isTetraView, ElementsTetraRoundIds);
    super.Draw(drawList);
  }

  SetKnobsType(knobsType: EKnobsType) {
    this.m_knobsType = knobsType;
  }
}
