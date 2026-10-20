// Egt::Game::ICappingSplashView (AlphaFamily/Views/ICappingSplashView.bridge.h): the splash that tells the player the
// match won the maximum award, made by the family's CappingSplashView module.

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface ICappingSplashView extends IControlView {
  ShowCappingSplashView(showAllFeaturesEnd: boolean): void;
  HideCappingSplashView(): void;
}

export class ICappingSplashViewEvents extends IControlViewEvents {
  readonly splashIdleDismissed = new Event();
}

export const ICappingSplashView = Interface<ICappingSplashView, ICappingSplashViewEvents>('ICappingSplashView');
