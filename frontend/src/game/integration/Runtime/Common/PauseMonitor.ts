// Egt::Integration::PauseMonitor (integration/libs/src/Egt/Integration/Runtime/Common/PauseMonitor.h/.cpp): the game
// pause an integration owns. It provides Game::IPause (and its events) for the game, and IPauseControl for whoever pauses
// it: the platform (the kernel's suspend and resume), a blocking message, a debug tool, QA. The game is paused from the
// first reason held to the last one released: the game Clock stops, and IPause posts paused, then resumed.

import { Clock } from '@game/engine/Game/Utils/Clock';
import { IMessageBoard } from '@game/engine/Game/RuntimeImport/IMessageBoard';
import { IPause, IPauseEvents } from '@game/engine/Game/RuntimeImport/IPause';
import { EgtAInfo, EgtALogCategoryClass, EgtAWarning } from '@game/engine/GameCore/Log/LogCategory';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IKernelIntegration } from '@game/integration/BrowserKernel/IKernelIntegration';
import { IPauseControl, PauseReason } from '@game/integration/Runtime/IPauseControl';

export class PauseMonitor extends RuntimeHolder implements IPause, IPauseControl {
  private readonly m_events = new IPauseEvents();
  /** The owner of its callbacks (C++'s m_sentinel). */
  private m_sentinel: object | null = null;

  private m_initialized = false;
  private m_subscribed = false;

  private readonly m_reasons = new Set<PauseReason>();

  Init(runtime: Runtime) {
    if (this.m_initialized) return false;

    this.m_sentinel = {};

    this.SetRuntime(runtime);

    this.RuntimeAdd(IPause, this);
    this.RuntimeAdd(IPause.Events, this.m_events);
    this.RuntimeAdd(IPauseControl, this);

    this.m_initialized = true;
    return true;
  }

  PostInit() {
    if (!this.m_initialized) return;
    if (this.m_subscribed) return;
    const sentinel = this.m_sentinel!;

    const kernelEvents = this.RuntimeTryGetConst(IKernelIntegration.Events);
    if (kernelEvents) {
      kernelEvents.suspendRequested.RegisterInstant(sentinel, name => {
        EgtAInfo('the platform suspends the game ({})', name);
        this.Request(PauseReason.Platform);
      });
      kernelEvents.resumeRequested.RegisterInstant(sentinel, name => {
        EgtAInfo('the platform resumes the game ({})', name);
        this.Release(PauseReason.Platform);
      });
    }

    const msgBoardEvents = this.RuntimeTryGet(IMessageBoard.Events);
    if (msgBoardEvents) {
      msgBoardEvents.onBlocking.RegisterInstant(sentinel, () => {
        EgtAInfo('message board suspends the game');
        this.Request(PauseReason.Message);
      });
      msgBoardEvents.onBlockingRemoved.RegisterInstant(sentinel, () => {
        EgtAInfo('message board resumes the game');
        this.Release(PauseReason.Message);
      });
    }

    this.m_subscribed = true;
  }

  Deinit() {
    if (!this.m_initialized) return;

    if (this.m_reasons.size) {
      this.m_reasons.clear();
      Clock.SetPaused(false);
    }

    const sentinel = this.m_sentinel!;
    const kernelEvents = this.RuntimeTryGetConst(IKernelIntegration.Events);
    kernelEvents?.suspendRequested.Unregister(sentinel);
    kernelEvents?.resumeRequested.Unregister(sentinel);
    const msgBoardEvents = this.RuntimeTryGet(IMessageBoard.Events);
    msgBoardEvents?.onBlocking.Unregister(sentinel);
    msgBoardEvents?.onBlockingRemoved.Unregister(sentinel);

    this.RuntimeRemove(IPause);
    this.RuntimeRemove(IPause.Events);
    this.RuntimeRemove(IPauseControl);

    this.m_sentinel = null;
    this.m_subscribed = false;
    this.m_initialized = false;
    this.SetRuntime(null);
  }

  // IPause

  IsPaused() {
    return this.m_reasons.size > 0;
  }

  // IPauseControl

  Request(reason: PauseReason) {
    if (this.m_reasons.has(reason)) return;
    this.m_reasons.add(reason);

    EgtAInfo('pause requested: {} (held: {})', PauseReason[reason], this.m_reasons.size);
    if (this.m_reasons.size !== 1) return;

    Clock.SetPaused(true);
    this.m_events.paused.Post();
  }

  Release(reason: PauseReason) {
    if (!this.m_reasons.delete(reason)) {
      EgtAWarning('pause released but not held: {}', PauseReason[reason]);
      return;
    }

    EgtAInfo('pause released: {} (held: {})', PauseReason[reason], this.m_reasons.size);
    if (this.m_reasons.size !== 0) return;

    Clock.SetPaused(false);
    this.m_events.resumed.Post();
  }

  IsHeld(reason: PauseReason) {
    return this.m_reasons.has(reason);
  }
}

EgtALogCategoryClass(PauseMonitor, 'PauseMonitor');
