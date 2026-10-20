// Egt::Game::AlphaFamily::ITetraRoundView (AlphaFamily/Views/ITetraRoundView.bridge.h).

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { Reels, SymbolGrid } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface ITetraRoundView extends IControlView {
  SetupFakeReels(subScreen: number, reels: Reels): void;
  StartReeling(): void;
  SetStopFigures(subScreen: number, symbolGrid: SymbolGrid): void;
  SetSymbolsAroundStop(subScreenIdx: number, before: SymbolGrid, after: SymbolGrid): void;
  StartNormalReelingStop(subScreen: number, reelIdx: number): void;
  StartFastReelingStop(subScreen: number): void;
  ShowCombinations(subScreen: number, combinations: ReelCombinations, fast: boolean, autoPlay: boolean): void;
  StartFastCombinationsStop(subScreen: number): void;
  ClearCombinations(subScreen: number): void;
  SetDimmed(subScreen: number, dimmed: boolean): void;
  SetWinValue(subScreen: number, credits: number): void;
  SetTetraFlyingSymbols(subScreenIdx: number, symbolGrid: SymbolGrid): void;
  StartFlyingAnimation(subScreenIdx: number): void;
  Clear(): void;
}

export class ITetraRoundViewEvents extends IControlViewEvents {
  readonly singleReelStopEvent = new Event<[number, number, number[]]>();
  readonly allReelsStopEvent = new Event();
  readonly startReelingEvent = new Event();
  readonly showCombinationsFinished = new Event<[number]>();
  readonly dimFinished = new Event();
  readonly flyAnimationEndEvent = new Event();
}

export const ITetraRoundView = Interface<ITetraRoundView, ITetraRoundViewEvents>('ITetraRoundView');
