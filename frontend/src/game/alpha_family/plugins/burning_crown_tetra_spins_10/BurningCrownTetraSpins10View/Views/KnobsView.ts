// Egt::Game::AlphaFamily::KnobsView (BurningCrownTetraSpins10View/Views/KnobsView.h/.cpp): the main reels' line knobs
// beside the reels; in the tetra round it draws nothing, and shows its tetra view (KnobsTetraView) instead.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EKnobsType, IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import type { KnobsTetraView } from './KnobsTetraView';

const KnobsViewId = 'KnobsView';

export class KnobsView extends BaseView implements IKnobsView {
  protected readonly m_events = new IControlViewEvents();

  private m_knobsType = EKnobsType.Normal;
  private readonly m_tetraView: KnobsTetraView | null;

  constructor(tetraView: KnobsTetraView | null) {
    super(KnobsViewId);
    this.m_tetraView = tetraView;
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

  Draw(drawList: DrawList) {
    if (this.m_knobsType === EKnobsType.Tetra) return;

    super.Draw(drawList);
  }

  // IControlView
  SetEnabled(enabled: boolean) {
    this.m_control.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
    this.UpdateTetraViewVisibility();
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
    this.UpdateTetraViewVisibility();
  }

  private UpdateTetraViewVisibility() {
    if (Unless(this.m_tetraView)) return;
    this.m_tetraView!.SetVisible(this.IsVisible() && this.m_knobsType === EKnobsType.Tetra);
  }
}
