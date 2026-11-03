// The RemoteGame module of the Game tools page (browser only, no C++ counterpart): the game that plays in another
// window, as the debug tools of this one follow it. The game's GameEventsRelay tells the game server what the game does
// that the tools follow; this module gets it from the server and posts it here, through the interfaces the tools
// register on in the game: the gameflow's round events (IGameflowIntegration::Events), the gameflow's state when they
// came (IGameflow: whether it is idle, the round it plays next, the match's currencies) and the buttons that enter the
// wheel and the gamble. So the RNG Picker's Tab Sync shows here the round the game plays next.

import { Currencies, type GameRoundType } from '@game/engine/Game/Math/Common.data';
import { ICashoutHwButton, IGambleHwButton, IHwButtonEvents } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { IGameflowIntegration, IGameflowIntegrationEvents } from '@game/integration/Runtime/IGameflowIntegration';
import { IGameServer, type PostedGameEvent } from './GameServer';

/** What the tools read of the gameflow that plays in the other window, as it was at its last event. */
interface RemoteGameflowState {
  idle: boolean;
  nextRoundType: RoundType;
  currencies: Currencies;
}

export class RemoteGame extends BaseModule {
  private readonly m_gameflowEvents = new IGameflowIntegrationEvents();
  private readonly m_takeCoinsButtonEvents = new IButtonViewEvents();
  private readonly m_cashoutButtonEvents = new IHwButtonEvents();
  private readonly m_gambleButtonEvents = new IHwButtonEvents();
  private m_state: RemoteGameflowState = { idle: true, nextRoundType: RoundType.Undefined, currencies: new Currencies() };
  private m_unsubscribe: (() => void) | null = null;
  /** When the game last did something the tools follow, and what (the page shows it). */
  lastEvent: PostedGameEvent | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    const state = () => this.m_state;
    // only what the tools read of the gameflow
    const gameflow: Pick<IGameflow, 'IsIdle' | 'GetNextRoundType' | 'GetMatchCurrenciesAvailable'> = {
      IsIdle: () => state().idle,
      GetNextRoundType: () => state().nextRoundType,
      GetMatchCurrenciesAvailable: () => state().currencies.Clone(),
    };
    this.RuntimeAdd(IGameflow, gameflow as IGameflow);
    this.RuntimeAdd(IGameflowIntegration.Events, this.m_gameflowEvents);
    this.RuntimeAdd(ITakeCoinsSwButtonView.Events, this.m_takeCoinsButtonEvents);
    this.RuntimeAdd(ICashoutHwButton.Events, this.m_cashoutButtonEvents);
    this.RuntimeAdd(IGambleHwButton.Events, this.m_gambleButtonEvents);
    return true;
  }

  PostInit() {
    if (!super.PostInit()) return false;
    this.m_unsubscribe = this.RuntimeTryGet(IGameServer)?.OnGameEvents(events => {
      for (const event of events) this.Replay(event);
    }) ?? null;
    return true;
  }

  Deinit() {
    this.m_unsubscribe?.();
    this.m_unsubscribe = null;
    for (const token of [IGameflow, IGameflowIntegration.Events, ITakeCoinsSwButtonView.Events, ICashoutHwButton.Events, IGambleHwButton.Events]) {
      this.RuntimeRemove(token);
    }
    super.Deinit();
  }

  /** An event of the game, posted here as the game posted it, after the gameflow's state it came with. */
  private Replay(event: PostedGameEvent) {
    this.lastEvent = event;
    this.m_state = { idle: event.idle, nextRoundType: event.nextRoundType as RoundType, currencies: Currencies.From(event.currencies) };
    const roundType: GameRoundType = event.roundType;
    switch (event.event) {
      case 'roundStarting': this.m_gameflowEvents.roundStarting.Post(roundType); break;
      case 'roundEnded': this.m_gameflowEvents.roundEnded.Post(roundType); break;
      case 'takeCoinsPressed': this.m_takeCoinsButtonEvents.buttonPressedEvent.Post(); break;
      case 'cashoutPressed': this.m_cashoutButtonEvents.buttonPressedEvent.Post(); break;
      case 'gamblePressed': this.m_gambleButtonEvents.buttonPressedEvent.Post(); break;
      default: break;
    }
  }
}
