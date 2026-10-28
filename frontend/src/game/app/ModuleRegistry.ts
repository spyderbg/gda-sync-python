// The modules the browser game can create by the names a game's modules config (configs/<game>/modules/<Name>Modules.json)
// gives them, as the C++ ModuleManager creates them from their plugins.
//
// A game's modules are found, not listed: each alpha_family/plugins/<plugin>/<Module>/<Module>.ts that exports a class of
// the folder's name is the module <Module> of the plugin <plugin> (C++'s Egt/<Module>/<Module>.h), so a game imported
// from C++ (export/import-game.mjs) plays once its files are there.

import type { IModule } from '@game/engine/ModuleManager/BaseModule';
import { CappingSplashView } from '@game/plugins/CappingSplashView/CappingSplashView';

export interface ModuleDescriptor {
  /** The C++ namespace and header of the module, which an export names. */
  space: string;
  header: string;
  /** The folder of its plugin in the C++ project (game/alpha_family/plugins/<plugin>; none: game/plugins). */
  plugin: string;
  create: () => IModule;
}

export const MODULES: Record<string, ModuleDescriptor> = {
  // The family's (configs/alpha_family/modules/AlphaGameModules.json): common plugins of game/plugins.
  CappingSplashView: {
    space: 'Egt::Game', header: 'Egt/CappingSplashView/CappingSplashView.h', plugin: '',
    create: () => new CappingSplashView(),
  },
};

const PLUGIN_MODULES = import.meta.glob('../alpha_family/plugins/*/*/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

for (const [path, exports] of Object.entries(PLUGIN_MODULES)) {
  const match = /\/alpha_family\/plugins\/([^/]+)\/([A-Za-z0-9_]+)\/\2\.ts$/.exec(path);
  if (!match) continue;
  const [, plugin, name] = match;
  const type = exports[name];
  if (typeof type !== 'function') continue;
  MODULES[name] = {
    space: 'Egt::Game::AlphaFamily', header: `Egt/${name}/${name}.h`, plugin,
    create: () => new (type as new () => IModule)(),
  };
}

/** The name of a game's module of a kind (Fsm, Math, View, InfoView, TopperView), of the modules a game has. */
export function GameModuleName(names: Iterable<string>, kind: 'Fsm' | 'Math' | 'View' | 'InfoView' | 'TopperView') {
  for (const name of names) {
    const descriptor = MODULES[name];
    if (!descriptor?.plugin || !name.endsWith(kind)) continue;
    if (kind === 'View' && /(Info|Topper)View$/.test(name)) continue;
    return name;
  }
  return null;
}
