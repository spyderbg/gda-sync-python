// Egt::Game::AlphaFamily::MenuView (AlphaFamilyVideoCtrl/Components/MenuView.h/.cpp): the opening and closing of a
// menu, which a menu view owns: its open and close actions (tweeny), their sounds, the menu's state, and the events
// menuOpening/menuOpened and menuClosing/menuClosed. An opened menu closes after 5 seconds without a touch.

import { IAudioApi } from '../../../../engine/Game/RuntimeImport/IAudioApi';
import { RuntimeHolder, type Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import { Stopwatch } from '../../../../engine/GameCore/Tools/Timers';
import { type Position, Sequence, type TweenAction, ValueFromTo } from '../../../../engine/GameCore/Tools/Tweeny';
import type { IMenuView, IMenuViewEvents } from '../../AlphaFamily/Views/BaseInterfaces/IControlView';

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
  private readonly m_pos: Position = { x: 0, y: 0 };
  private m_timerOpened = new Stopwatch();
  private m_actionOpen: TweenAction | null = null;
  private m_actionClose: TweenAction | null = null;
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
    this.m_actionOpen?.Stop();
    this.m_actionClose?.Stop();
    this.SetRuntime(null);
  }

  /** Moves the menu's position from closed to opened, and back. */
  SetupAnimsMove(closedPos: Position, openedPos: Position, duration: number) {
    const move = (from: Position, to: Position) => Sequence(
      ValueFromTo(() => Object.assign(this.m_pos, from), 0, 1, 0),
      ValueFromTo(t => Object.assign(this.m_pos, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }), 0, 1, duration),
    );
    this.SetupAnims(move(closedPos, openedPos), move(openedPos, closedPos));
    Object.assign(this.m_pos, closedPos);
  }

  SetupAnims(open: TweenAction, close: TweenAction) {
    this.m_actionOpen = open.OnEnd(() => {
      this.m_state = EState.Opened;
      this.m_events.menuOpened.Post();
      this.m_timerOpened.Reset();
    });
    this.m_actionClose = close.OnEnd(() => {
      this.m_state = EState.Closed;
      this.m_events.menuClosed.Post();
    });
  }

  SetupSounds(openingSoundRssId: string, closingSoundRssId: string) {
    this.m_openSoundId = openingSoundRssId;
    this.m_closeSoundId = closingSoundRssId;
  }

  Process() {
    const now = performance.now();
    this.m_actionOpen?.Process(now);
    this.m_actionClose?.Process(now);
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
    this.Start(this.m_actionOpen, EState.Opened, this.m_events.menuOpened);
    if (this.m_openSoundId) this.RuntimeGet(IAudioApi).Play(this.m_openSoundId);
  }

  CloseMenu() {
    if (this.m_state !== EState.Opened) return;
    this.m_state = EState.Closing;
    this.m_events.menuClosing.Post();
    this.Start(this.m_actionClose, EState.Closed, this.m_events.menuClosed);
    if (this.m_closeSoundId) this.RuntimeGet(IAudioApi).Play(this.m_closeSoundId);
  }

  // A menu without actions (an empty tweeny action) opens and closes at once.
  private Start(action: TweenAction | null, end: EState, ended: { Post(): void }) {
    if (action) {
      action.Start();
      return;
    }
    this.m_state = end;
    ended.Post();
    if (end === EState.Opened) this.m_timerOpened.Reset();
  }
}
