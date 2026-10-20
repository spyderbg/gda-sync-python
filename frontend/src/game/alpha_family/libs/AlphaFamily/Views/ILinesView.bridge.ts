// Egt::Game::AlphaFamily::ILinesView (AlphaFamily/Views/ILinesView.bridge.h).

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { ERoundTags } from '../Math/Common/Common.data';
import type { ReelCombination, ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export enum LineType {
  eSteadyForever,
  eSteadyShort,
  eSteadyLong,
  eBlinkForever,
  eBlinkShort,
  eBlinkLong,
}

export interface ILinesView extends IControlView {
  SetWinLineTags(tags: ERoundTags[]): void;
  ShowWinLine(combination: ReelCombination, type?: LineType): void;
  ShowCombinations(combinations: ReelCombinations, fast: boolean, autoPlayEnabled: boolean): void;
  UpdateShownCombinations(autoPlayEnabled: boolean): void;
  PlayWinLinesSounds(todo_useSpecificType: string): void;
  StopWinLinesSounds(reason: string): void;
  StopAllSounds(): void;
  PlayBackgroundMusic(roundName: string): void;
  StopBackgroundMusic(roundName: string): void;
  PauseAnimations(): void;
  ResumeAnimations(): void;
  ClearLines(): void;
}

export class ILinesViewEvents extends IControlViewEvents {
  readonly showFastLinesFinished = new Event();
  readonly showCombinationsFinished = new Event();
}

export const ILinesView = Interface<ILinesView, ILinesViewEvents>('ILinesView');
