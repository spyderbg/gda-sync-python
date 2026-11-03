// The game server (the backend's egt_gda_sync/game/rng_server.py), as the browser game and its tools talk to it: no C++
// counterpart. The browser game is a server based game: the server deals each round's random numbers (the kernel's
// RequestRandoms, as a cabinet's kernel deals them to the C++ game), and keeps the RNG Queue, which every window of the
// game's tools reads and changes; when the game starts a round of the first queued sequence's type, the server deals the
// round that sequence. The server also passes on to the tools' other windows what the game did that they follow
// (GameEvent).
//
// What a window asks the server goes out, and its answer is handled, in order, one at a time, as messages on one
// connection: a sequence queued before START is in the queue when the round asks for its sequence, and a round's
// sequence has come before its random numbers. A round's request the server does not answer is asked again, every
// second: the round waits for its numbers, as a game waits for its server.

import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import type { RngNumber } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

/** A sequence of the server's RNG Queue: its id there, its round type, its name (a scenario's is tagged) and numbers. */
export interface QueuedRngSequence {
  id: number;
  roundType: GameRoundType;
  name: string;
  sequence: RngNumber[];
}

/** The server's RNG Queue, and its revision, which moves on with each change. */
export interface RngQueueState {
  revision: number;
  queue: QueuedRngSequence[];
}

export type GameEventName = 'roundStarting' | 'roundEnded' | 'takeCoinsPressed' | 'cashoutPressed' | 'gamblePressed';

/** What the game did that its tools follow, and what they read of the gameflow then. */
export interface GameEvent {
  event: GameEventName;
  roundType: GameRoundType;
  idle: boolean;
  nextRoundType: GameRoundType;
  /** The match's currencies available, as (currency, amount) pairs. */
  currencies: [number, number][];
}

export interface PostedGameEvent extends GameEvent {
  id: number;
}

/** How a page reaches the backend: a request to an /api/ path, with its session (the page's api()). */
export type GameServerSend = <T>(path: string, method: 'GET' | 'POST', body?: unknown) => Promise<T>;

interface ServerState {
  server: string;
  /** The workspace active in the app now. */
  active: string;
  revision: number;
  queue?: QueuedRngSequence[];
  events: PostedGameEvent[];
}

const POLL_MS = 400;
const RETRY_MS = 1000;

export class GameServer {
  private requests: Promise<void> = Promise.resolve();
  private eventPosts: Promise<void> = Promise.resolve();
  /** The requests that change the queue, sent or waiting to be: a poll answered meanwhile may be older than them. */
  private pending = 0;
  /** Moves on with each queue the server answered: a poll sent before one of them is older than it. */
  private queueChanges = 0;
  private queueState: RngQueueState = { revision: -1, queue: [] };
  /** The server's instance: when the backend restarts, its queue and events start anew. */
  private instance = '';
  private lastEvent: number | null = null;
  private readonly eventListeners = new Set<(events: PostedGameEvent[]) => void>();
  private timer = 0;
  private polling = false;
  private stopped = false;
  /** The workspace active in the app, as the server last told it: a page of another workspace's game follows it. */
  activeWorkspace = '';
  /** Why the server did not answer the last request, until it answers again. */
  error = '';
  /** Called when the server stops answering (with why), and when it answers again (with ''). */
  onError: ((message: string) => void) | null = null;

  /** The server of the game of a workspace: the page's game. */
  constructor(private readonly send: GameServerSend, readonly workspace: string) {}

  /** Follows the server's queue and the game's events while the page shows the game or its tools. */
  Start() {
    this.stopped = false;
    if (!this.timer) this.timer = window.setInterval(() => void this.Poll(), POLL_MS);
    void this.Poll();
  }

  Stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.eventListeners.clear();
  }

  /** The RNG Queue as the server last told it: a new object each time it changed. */
  GetQueue(): RngQueueState {
    return this.queueState;
  }

  /** Calls the listener with the game's events as they come (the newest one first, when it was posted before). */
  OnGameEvents(listener: (events: PostedGameEvent[]) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The RNG Queue
  ////////////////////////////////////////////////////////////////////////////////

  AddRngSequences(sequences: { roundType: GameRoundType; name: string; sequence: RngNumber[] }[]) {
    this.QueueRequest('game/rng/queue', { sequences: sequences.map(item => ({ ...item, sequence: item.sequence.map(({ op, range, value }) => ({ op, range, value })) })) });
  }

  DeleteRngSequence(id: number) {
    this.QueueRequest('game/rng/queue/delete', { id });
  }

  /** Moves a sequence before another, or to the end (before: null). */
  MoveRngSequence(id: number, before: number | null) {
    this.QueueRequest('game/rng/queue/move', before === null ? { id } : { id, before });
  }

  ClearRngSequences() {
    this.QueueRequest('game/rng/queue/clear', {});
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The game's rounds
  ////////////////////////////////////////////////////////////////////////////////

  /** A round starts: the server deals it the queue's first sequence when it is of the round's type (null: none). */
  StartRound(roundType: GameRoundType, handle: (sequence: RngNumber[] | null) => void) {
    this.pending++;
    this.Request<RngQueueState & { sequence: { name: string; sequence: RngNumber[] } | null }>('game/rng/round', { roundType }, reply => {
      this.pending--;
      this.SetQueue(reply);
      handle(reply.sequence?.sequence ?? null);
    }, true);
  }

  /** Random 32-bit numbers the server deals the round. */
  Randoms(count: number, handle: (randoms: number[]) => void) {
    this.Request<{ randoms: number[] }>('game/rng/randoms', { count }, reply => handle(reply.randoms), true);
  }

  /** Tells the server what the game did that its tools follow, in order, without holding up the rounds. */
  PostGameEvent(event: GameEvent) {
    this.eventPosts = this.eventPosts
      .then(() => this.send(this.Path('game/rng/events'), 'POST', event))
      .then(() => this.Answered(), error => console.warn(`The game server did not take the game's ${event.event}: ${(error as Error).message}`));
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The connection
  ////////////////////////////////////////////////////////////////////////////////

  private QueueRequest(path: string, body: unknown) {
    this.pending++;
    this.Request<RngQueueState>(path, body, reply => {
      this.pending--;
      this.SetQueue(reply);
    }, false, () => this.pending--);
  }

  /** A request after those asked before it; its answer is handled before the next goes out. A round's request is asked
   * again until the server answers it. */
  private Request<T>(path: string, body: unknown, handle: (reply: T) => void, retry: boolean, failed?: () => void) {
    const attempt = async () => {
      for (;;) {
        try {
          const reply = await this.send<T>(this.Path(path), 'POST', body);
          this.Answered();
          return reply;
        } catch (error) {
          this.Failed(error as Error);
          if (!retry || this.stopped) throw error;
          await new Promise(resolve => window.setTimeout(resolve, RETRY_MS));
        }
      }
    };
    this.requests = this.requests.then(attempt).then(handle, () => failed?.()).catch(error => console.error(error));
  }

  /** A path of the server's, for the page's game. */
  private Path(path: string) {
    return `${path}?${new URLSearchParams({ workspace: this.workspace })}`;
  }

  private SetQueue(state: RngQueueState) {
    this.queueChanges++;
    this.queueState = { revision: state.revision, queue: state.queue };
  }

  private async Poll() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    const changes = this.queueChanges;
    try {
      const query = new URLSearchParams({ workspace: this.workspace });
      if (this.queueState.revision >= 0) query.set('revision', String(this.queueState.revision));
      if (this.lastEvent !== null) query.set('after', String(this.lastEvent));
      const state = await this.send<ServerState>(`game/rng?${query}`, 'GET');
      this.Answered();
      this.activeWorkspace = state.active;
      if (state.server !== this.instance) {
        // a new server (the backend restarted): its queue and events start anew
        const restarted = this.instance !== '';
        this.instance = state.server;
        if (restarted) {
          this.lastEvent = null;
          this.queueState = { revision: -1, queue: [] };
          this.queueChanges++;
          return;
        }
      }
      if (state.queue && !this.pending && changes === this.queueChanges) this.SetQueue({ revision: state.revision, queue: state.queue });
      const last = state.events[state.events.length - 1];
      this.lastEvent = last?.id ?? this.lastEvent ?? 0;
      if (state.events.length) for (const listener of [...this.eventListeners]) listener(state.events);
    } catch (error) {
      this.Failed(error as Error);
    } finally {
      this.polling = false;
    }
  }

  private Answered() {
    if (!this.error) return;
    this.error = '';
    this.onError?.('');
  }

  private Failed(error: Error) {
    const message = error.message || String(error);
    if (this.error === message) return;
    this.error = message;
    console.warn(`The game server: ${message}`);
    this.onError?.(message);
  }
}

/** The game server of the page (GameApp adds it to the runtime): the browser game's own, no C++ interface. */
export const IGameServer = Interface<GameServer>('IGameServer');
