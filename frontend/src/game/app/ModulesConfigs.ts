// The modules configs the browser game has of its own: configs/<game>/modules, the games repository's configs as a game
// sync copies them (export/sync-configs.mjs, docs/code_sync/game_sync.md). They are built into the browser game, like
// the modules they name, so a workspace plays without the games repository beside its resources folder
// (docs/independent_game.md).
//
// A game's modules config and its family's are taken from here first, by the rules the backend finds them by beside
// the resources folder (egt_gda_sync/game/project.py): the config of the workspace's id, or else of its game folder's
// name. A game that has none here (not synced yet, or not ported) keeps the ones the backend found.

import type { GameModulesConfig, GameProject } from './GameBackend';

type Config = GameModulesConfig['config'];

// Every <Name>Modules.json: not a variant (_QA, _Partner) or an integration's module manager, which the game does not read.
const CONFIGS = import.meta.glob('../configs/*/modules/*Modules.json', { eager: true, import: 'default' }) as Record<string, Config>;

/** The folder the configs are in, in the app's sources: what a config's file is shown as. */
export const OWN_CONFIGS_FOLDER = 'frontend/src/game/configs';

/** The first config of a folder of configs/ whose file name passes, by name. */
function ConfigOf(folder: string, passes: (name: string) => boolean): GameModulesConfig | null {
  const prefix = `../configs/${folder}/modules/`;
  const names = Object.keys(CONFIGS).filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length)).filter(passes).sort();
  if (!folder || !names.length) return null;
  return { file: `${OWN_CONFIGS_FOLDER}/${folder}/modules/${names[0]}`, config: CONFIGS[prefix + names[0]] };
}

/** A game's own modules config, <Name>Modules.json of configs/<id>/modules: the one that is not a debug variant. */
export function OwnModules(id: string): GameModulesConfig | null {
  return ConfigOf(id, name => !name.includes('_') && !name.includes('Debug') && !name.startsWith('ModuleManager'));
}

/** The own modules config of a game's family: configs/<family>/modules/*GameModules.json, where the family is the last
 * part of its modules' namespace, as Egt::Game::AlphaFamily is alpha_family. */
export function OwnFamilyModules(modules: GameModulesConfig | null): GameModulesConfig | null {
  const spaces = new Set((modules?.config.modules ?? []).map(module => module.space ?? '').filter(space => space.split('::').length > 2));
  const families = [...spaces].map(space => space.split('::').pop()!.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase()).sort();
  for (const family of families) {
    const found = ConfigOf(family, name => name.endsWith('GameModules.json'));
    if (found) return found;
  }
  return null;
}

/** A project with the browser game's own modules configs, where it has the game's: the backend's stay otherwise. */
export function WithOwnModules(project: GameProject): GameProject {
  const gameFolder = project.gamePath.split(/[\\/]/).filter(Boolean).pop() ?? '';
  const modules = OwnModules(project.workspace.id) ?? OwnModules(gameFolder) ?? project.modules;
  return { ...project, modules, familyModules: OwnFamilyModules(modules) ?? project.familyModules };
}
