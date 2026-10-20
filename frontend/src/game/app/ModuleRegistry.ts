// The modules the browser game can create by the names a game's modules config (configs/<game>/modules/<Name>Modules.json)
// gives them, as the C++ ModuleManager creates them from their plugins. A new game's modules are added here.

import type { IModule } from '../engine/ModuleManager/BaseModule';
import { CappingSplashView } from '../plugins/CappingSplashView/CappingSplashView';
import { BurningCrownTetraSpins10Fsm } from '../alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10Fsm/BurningCrownTetraSpins10Fsm';
import { BurningCrownTetraSpins10InfoView } from '../alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10InfoView/BurningCrownTetraSpins10InfoView';
import { BurningCrownTetraSpins10Math } from '../alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10Math/BurningCrownTetraSpins10Math';
import { BurningCrownTetraSpins10TopperView } from '../alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10TopperView/BurningCrownTetraSpins10TopperView';
import { BurningCrownTetraSpins10View } from '../alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/BurningCrownTetraSpins10View';

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
  // Burning Crown Tetra Spins 10 (game/alpha_family/plugins/burning_crown_tetra_spins_10).
  BurningCrownTetraSpins10Math: {
    space: 'Egt::Game::AlphaFamily', header: 'Egt/BurningCrownTetraSpins10Math/BurningCrownTetraSpins10Math.h', plugin: 'burning_crown_tetra_spins_10',
    create: () => new BurningCrownTetraSpins10Math(),
  },
  BurningCrownTetraSpins10View: {
    space: 'Egt::Game::AlphaFamily', header: 'Egt/BurningCrownTetraSpins10View/BurningCrownTetraSpins10View.h', plugin: 'burning_crown_tetra_spins_10',
    create: () => new BurningCrownTetraSpins10View(),
  },
  BurningCrownTetraSpins10InfoView: {
    space: 'Egt::Game::AlphaFamily', header: 'Egt/BurningCrownTetraSpins10InfoView/BurningCrownTetraSpins10InfoView.h', plugin: 'burning_crown_tetra_spins_10',
    create: () => new BurningCrownTetraSpins10InfoView(),
  },
  BurningCrownTetraSpins10Fsm: {
    space: 'Egt::Game::AlphaFamily', header: 'Egt/BurningCrownTetraSpins10Fsm/BurningCrownTetraSpins10Fsm.h', plugin: 'burning_crown_tetra_spins_10',
    create: () => new BurningCrownTetraSpins10Fsm(),
  },
  BurningCrownTetraSpins10TopperView: {
    space: 'Egt::Game::AlphaFamily', header: 'Egt/BurningCrownTetraSpins10TopperView/BurningCrownTetraSpins10TopperView.h', plugin: 'burning_crown_tetra_spins_10',
    create: () => new BurningCrownTetraSpins10TopperView(),
  },
};
