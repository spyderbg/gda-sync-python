// Egt::Game::AlphaFamily overlay and decoration views: ITetraRoundOverlayView, IBigWinView, IKnobsView,
// IGameBackgroundView, IAutoPlayView, ITopperView (AlphaFamily/Views/*.bridge.h).

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { ERoundTags } from '../Math/Common/Common.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface ITetraRoundOverlayView extends IControlView {
  ShowIntro(): void;
  ShowOutro(): void;
  Clear(): void;
}

export class ITetraRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();
  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const ITetraRoundOverlayView = Interface<ITetraRoundOverlayView, ITetraRoundOverlayViewEvents>('ITetraRoundOverlayView');

export interface IBigWinView extends IControlView {
  ApplyPhase(todo_useSpecificType: string): void;
  Clear(): void;
  ShowAnimation(roundTag: ERoundTags): void;
}

export class IBigWinViewEvents extends IControlViewEvents {
  readonly animating = new Event();
  readonly animatingDone = new Event();
}

export const IBigWinView = Interface<IBigWinView, IBigWinViewEvents>('IBigWinView');

export enum EKnobsType {
  Normal,
  Tetra,
}

export interface IKnobsView extends IControlView {
  SetKnobsType(type: EKnobsType): void;
}

export const IKnobsView = Interface<IKnobsView, IControlViewEvents>('IKnobsView');

export enum EBackgroundType {
  Main,
  Tetra,
}

export interface IGameBackgroundView {
  SetBackgroundType(type: EBackgroundType): void;
}

export const IGameBackgroundView = Interface<IGameBackgroundView, IControlViewEvents>('IGameBackgroundView');

export interface IAutoPlayView {
  SetAutoPlay(autoPlayOn: boolean): void;
  IsAutoPlayOn(): boolean;
}

export const IAutoPlayView = Interface<IAutoPlayView>('IAutoPlayView');

export interface ITopperView {
  RefreshAnimations(): void;
}

export const ITopperView = Interface<ITopperView>('ITopperView');
