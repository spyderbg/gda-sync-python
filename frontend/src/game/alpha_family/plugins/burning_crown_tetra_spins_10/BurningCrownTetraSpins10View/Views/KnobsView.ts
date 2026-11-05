// Egt::Game::AlphaFamily::KnobsView (BurningCrownTetraSpins10View/Views/KnobsView.h/.cpp): the line knobs beside the
// reels, one pair for the main reels and two for the tetra screens.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const KnobsViewId = 'KnobsView';

const ImageKnobsLeftId = 'image_knobs_left';
const ImageKnobsRightId = 'image_knobs_right';
const AnimSparklesLeftId = 'anim_sparkles_left';
const AnimSparklesRightId = 'anim_sparkles_right';

const ImageKnobsLeftTetra01Id = 'image_knobs_left_tetra_01';
const ImageKnobsRightTetra01Id = 'image_knobs_right_tetra_01';
const ImageKnobsLeftTetra02Id = 'image_knobs_left_tetra_02';
const ImageKnobsRightTetra02Id = 'image_knobs_right_tetra_02';
const AnimSparklesLeftTetra01Id = 'anim_sparkles_left_tetra_01';
const AnimSparklesRightTetra01Id = 'anim_sparkles_right_tetra_01';
const AnimSparklesLeftTetra02Id = 'anim_sparkles_left_tetra_02';
const AnimSparklesRightTetra02Id = 'anim_sparkles_right_tetra_02';

const ElementsMainRoundIds = [ImageKnobsLeftId, ImageKnobsRightId, AnimSparklesLeftId, AnimSparklesRightId];
const ElementsTetraRoundIds = [
  ImageKnobsLeftTetra01Id,
  ImageKnobsRightTetra01Id,
  ImageKnobsLeftTetra02Id,
  ImageKnobsRightTetra02Id,
  AnimSparklesLeftTetra01Id,
  AnimSparklesRightTetra01Id,
  AnimSparklesLeftTetra02Id,
  AnimSparklesRightTetra02Id,
];

export class KnobsView extends BaseView implements IKnobsView {
  protected readonly m_events = new IControlViewEvents();

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

  protected OnThemeChanged() {
    const isTetraView = this.m_theme === ThemeType.Tetra;
    this.m_elementsList.SetHidden(isTetraView, ElementsMainRoundIds);
    this.m_elementsList.SetHidden(!isTetraView, ElementsTetraRoundIds);
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

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }
}
