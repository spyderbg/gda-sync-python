// Egt::Game::AlphaFamily::IStatusLineView (AlphaFamily/Views/IStatusLineView.bridge.h).

import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { ELeftStatusLine, ERightStatusLine, EStatusLine } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IStatusLineView extends IControlView {
  ShowStatus(state: EStatusLine): void;
  ShowCombinations(combinations: ReelCombinations, fast: boolean): void;
  ShowRightStatus(state: ERightStatusLine): void;
  ShowLeftStatus(state: ELeftStatusLine): void;
  SetLanguage(language: string): void;
  PauseAnimations(): void;
  ResumeAnimations(): void;
}

export const IStatusLineView = Interface<IStatusLineView, IControlViewEvents>('IStatusLineView');
