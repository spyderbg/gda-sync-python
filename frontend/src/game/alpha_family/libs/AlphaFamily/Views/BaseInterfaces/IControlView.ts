// Egt::Game::IControlView, IButtonView, IMenuView and INumericBarView (AlphaFamily/Views/BaseInterfaces).

import { Event } from '@game/engine/Core/Event';
import type { AccumulationDescriptor } from '../Tools/AccumulationControl.data';

export interface IControlView {
  SetEnabled(enabled: boolean): void;
  SetVisible(visible: boolean): void;
  SetFocused(focused: boolean): void;
  SetSkin(skin: string): void;
}

export class IControlViewEvents {}

export interface IButtonView {
  SimulateButtonPress(): void;
  SetBlinking(blinking: boolean): void;
  PlayButtonAudioState(audioStateName: string): void;
}

export class IButtonViewEvents extends IControlViewEvents {
  readonly buttonPressedEvent = new Event();
}

export interface IMenuView {
  OpenMenu(): void;
  CloseMenu(): void;
}

export class IMenuViewEvents extends IControlViewEvents {
  readonly menuOpening = new Event();
  readonly menuClosing = new Event();
  readonly menuMoving = new Event();
  readonly menuClosed = new Event();
  readonly menuOpened = new Event();
}

export interface INumericBarView {
  SetAccumulation(accumulation: AccumulationDescriptor): void;
  SetValue(value: number): void;
  SetValueNow(value: number): void;
  FastForward(): void;
  PlayBarAudioState(audioStateName: string): void;
}

export class INumericBarViewEvents extends IControlViewEvents {
  readonly animatingDone = new Event<[number]>();
  readonly animatingInstantDone = new Event<[number]>();
}
