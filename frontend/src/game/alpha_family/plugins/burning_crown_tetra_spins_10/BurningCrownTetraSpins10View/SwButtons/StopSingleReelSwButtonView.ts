// Egt::Game::AlphaFamily::StopSingleReelSwButtonView (BurningCrownTetraSpins10View/SwButtons/StopSingleReelSwButtonView.h/.cpp):
// touch areas over the reels, each stopping its reel while the reels spin.

import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { IStopSingleReelSwButtonView, IStopSingleReelSwButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const StopSingleReelSwButtonViewId = 'StopSingleReelSwButtonView';
const SoundPanelButtonTouchId = 'MG_PANEL_BUTTON_TOUCH';
const ButtonReel1Id = 'button_reel_1';
const ButtonReel2Id = 'button_reel_2';
const ButtonReel3Id = 'button_reel_3';
const ButtonReel4Id = 'button_reel_4';
const ButtonReel5Id = 'button_reel_5';
const ButtonIds = [ButtonReel1Id, ButtonReel2Id, ButtonReel3Id, ButtonReel4Id, ButtonReel5Id];

export class StopSingleReelSwButtonView extends BaseView implements IStopSingleReelSwButtonView {
  protected readonly m_events = new IStopSingleReelSwButtonViewEvents();
  protected m_enabledBtns: boolean[] = [];

  constructor() {
    super(StopSingleReelSwButtonViewId);
    this.m_enabledBtns = ButtonIds.map(() => false);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IStopSingleReelSwButtonView, this);
    this.RuntimeAdd(IStopSingleReelSwButtonView.Events, this.m_events);
    this.InitElementsList(StopSingleReelSwButtonViewId, () => this.OnElementsListLoaded());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(IStopSingleReelSwButtonView);
    this.RuntimeRemove(IStopSingleReelSwButtonView.Events);
    super.Deinit();
  }

  HandleTouchDown(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    let captured = false;
    for (let i = 0; i < ButtonIds.length; i++) {
      const reelButtonElement = this.m_elementsList.Get(ButtonIds[i], ButtonElement);
      if (reelButtonElement.HandleTouchDown({ x, y })) {
        this.SimulateButtonPress(i);
        captured = true;
      }
    }
    return captured;
  }

  HandleTouchUp(_x: number, _y: number) {
    return false;
  }

  SetEnabled(enabledOrIdx: boolean | number, enabled = false) {
    if (typeof enabledOrIdx === 'number') {
      const idx = enabledOrIdx;
      if (!IsValidIndex(ButtonIds, idx)) return;
      this.m_enabledBtns[idx] = enabled;
      if (!this.m_elementsList.IsLoaded()) return;
      const reelButtonElement = this.m_elementsList.Get(ButtonIds[idx], ButtonElement);
      reelButtonElement.SetEnabled(enabled);
      return;
    }
    this.m_enabledBtns = this.m_enabledBtns.map(() => enabledOrIdx);
    if (!this.m_elementsList.IsLoaded()) return;
    for (const buttonId of ButtonIds) {
      const reelButtonElement = this.m_elementsList.Get(buttonId, ButtonElement);
      reelButtonElement.SetEnabled(enabledOrIdx);
    }
  }

  private OnElementsListLoaded() {
    for (let i = 0; i < ButtonIds.length; i++) this.SetEnabled(i, this.m_enabledBtns[i]);
  }

  private SimulateButtonPress(id: number) {
    this.RuntimeGet(IAudioApi).Play(SoundPanelButtonTouchId);
    this.m_events.buttonPressedEvent.Post(id);
  }
}
