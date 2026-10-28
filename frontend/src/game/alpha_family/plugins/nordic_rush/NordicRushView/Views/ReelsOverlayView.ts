// Egt::Game::AlphaFamily::ReelsOverlayView (NordicRushView/Views/ReelsOverlayView.h/.cpp): the fire around the reels'
// frame (anim_hs_reels_frame_fire), shown while the hold and spin round plays.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { EReelsOverlayType, IReelsOverlayView, IReelsOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const ReelsOverlayViewId = 'ReelsOverlayView';

const AnimHsReelsFrameFireId = 'anim_hs_reels_frame_fire';

export class ReelsOverlayView extends BaseView implements IReelsOverlayView {
  protected readonly m_events = new IReelsOverlayViewEvents();

  private m_type = EReelsOverlayType.Main;

  constructor() {
    super(ReelsOverlayViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IReelsOverlayView, this);
    this.RuntimeAdd(IReelsOverlayView.Events, this.m_events);

    this.InitElementsList(ReelsOverlayViewId, () => this.OnElementsListLoaded());

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    this.RuntimeRemove(IReelsOverlayView);
    this.RuntimeRemove(IReelsOverlayView.Events);

    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (Unless(this.IsVisible())) return;

    // (C++ draws once into a dummy list to activate the lazy load: the browser's elements list loads in Init)

    super.Draw(drawList);
  }

  private AdjustType() {
    const frameFire = this.m_elementsList.TryGet(AnimHsReelsFrameFireId, AnimElement);
    if (Unless(frameFire)) return;

    const isHoldAndSpin = this.m_type === EReelsOverlayType.HoldAndSpin;
    if (isHoldAndSpin) {
      frameFire!.SetHidden(false);
      if (frameFire!.IsPlaying()) return;

      frameFire!.Rewind();
      frameFire!.Play();
    } else {
      frameFire!.Stop();
      frameFire!.SetHidden(true);
    }
  }

  // IReelsOverlayView
  SetType(type: EReelsOverlayType) {
    this.m_type = type;

    this.AdjustType();
  }

  private OnElementsListLoaded() {
    this.AdjustType();
  }
}
