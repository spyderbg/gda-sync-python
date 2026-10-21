// Egt::Game::AlphaFamily::IBigWinInfoView (AlphaFamily/Views/IBigWinInfoView.bridge.h): the big win's view on the info
// screen, which BurningCrownTetraSpins10 has not.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { ERoundTags } from '../Math/Common/Common.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IBigWinInfoView extends IControlView {
  ApplyPhase(todo_useSpecificType: string): void;
  Clear(): void;
  ShowAnimation(roundTag: ERoundTags): void;
}

export const IBigWinInfoView = Interface<IBigWinInfoView, IControlViewEvents>('IBigWinInfoView');
