// Egt::Game::AlphaFamily::MenuView (AlphaFamilyVideoCtrl/Components/MenuView.h/.cpp): the opening and closing of a
// menu, which a menu view owns: its open and close actions (tweeny), their sounds, the menu's state, and the events
// menuOpening/menuOpened and menuClosing/menuClosed. An opened menu closes after 5 seconds without a touch.

import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { make_sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { IMenuView, IMenuViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';

interface Position {
  x: number;
  y: number;
}

const OpenedTimeoutMs = 5000;

export enum EState {
  None = 0,
  Opening,
  Opened,
  Closing,
  Closed,
}

export class MenuView extends RuntimeHolder implements IMenuView {
  private m_state = EState.Closed;
  private m_pos: Position = { x: 0, y: 0 };
  private m_timerOpened = new Stopwatch();
  private m_sentinel = make_sentinel();
  private m_actionOpen = new tweeny.tween_action();
  private m_actionClose = new tweeny.tween_action();
  private m_openSoundId = '';
  private m_closeSoundId = '';

  constructor(private readonly m_events: IMenuViewEvents) {
    super();
  }

  Init(runtime: Runtime) {
    this.SetRuntime(runtime);
    return true;
  }

  Deinit() {
    this.m_timerOpened.Reset();
    tweeny.stop(this.m_actionOpen);
    tweeny.stop(this.m_actionClose);
    this.SetRuntime(null);
  }

  /** Moves the menu's position from closed to opened, and back. */
  SetupAnimsMove(closedPos: Position, openedPos: Position, duration: number) {
    this.m_sentinel = make_sentinel();
    const pos = tweeny.ref<Position>(this, 'm_pos');
    this.m_actionOpen = tweeny.sequence(tweeny.tween_to(pos, closedPos, 0, this.m_sentinel), tweeny.tween_to(pos, openedPos, duration, this.m_sentinel));
    this.m_actionOpen.on_end.connect(() => {
      this.m_state = EState.Opened;
      this.m_events.menuOpened.Post();
      this.m_timerOpened.Reset();
    });
    this.m_actionClose = tweeny.sequence(tweeny.tween_to(pos, openedPos, 0, this.m_sentinel), tweeny.tween_to(pos, closedPos, duration, this.m_sentinel));
    this.m_actionClose.on_end.connect(() => {
      this.m_state = EState.Closed;
      this.m_events.menuClosed.Post();
    });
    this.m_pos = { ...closedPos };
  }

  SetupAnims(open: tweeny.tween_action, close: tweeny.tween_action) {
    this.m_sentinel = make_sentinel();
    this.m_actionOpen = open;
    this.m_actionOpen.on_end.connect(() => {
      this.m_state = EState.Opened;
      this.m_events.menuOpened.Post();
      this.m_timerOpened.Reset();
    });
    this.m_actionClose = close;
    this.m_actionClose.on_end.connect(() => {
      this.m_state = EState.Closed;
      this.m_events.menuClosed.Post();
    });
  }

  SetupSounds(openingSoundRssId: string, closingSoundRssId: string) {
    this.m_openSoundId = openingSoundRssId;
    this.m_closeSoundId = closingSoundRssId;
  }

  Process() {
    if (this.IsOpened() && this.m_timerOpened.Measure() > OpenedTimeoutMs) this.CloseMenu();
  }

  IsOpened() {
    return this.m_state === EState.Opened;
  }

  IsClosed() {
    return this.m_state === EState.Closed;
  }

  GetState() {
    return this.m_state;
  }

  GetPos(): Readonly<Position> {
    return this.m_pos;
  }

  ResetOpenTimer() {
    this.m_timerOpened.Reset();
  }

  OpenMenu() {
    this.ResetOpenTimer();
    if (this.m_state !== EState.Closed) return;
    this.m_state = EState.Opening;
    this.m_events.menuOpening.Post();
    tweeny.start(this.m_actionOpen, 'MenuView:Open');
    if (this.m_openSoundId) this.RuntimeGet(IAudioApi).Play(this.m_openSoundId);
  }

  CloseMenu() {
    if (this.m_state !== EState.Opened) return;
    this.m_state = EState.Closing;
    this.m_events.menuClosing.Post();
    tweeny.start(this.m_actionClose, 'MenuView:Close');
    if (this.m_closeSoundId) this.RuntimeGet(IAudioApi).Play(this.m_closeSoundId);
  }
}
