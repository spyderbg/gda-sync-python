// Egt::Game::AlphaFamily::IReelsView (AlphaFamily/Views/IReelsView.bridge.h).

import { Event } from '../../../../engine/Core/Event';
import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { ERoundTags, Reels, SymbolGrid, SymbolViewInfos } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IReelsView extends IControlView {
  SetupNextStart(todo_useSpecificType: string): void;
  SetupFakeReels(reels: Reels): void;
  StartReeling(): void;
  StartFastReelingStop(): void;
  StartNormalReelingStop(reelIdx: number): void;
  StartFastReelStop(reelIdx: number): void;
  SetStopFigures(symbolGrid: SymbolGrid): void;
  SetSymbolsAroundStop(before: SymbolGrid, after: SymbolGrid): void;
  SetReelTags(reelIdx: number, tags: ERoundTags[]): void;
  ShowStopFigures(): void;
  ShowSymbolsExpanding(symbolGrid: SymbolGrid, expanded: SymbolGrid): void;
  ClearExpandSymbols(): void;
  ShowHoldAndSpinPhase(symbolGrid: SymbolGrid, holded: SymbolGrid): void;
  ClearHoldAndSpinSymbols(): void;
  ShowCombinations(combinations: ReelCombinations | SymbolViewInfos): void;
  ClearCombinations(): void;
}

export class IReelsViewEvents extends IControlViewEvents {
  readonly singleReelStopEvent = new Event<[number, number[]]>();
  readonly allReelsStopEvent = new Event();
  readonly startReelingEvent = new Event();
  readonly singleReelStopRequest = new Event<[number]>();
  readonly symbolsExpanded = new Event();
  readonly holdAndSpinFinished = new Event();
}

export const IReelsView = Interface<IReelsView, IReelsViewEvents>('IReelsView');
