// Egt::GameVideoCtrl::ToggleButtonElement (ViewElements/ToggleButtonElement.h/.cpp): a button that toggles on each
// touch, through a pressed state of 250 ms: images (rssKeys) toggled off, pressed on, pressed off, toggled on, disabled.

import type { Point } from '../../Game/RuntimeExport/IResources';
import { ButtonElement } from './ButtonElement';

enum EState {
  ToggledOff = 0,
  PressedOn,
  ToggledOn,
  PressedOff,
  Disabled,
}

const PressedDuration = 250;
const Transitions: Record<EState, EState> = {
  [EState.ToggledOff]: EState.PressedOn,
  [EState.PressedOn]: EState.ToggledOn,
  [EState.ToggledOn]: EState.PressedOff,
  [EState.PressedOff]: EState.ToggledOff,
  [EState.Disabled]: EState.Disabled,
};
// the rssKeys' order: toggled off, pressed on, pressed off, toggled on, disabled
const ImageOfState: Record<EState, number> = {
  [EState.ToggledOff]: 0, [EState.PressedOn]: 1, [EState.PressedOff]: 2, [EState.ToggledOn]: 3, [EState.Disabled]: 4,
};

export class ToggleButtonElement extends ButtonElement {
  private m_state = EState.ToggledOff;
  private m_pressedAt = 0;

  HandleTouchDown(point: Point) {
    if (this.hidden || !this.enabled || !this.Contains(point)) return false;
    this.RefreshState();
    this.PlayPressedSound();
    this.m_pressedAt = performance.now();
    return true;
  }

  HandleTouchUp(_point: Point) {
    return false;
  }

  Update(now: number) {
    if (now - this.m_pressedAt >= PressedDuration && (this.m_state === EState.PressedOff || this.m_state === EState.PressedOn)) this.RefreshState();
    super.Update(now);
  }

  ResetState() {
    this.m_state = EState.ToggledOff;
  }

  IsToggledOn() {
    return this.m_state === EState.ToggledOn || this.m_state === EState.PressedOn;
  }

  protected ImageIndex() {
    if (!this.enabled) return ImageOfState[EState.Disabled];
    return ImageOfState[this.m_state];
  }

  private RefreshState() {
    this.m_state = Transitions[this.m_state];
  }
}
