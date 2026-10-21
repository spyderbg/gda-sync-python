// Egt::Fsm: a hierarchical state machine (State.h, Machine.h, MachineImpl.cpp, FsmBuilder).
//
// The machine is a tree of states built by FsmBuilder (see BurningCrownTetraSpins10Fsm). The active states are a path
// from the root: each state's first child is its default, so entering a state enters its default descendants.
// - Transit(target) leaves the active states below the reacting state's branch that diverges from the target's path and
//   enters the target's path, calling OnTransit on each entered state from the root down.
// - ReactOn(event, handler) makes the state react to an event while it is active. An event is dispatched from the
//   deepest active state up: Consume stops, Forward and Skip continue, Reject stops, and a Transit stops and transits.
// - Parent(I) is the nearest active ancestor that implements interface I (by the tokens in its static Interfaces).
// - Nvram(T) is a state's storage of type T (static Nvrams), found in the state or its ancestors; Static(T) is a
//   machine-wide object of type T (static Statics). Nvrams are what a recovery restores in C++.
// - Each transition records its source, the function that asked for it and where (C++'s std::source_location default
//   argument of Transit, which the GameFsmViewer shows): here read from the call stack, a position in the script that
//   app/SourceLocation maps back to the TypeScript.

import { Event, EventQueue } from '@game/engine/Core/Event';
import { Runtime, RuntimeHolder, RuntimeToken } from '@game/engine/GameCore/RuntimeAccess';

type Target = RuntimeToken<unknown> | string;
type DataClass<T = object> = new () => T;
export type StateClass = (new () => State) & { Interfaces?: RuntimeToken<unknown>[]; Nvrams?: DataClass[]; Statics?: DataClass[] };

/** Where a transition was asked for: the function that called Transit or TransitLater, the state it was called on, and
 * the call's position in its script (file is the script's URL; line and column count from 1), if the stack has it. */
export interface TransitSource {
  function: string;
  state: string;
  file: string;
  line: number;
  column: number;
}

interface Frame {
  function: string;
  file: string;
  line: number;
  column: number;
}

/** A call stack frame, in V8's or Firefox's format. The function name is without its class: V8 qualifies a method with
 * its receiver's class name (mangled in the build), Firefox names a nested function outer/inner<. */
function ParseFrame(frame: string): Frame {
  const name = /^\s+at\s+(?:async\s+)?(?:new\s+)?([^\s(]+)(?:\s+\[as [^\]]+\])?\s+\(/.exec(frame)?.[1] ?? /^([^@]*)@/.exec(frame)?.[1] ?? '';
  const location = /(?:\(|\s|@)([^\s(@]+):(\d+):(\d+)\)?$/.exec(frame);
  return {
    function: name.replace(/[/<].*$/, '').split('.').pop() ?? '',
    file: location?.[1] ?? '', line: Number(location?.[2] ?? 0), column: Number(location?.[3] ?? 0),
  };
}

/** The frame of the function that called Transit or TransitLater, from the call stack. */
function CallerFrame(): Frame | undefined {
  const frames = (new Error().stack ?? '').split('\n').filter(line => /^\s+at\s|@/.test(line)).map(ParseFrame);
  const transit = frames.findIndex(frame => frame.function === 'Transit' || frame.function === 'TransitLater');
  return transit >= 0 ? frames[transit + 1] : undefined;
}

function SourceOf(state: State): TransitSource {
  const frame = CallerFrame();
  return { function: frame?.function || 'anonymous', state: state.node?.name ?? '', file: frame?.file ?? '', line: frame?.line ?? 0, column: frame?.column ?? 0 };
}

export class Reaction {
  constructor(readonly kind: 'consume' | 'forward' | 'skip' | 'reject' | 'transit', readonly target: Target | null = null,
    readonly source: TransitSource | null = null) {}
}

export class State extends RuntimeHolder {
  static Interfaces: RuntimeToken<unknown>[] = [];
  static Nvrams: DataClass[] = [];
  static Statics: DataClass[] = [];

  /** Set by the machine when it enters the state. */
  machine!: Machine;
  node!: StateNode;

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {}

  Transit(target: Target): Reaction {
    return new Reaction('transit', target, SourceOf(this));
  }

  // Consume: event handled, stop propagation
  Consume() {
    return new Reaction('consume');
  }

  // Forward: event handled, propagate to parent
  Forward() {
    return new Reaction('forward');
  }

  // Skip: event unhandled, propagate to parent
  Skip() {
    return new Reaction('skip');
  }

  // Reject: event unhandled, stop propagation
  Reject() {
    return new Reaction('reject');
  }

  /** Transits once the current event is handled: on the machine's next queue execution. */
  TransitLater(target: Target | Reaction) {
    const resolved = target instanceof Reaction ? target.target : target;
    if (!resolved) return;
    const source = (target instanceof Reaction ? target.source : null) ?? SourceOf(this);
    const machine = this.machine;
    const node = this.node;
    machine.queue.AddCallback(() => machine.TransitFrom(node, resolved, source));
  }

  ReactOn<A extends unknown[]>(event: Event<A>, handler: (...args: NoInfer<A>) => Reaction) {
    this.machine.ReactOn(this, event as unknown as Event<unknown[]>, handler.bind(this) as (...args: unknown[]) => Reaction);
  }

  Nvram<T extends object>(type: DataClass<T>): T {
    return this.machine.FindNvram(this, type);
  }

  ConstNvram<T extends object>(type: DataClass<T>): T {
    return this.Nvram(type);
  }

  Static<T extends object>(type: DataClass<T>): T {
    return this.machine.FindStatic(type);
  }

  ConstStatic<T extends object>(type: DataClass<T>): T {
    return this.Static(type);
  }

  Parent<T>(token: RuntimeToken<T>): T {
    const parent = this.machine.FindIface(this, token);
    if (parent === undefined) throw new Error(`${this.node.name}: missing parent ${token.name}`);
    return parent;
  }

  ConstParent<T>(token: RuntimeToken<T>): T {
    return this.Parent(token);
  }

  HasParent(token: RuntimeToken<unknown>) {
    return this.machine.FindIface(this, token) !== undefined;
  }
}

export interface StateNode {
  name: string;
  type: StateClass;
  children: StateNode[];
}

/** FsmBuilder::Node<T>(name, children): a state of the machine's tree. */
export function Node(type: StateClass, name: string, children: StateNode[] = []): StateNode {
  return { name, type, children };
}

interface StateCtx {
  node: StateNode;
  instance: State;
  nvrams: Map<DataClass, object>;
  handlers: Map<Event<unknown[]>, (...args: unknown[]) => Reaction>;
}

export interface TransitionRecord {
  from: string;
  to: string;
  destroyed: string[];
  created: string[];
  source: TransitSource;
  time: number;
}

export class Machine {
  readonly queue = new EventQueue();
  private readonly constructPaths = new Map<StateNode, StateNode[]>();
  private readonly nodesByName = new Map<string, StateNode>();
  private readonly nodesByInterface = new Map<RuntimeToken<unknown>, StateNode>();
  private readonly statics = new Map<DataClass, object>();
  private readonly registeredEvents = new Set<Event<unknown[]>>();
  private current: StateCtx[] = [];
  private runtime: Runtime | null = null;
  /** The latest transitions, newest last, for the game's debug panel. */
  readonly transitions: TransitionRecord[] = [];
  onTransition: ((record: TransitionRecord) => void) | null = null;

  constructor(readonly root: StateNode) {
    this.tracePath(root, [], true);
  }

  Init(runtime: Runtime) {
    this.runtime = runtime;
    for (const node of this.nodesByName.values()) {
      for (const type of node.type.Statics ?? []) if (!this.statics.has(type)) this.statics.set(type, new type());
    }
    this.transit(this.root, this.root, true, false, { function: 'Start', state: '', file: '', line: 0, column: 0 });
  }

  Deinit() {
    this.current = [];
    this.queue.Clear();
  }

  /** Executes the queued event callbacks; returns whether any ran. */
  Process() {
    return this.queue.ExecuteAllCallbacks() > 0;
  }

  /** The active states, root first. */
  ActiveStates() {
    return this.current.map(ctx => ctx.node.name);
  }

  Dump() {
    return `Fsm::Machine(${this.ActiveStates().join('->')})`;
  }

  NodeByName(name: string) {
    return this.nodesByName.get(name);
  }

  // Building

  private tracePath(node: StateNode, path: [StateNode, boolean][], isDefault: boolean) {
    if (this.nodesByName.has(node.name)) throw new Error(`Duplicate state ${node.name}`);
    this.nodesByName.set(node.name, node);
    for (const token of node.type.Interfaces ?? []) {
      if (!this.nodesByInterface.has(token)) this.nodesByInterface.set(token, node);
    }
    path.push([node, isDefault]);
    if (node.children.length === 0) {
      // Every node on the path that is the default of its parent constructs this whole path.
      const nodes = path.map(([pathNode]) => pathNode);
      for (let i = path.length - 1; i >= 0; i--) {
        this.constructPaths.set(path[i][0], nodes);
        if (!path[i][1]) break;
      }
    } else {
      node.children.forEach((child, index) => this.tracePath(child, path, index === 0));
    }
    path.pop();
  }

  private resolve(target: Target): StateNode {
    const node = typeof target === 'string' ? this.nodesByName.get(target) : this.nodesByInterface.get(target);
    if (!node) throw new Error(`No state for ${typeof target === 'string' ? target : target.name}`);
    return node;
  }

  // Transitions

  TransitFrom(from: StateNode, target: Target, source: TransitSource) {
    this.transit(from, this.resolve(target), false, false, source);
  }

  private transit(current: StateNode, target: StateNode, construct: boolean, recover: boolean, source: TransitSource) {
    const targetPath = this.constructPaths.get(target);
    if (!targetPath) throw new Error(`No path to state ${target.name}`);
    const divergeMax = Math.min(targetPath.length, this.current.length);
    let divergeIndex = 0;
    while (divergeIndex < divergeMax) {
      const node = this.current[divergeIndex].node;
      if (node === current || node === target || node !== targetPath[divergeIndex]) break;
      divergeIndex++;
    }
    const record: TransitionRecord = {
      from: current.name, to: target.name, source, time: performance.now(),
      destroyed: this.current.slice(divergeIndex).map(ctx => ctx.node.name).reverse(),
      created: targetPath.slice(divergeIndex).map(node => node.name),
    };
    this.current.length = divergeIndex;
    for (let i = divergeIndex; i < targetPath.length; i++) this.pushState(targetPath[i]);
    this.transitions.push(record);
    if (this.transitions.length > 200) this.transitions.shift();
    this.onTransition?.(record);
    for (let i = divergeIndex; i < this.current.length; i++) this.current[i]?.instance.OnTransit(construct, recover);
  }

  private pushState(node: StateNode) {
    const instance = new node.type();
    instance.machine = this;
    instance.node = node;
    instance.SetRuntime(this.runtime);
    const nvrams = new Map<DataClass, object>();
    for (const type of node.type.Nvrams ?? []) nvrams.set(type, new type());
    this.current.push({ node, instance, nvrams, handlers: new Map() });
  }

  private indexOf(state: State) {
    return this.current.findIndex(ctx => ctx.instance === state);
  }

  // Events

  ReactOn(state: State, event: Event<unknown[]>, handler: (...args: unknown[]) => Reaction) {
    const index = this.indexOf(state);
    if (index < 0) throw new Error('Registering event to destroyed state');
    const ctx = this.current[index];
    if (ctx.handlers.has(event)) throw new Error(`State ${ctx.node.name} registering for the same event twice`);
    ctx.handlers.set(event, handler);
    if (!this.registeredEvents.has(event)) {
      this.registeredEvents.add(event);
      event.Register(this.queue, this, (...args: unknown[]) => this.dispatch(event, args));
    }
  }

  private dispatch(event: Event<unknown[]>, args: unknown[]) {
    for (let i = this.current.length - 1; i >= 0; i--) {
      const ctx = this.current[i];
      const handler = ctx?.handlers.get(event);
      if (!handler) continue;
      const reaction = handler(...args);
      if (reaction.kind === 'consume' || reaction.kind === 'reject') break;
      if (reaction.kind === 'forward' || reaction.kind === 'skip') continue;
      this.transit(ctx.node, this.resolve(reaction.target!), false, false, reaction.source ?? { function: 'anonymous', state: ctx.node.name, file: '', line: 0, column: 0 });
      break;
    }
  }

  // Data

  FindNvram<T extends object>(state: State, type: DataClass<T>): T {
    for (let i = this.indexOf(state); i >= 0; i--) {
      const found = this.current[i].nvrams.get(type);
      if (found) return found as T;
    }
    throw new Error(`${state.node.name}: missing nvram ${type.name}`);
  }

  FindStatic<T extends object>(type: DataClass<T>): T {
    const found = this.statics.get(type);
    if (!found) throw new Error(`Missing static ${type.name}`);
    return found as T;
  }

  FindIface<T>(state: State, token: RuntimeToken<T>): T | undefined {
    for (let i = this.indexOf(state) - 1; i >= 0; i--) {
      const ctx = this.current[i];
      if ((ctx.node.type.Interfaces ?? []).includes(token)) return ctx.instance as unknown as T;
    }
    return undefined;
  }
}
