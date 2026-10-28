// Egt::Game::AlphaFamily::KnobsView (NordicRushView/Views/KnobsView.h/.cpp): the line knobs beside the reels.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EKnobsType, IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const KnobsViewId = 'KnobsView';

export class KnobsView extends BaseView implements IKnobsView {
  protected readonly m_events = new IControlViewEvents();
  private m_knobsType = EKnobsType.Normal;

  constructor() {
    super(KnobsViewId);
  }

  // BaseView
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

  // IControlView
  SetEnabled(enabled: boolean) {
    this.m_control.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
  }

  SetFocused(focused: boolean) {
    this.m_control.SetFocused(focused);
  }

  SetSkin(skin: string) {
    this.m_control.SetSkin(skin);
  }

  // IKnobsView
  SetKnobsType(knobsType: EKnobsType) {
    this.m_knobsType = knobsType;
  }
}
