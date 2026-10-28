// Egt::Game::AlphaFamily::IFreeRoundRetriggerView (AlphaFamily/Views/IFreeRoundRetriggerView.bridge.h).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IFreeRoundRetriggerView {
  ShowRetriggerScreen(freeRoundsCount: number): void;
  Clear(): void;
}

export class IFreeRoundRetriggerViewEvents {
  readonly retriggerFinished = new Event();
}

export const IFreeRoundRetriggerView = Interface<IFreeRoundRetriggerView, IFreeRoundRetriggerViewEvents>('IFreeRoundRetriggerView');
