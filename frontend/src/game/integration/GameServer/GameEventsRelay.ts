// The GameEventsRelay module of the Play page (browser only, no C++ counterpart): what the game does that its debug
// tools follow, told to the game server, which passes it on to the tools' other windows (the Game tools page, whose
// RemoteGame posts it there). These are the events the RNG Picker's Tab Sync follows (AlphaFamilyMathRngTool: a round
// starting, a round ended, the buttons that enter the wheel and the gamble), with what it reads of the gameflow when they
// come: whether the game is idle, the round it plays next, the match's currencies.

import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import { ICashoutHwButton, IGambleHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { IGameflowIntegration } from '@game/integration/Runtime/IGameflowIntegration';
import { type GameEventName, type GameServer, IGameServer } from './GameServer';

export class GameEventsRelay extends BaseModule {
  private m_server: GameServer | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.m_server = this.RuntimeTryGet(IGameServer) ?? null;
    return true;
  }

  /** After the views' modules, as AlphaFamilyMathRngTool: the software buttons' events are theirs. */
  PostInit() {
    if (!super.PostInit()) return false;
    if (!this.m_server) return true;

    const gameflowEvents = this.RuntimeGetConst(IGameflowIntegration.Events);
    gameflowEvents.roundStarting.RegisterInstant(this, roundType => this.Post('roundStarting', roundType));
    gameflowEvents.roundEnded.RegisterInstant(this, roundType => this.Post('roundEnded', roundType));
    this.RuntimeTryGetConst(ITakeCoinsSwButtonView.Events)?.buttonPressedEvent.RegisterInstant(this, () => this.Post('takeCoinsPressed'));
    this.RuntimeTryGetConst(ICashoutHwButton.Events)?.buttonPressedEvent.RegisterInstant(this, () => this.Post('cashoutPressed'));
    this.RuntimeTryGetConst(IGambleHwButton.Events)?.buttonPressedEvent.RegisterInstant(this, () => this.Post('gamblePressed'));
    return true;
  }

  Deinit() {
    const gameflowEvents = this.RuntimeTryGetConst(IGameflowIntegration.Events);
    gameflowEvents?.roundStarting.Unregister(this);
    gameflowEvents?.roundEnded.Unregister(this);
    this.RuntimeTryGetConst(ITakeCoinsSwButtonView.Events)?.buttonPressedEvent.Unregister(this);
    this.RuntimeTryGetConst(ICashoutHwButton.Events)?.buttonPressedEvent.Unregister(this);
    this.RuntimeTryGetConst(IGambleHwButton.Events)?.buttonPressedEvent.Unregister(this);
    this.m_server = null;
    super.Deinit();
  }

  private Post(event: GameEventName, roundType: GameRoundType = 0) {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const idle = gameflow.IsIdle();
    this.m_server!.PostGameEvent({
      event, roundType, idle,
      nextRoundType: idle ? 0 : gameflow.GetNextRoundType(),
      currencies: idle ? [] : [...gameflow.GetMatchCurrenciesAvailable()],
    });
  }
}
