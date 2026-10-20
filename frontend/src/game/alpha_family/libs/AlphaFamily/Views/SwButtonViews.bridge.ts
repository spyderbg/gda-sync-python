// Egt::Game::AlphaFamily software buttons (AlphaFamily/Views/SwButtonViews.bridge.h): the buttons drawn on screen.

import { Event } from '../../../../engine/Core/Event';
import { Interface, type InterfaceToken } from '../../../../engine/GameCore/RuntimeAccess';
import { type IButtonView, IButtonViewEvents, type IControlView } from './BaseInterfaces/IControlView';

export interface ISwButtonBase extends IControlView, IButtonView {
  SetButtonState(isEnabled: boolean, isFocused?: boolean, skin?: string, isBlinking?: boolean): void;
  ResetButtonState(): void;
  IsEnabled(): boolean;
  IsVisible(): boolean;
}

export type SwButtonToken<T extends ISwButtonBase = ISwButtonBase, E = IButtonViewEvents> = InterfaceToken<T, E>;

export class IExitGameSwButtonViewEvents extends IButtonViewEvents {
  readonly exitPresentingFinished = new Event();
}

export const IExitGameSwButtonView: SwButtonToken<ISwButtonBase, IExitGameSwButtonViewEvents> = Interface('IExitGameSwButtonView');
export const IInfoSwButtonView: SwButtonToken = Interface('IInfoSwButtonView');
export const IBetUpSwButtonView: SwButtonToken = Interface('IBetUpSwButtonView');
export const IBetDownSwButtonView: SwButtonToken = Interface('IBetDownSwButtonView');
export const ILineUpSwButtonView: SwButtonToken = Interface('ILineUpSwButtonView');
export const ILineDownSwButtonView: SwButtonToken = Interface('ILineDownSwButtonView');
export const IResponsibleSwButtonView: SwButtonToken = Interface('IResponsibleSwButtonView');
export const IExitTetraSwButtonView: SwButtonToken = Interface('IExitTetraSwButtonView');

export enum ESoundSwButtonType {
  Normal,
  Tetra,
}

export interface ISoundVolumeSwButtonView extends ISwButtonBase {
  SetCurrentVolume(volume: number): void;
  SetButtonType(type: ESoundSwButtonType): void;
}

export const ISoundVolumeSwButtonView: SwButtonToken<ISoundVolumeSwButtonView> = Interface('ISoundVolumeSwButtonView');

export enum ELanguageSwButtonType {
  Normal,
  Tetra,
}

export interface ILanguageSwButtonView extends ISwButtonBase {
  SetButtonType(type: ELanguageSwButtonType): void;
}

export const ILanguageSwButtonView: SwButtonToken<ILanguageSwButtonView> = Interface('ILanguageSwButtonView');

export interface IStopSingleReelSwButtonView {
  SetEnabled(enabledOrIdx: boolean | number, enabled?: boolean): void;
}

export class IStopSingleReelSwButtonViewEvents {
  readonly buttonPressedEvent = new Event<[number]>();
}

export const IStopSingleReelSwButtonView = Interface<IStopSingleReelSwButtonView, IStopSingleReelSwButtonViewEvents>('IStopSingleReelSwButtonView');
