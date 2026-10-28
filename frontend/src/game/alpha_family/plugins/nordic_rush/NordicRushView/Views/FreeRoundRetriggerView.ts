// Egt::Game::AlphaFamily::FreeRoundRetriggerView (NordicRushView/Views/FreeRoundRetriggerView.h/.cpp): the free spins won
// again during the free round ("+N"), which zoom in around dummy_pivot, stay two seconds and fade out.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import type { Color } from '@game/engine/Game/RuntimeExport/IResources';
import type { float } from '@game/engine/GameCore/Common/Types';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ColorTo, ZoomIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { IFreeRoundRetriggerView, IFreeRoundRetriggerViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const FreeRoundRetriggerViewId = 'FreeRoundRetriggerView';

const DummyPivotId = 'dummy_pivot';

const ImageFsWonId = 'image_fs_won';
const TextFsWonId = 'text_fs_won';
const ElementsRetriggerIds = [ImageFsWonId, TextFsWonId];

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const ElementZoomInDuration: tweeny.duration_t = FrameDuration * 11; // 5frames * 41ms;
const ElementFinishedDelay: tweeny.duration_t = 2000;
const ElementFadeOutDuration: tweeny.duration_t = 2000;

const ColorTransparent: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0x00 };
const ColorSolid: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0xFF };

function ZoomInEasing(progress: float): float {
  const threshold: float = (5.0 as float) / (11.0 as float); // ≈ 0.4545
  const scaleStart: float = 0 as float;
  const scaseNormal: float = 1 as float;
  const scaleLarge: float = 1.1 as float;

  if (progress <= threshold) { // frame 0 to 5 ( of 11)
    const remappedProgress: float = RemapClamped(progress, 0 as float, threshold, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_stop2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleStart, scaleLarge);
    return zoomLevel;
  } else { // frame 6 to 11 ( of 11)
    const remappedProgress: float = RemapClamped(progress, threshold, 1 as float, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_start_stop2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleLarge, scaseNormal);
    return zoomLevel;
  }
}

enum EMode {
  None,
  Retrigger,
}

export class FreeRoundRetriggerView extends BaseView implements IFreeRoundRetriggerView {
  protected readonly m_events = new IFreeRoundRetriggerViewEvents();
  protected m_freeSpinsRetriggered = 0;

  private m_sentinel = new sentinel();

  private m_actionRetrigger = new tweeny.tween_action();

  private m_mode = EMode.None;

  constructor() {
    super(FreeRoundRetriggerViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.RuntimeAdd(IFreeRoundRetriggerView, this);
    this.RuntimeAdd(IFreeRoundRetriggerView.Events, this.m_events);

    this.InitElementsList(FreeRoundRetriggerViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionRetrigger);

    this.DeinitElementsList();

    this.RuntimeRemove(IFreeRoundRetriggerView);
    this.RuntimeRemove(IFreeRoundRetriggerView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    // adjust values
    this.m_elementsList.SetHidden(true, ElementsRetriggerIds);
    this.InitAnimations();

    this.AdjustFreeSpinsRetriggered();

    // adjust animations
    switch (this.m_mode) {
      case EMode.Retrigger: tweeny.start(this.m_actionRetrigger, 'FreeRoundRetriggerView:Retrigger'); break;
      case EMode.None: // fallthrough
      default: break;
    }
  }

  private InitAnimations() {
    const pivot = this.m_elementsList.Get(DummyPivotId).GetWorldPivot();
    this.m_elementsList.SetWorldPivot(pivot, ElementsRetriggerIds);

    this.m_sentinel = make_sentinel();

    /// setup open animations
    const actionsZoomIn: tweeny.tween_action[] = [];
    for (const id of ElementsRetriggerIds) {
      const elementZoomIn = this.m_elementsList.Find(id, BaseElement);
      if (elementZoomIn) {
        actionsZoomIn.push(ZoomIn(elementZoomIn, ElementZoomInDuration, ZoomInEasing));
      }
    }
    const actionElementsZoomIn = tweeny.together(actionsZoomIn, this.m_sentinel);
    const actionFinishedDelay = tweeny.delay(ElementFinishedDelay, this.m_sentinel);

    const actionsFadeOut: tweeny.tween_action[] = [];
    for (const id of ElementsRetriggerIds) {
      const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
      if (elementFadeOut) {
        actionsFadeOut.push(ColorTo(elementFadeOut, ColorTransparent, ElementFadeOutDuration));
      }
    }
    const actionFadeOut = tweeny.together(actionsFadeOut, this.m_sentinel);

    this.m_actionRetrigger = tweeny.sequence([actionElementsZoomIn, actionFinishedDelay, actionFadeOut]);
    this.m_actionRetrigger.on_begin.connect(() => {
      this.m_elementsList.SetHidden(false, ElementsRetriggerIds);
      this.m_elementsList.SetColor(ColorSolid, ElementsRetriggerIds);
    });
    this.m_actionRetrigger.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, ElementsRetriggerIds);

      this.m_events.retriggerFinished.Post();
    });
  }

  private HideMembers() {
    this.m_elementsList.SetHidden(true, ElementsRetriggerIds);
  }

  // IFreeRoundRetriggerView
  ShowRetriggerScreen(_freeRoundsCount: number) {
    this.m_mode = EMode.Retrigger;

    this.m_freeSpinsRetriggered = _freeRoundsCount;
    this.AdjustFreeSpinsRetriggered();
    tweeny.start(this.m_actionRetrigger, 'FreeRoundRetriggerView:Retrigger');
  }

  Clear() {
    this.m_mode = EMode.None;
    tweeny.stop(this.m_actionRetrigger);
  }

  private AdjustFreeSpinsRetriggered() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const textFreespinsRetriggered = this.m_elementsList.Get(TextFsWonId, TextElement);
    textFreespinsRetriggered.SetText(`+${this.m_freeSpinsRetriggered}`);
  }
}
