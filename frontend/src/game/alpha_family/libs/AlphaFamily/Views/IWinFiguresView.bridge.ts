// Egt::Game::AlphaFamily::IWinFiguresView (AlphaFamily/Views/IWinFiguresView.bridge.h).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { SymbolViewInfos } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IWinFiguresView extends IControlView {
  ShowCombinations(combinations: ReelCombinations, playFromLoop: boolean): void;
  ShowWinFigures(infos: SymbolViewInfos): void;
  ShowComets(infos: SymbolViewInfos): void;
  RequestFastForwardComets(): void;
  SetStackedFigures(infos: SymbolViewInfos): void;
  ClearFigures(): void;
  PauseAnimations(): void;
  ResumeAnimations(): void;
}

export class IWinFiguresViewEvents extends IControlViewEvents {
  readonly animatingDone = new Event();
  readonly cometsAnimDone = new Event();
}

export const IWinFiguresView = Interface<IWinFiguresView, IWinFiguresViewEvents>('IWinFiguresView');
