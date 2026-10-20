// Egt::Game hardware buttons (Egt/Game/RuntimeImport/HwButtons.bridge.h): the cabinet's buttons, which the browser
// kernel maps to the keyboard and the panel under the game.

import { Event } from '../../Core/Event';
import { Interface, type InterfaceToken } from '../../GameCore/RuntimeAccess';

export enum HwButtonLight {
  Off,
  On,
  BlinkSlowA,
  BlinkSlowB,
  BlinkFastA,
  BlinkFastB,
}

export interface HwButtonState {
  enabled?: boolean;
  light?: HwButtonLight;
}

export interface IHwButton {
  SetButtonState(state: HwButtonState): void;
  GetButtonState(): Required<HwButtonState>;
  SimulateButtonPress(): void;
}

export class IHwButtonEvents {
  readonly buttonPressedEvent = new Event();
}

export type HwButtonToken = InterfaceToken<IHwButton, IHwButtonEvents>;

export const IStartHwButton: HwButtonToken = Interface('IStartHwButton');
export const IAutoPlayHwButton: HwButtonToken = Interface('IAutoPlayHwButton');
export const IMaxBetHwButton: HwButtonToken = Interface('IMaxBetHwButton');
export const IIncreaseBetHwButton: HwButtonToken = Interface('IIncreaseBetHwButton');
export const IDecreaseBetHwButton: HwButtonToken = Interface('IDecreaseBetHwButton');
export const ICashoutHwButton: HwButtonToken = Interface('ICashoutHwButton');
export const ICollectHwButton: HwButtonToken = Interface('ICollectHwButton');
export const IExitHwButton: HwButtonToken = Interface('IExitHwButton');
export const IInfoHwButton: HwButtonToken = Interface('IInfoHwButton');
export const IGambleHwButton: HwButtonToken = Interface('IGambleHwButton');
export const IGambleRedHwButton: HwButtonToken = Interface('IGambleRedHwButton');
export const IGambleBlackHwButton: HwButtonToken = Interface('IGambleBlackHwButton');

export const HW_BUTTONS = {
  Start: IStartHwButton, AutoPlay: IAutoPlayHwButton, MaxBet: IMaxBetHwButton, IncreaseBet: IIncreaseBetHwButton,
  DecreaseBet: IDecreaseBetHwButton, Cashout: ICashoutHwButton, Collect: ICollectHwButton, Exit: IExitHwButton,
  Info: IInfoHwButton, Gamble: IGambleHwButton, GambleRed: IGambleRedHwButton, GambleBlack: IGambleBlackHwButton,
} as const;

export type HwButtonName = keyof typeof HW_BUTTONS;
