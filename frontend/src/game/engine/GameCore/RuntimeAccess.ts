// Egt::GameCore::RuntimeAccess and RuntimeHolder: the registry through which modules, views and states reach each other
// by interface, as RuntimeAdd<IReelsView>(this) and RuntimeGet<IReelsView>() do in C++.
//
// TypeScript interfaces do not exist at runtime, so each interface has a token of the same name:
//
//   export interface IReelsView extends IControlView { ... }
//   export const IReelsView = Interface<IReelsView, IReelsViewEvents>('IReelsView');
//
// RuntimeGet(IReelsView) is RuntimeGet<IReelsView>(), and RuntimeGet(IReelsView.Events) RuntimeGet<IReelsView::Events>().

export class RuntimeToken<T> {
  declare private readonly type: T;
  constructor(readonly name: string) {}
}

export type InterfaceToken<T, E = never> = RuntimeToken<T> & { readonly Events: RuntimeToken<E> };

export function Interface<T, E = never>(name: string): InterfaceToken<T, E> {
  return Object.assign(new RuntimeToken<T>(name), { Events: new RuntimeToken<E>(`${name}::Events`) });
}

export class Runtime {
  private readonly services = new Map<RuntimeToken<unknown>, unknown>();

  Add<T>(token: RuntimeToken<T>, value: T) {
    if (this.services.has(token)) throw new Error(`Runtime already has ${token.name}`);
    this.services.set(token, value);
  }

  Remove(token: RuntimeToken<unknown>) {
    this.services.delete(token);
  }

  Get<T>(token: RuntimeToken<T>): T {
    if (!this.services.has(token)) throw new Error(`Runtime is missing ${token.name}`);
    return this.services.get(token) as T;
  }

  TryGet<T>(token: RuntimeToken<T>): T | undefined {
    return this.services.get(token) as T | undefined;
  }

  Names() {
    return [...this.services.keys()].map(token => token.name).sort();
  }
}

export class RuntimeHolder {
  private runtime: Runtime | null = null;

  SetRuntime(runtime: Runtime | null) {
    this.runtime = runtime;
  }

  GetRuntime(): Runtime {
    if (!this.runtime) throw new Error(`${this.constructor.name} has no runtime`);
    return this.runtime;
  }

  RuntimeAdd<T>(token: RuntimeToken<T>, value: T) {
    this.GetRuntime().Add(token, value);
  }

  RuntimeRemove(token: RuntimeToken<unknown>) {
    this.GetRuntime().Remove(token);
  }

  RuntimeGet<T>(token: RuntimeToken<T>): T {
    return this.GetRuntime().Get(token);
  }

  RuntimeTryGet<T>(token: RuntimeToken<T>): T | undefined {
    return this.GetRuntime().TryGet(token);
  }

  // C++ distinguishes const access; it is the same object here.
  RuntimeGetConst<T>(token: RuntimeToken<T>): T {
    return this.RuntimeGet(token);
  }

  RuntimeTryGetConst<T>(token: RuntimeToken<T>): T | undefined {
    return this.RuntimeTryGet(token);
  }
}
