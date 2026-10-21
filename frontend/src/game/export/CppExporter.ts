// The C++ sources the browser game generates from its own definition, by their paths in the games folder (game/...,
// configs/...). Because the browser game keeps the C++ structure (the same modules, state classes, view classes and
// names), it writes:
// - configs/<game>/modules/<Name>Modules.json: the modules and their config (the math setups...);
// - <Name>Fsm/<Name>Fsm.h, .cpp: CreateBuilder() from the state machine's tree, each state by its C++ class and header;
// - <Name>View/<Name>View.h, .cpp, CMakeLists.txt: the view module, its CreateViews() from its views;
// - <Name>Math/...: the math module, its MathRules.cpp from the game's MathRulesDescription (MathExporter.ts).
// PluginExporter.ts makes the whole plugin of them and of the plugin's other C++ sources.

import { ExportMathCpp, type MathExportInput } from './MathExporter';
import { ViewModuleCMakeLists, ViewModuleCpp, ViewModuleH } from './ViewTemplates';
import type { ViewGroup } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/BurningCrownTetraSpins10View';
import type { StateClass, StateNode } from '@game/engine/Fsm/Fsm';
import type { GameProject } from '@game/app/GameBackend';
import { BetManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/BetManager';
import { GameManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/GameManager';
import { IdleState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Idle/Idle';
import { CreditTaxationState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/CreditTaxation/CreditTaxation';
import { MainRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRound';
import { MainRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundEnding';
import { MainRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundPresenting';
import { MainRoundReelingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundReeling';
import { MainRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MainRound/MainRoundStarting';
import { MatchState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/Match';
import { MatchCappingAppliedState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchCappingApplied/MatchCappingApplied';
import { MatchEndOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchEndOutro/MatchEndOutro';
import { MatchEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchEnding/MatchEnding';
import { MatchStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchStarting/MatchStarting';
import { MatchTakeWinState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/MatchTakeWin/MatchTakeWin';
import { TetraRoundState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound';
import { TetraRoundEndingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundEnding';
import { TetraRoundInputState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundInput';
import { TetraRoundIntroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundIntro';
import { TetraRoundOutroState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundOutro';
import { TetraRoundPresentingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundPresenting';
import { TetraRoundStartingState } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundStarting';
import { SystemManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/SystemManager';
import { ViewManager } from '@game/alpha_family/libs/AlphaFamilyStatesLibrary/ViewManager';

/** Each state class of the states library: its C++ class and header (Egt/AlphaFamilyStatesLibrary/...). Names are
 * given here, not read from the classes, which a production build may rename. */
const STATE_CLASSES = new Map<StateClass, [string, string]>([
  [SystemManager, ['SystemManager', 'SystemManager.h']], [BetManager, ['BetManager', 'BetManager.h']],
  [GameManager, ['GameManager', 'GameManager.h']], [ViewManager, ['ViewManager', 'ViewManager.h']], [IdleState, ['IdleState', 'Idle/Idle.h']],
  [MatchState, ['MatchState', 'Match/Match.h']], [MatchStartingState, ['MatchStartingState', 'Match/MatchStarting/MatchStarting.h']],
  [MainRoundState, ['MainRoundState', 'Match/MainRound/MainRound.h']],
  [MainRoundStartingState, ['MainRoundStartingState', 'Match/MainRound/MainRoundStarting.h']],
  [MainRoundReelingState, ['MainRoundReelingState', 'Match/MainRound/MainRoundReeling.h']],
  [MainRoundPresentingState, ['MainRoundPresentingState', 'Match/MainRound/MainRoundPresenting.h']],
  [MainRoundEndingState, ['MainRoundEndingState', 'Match/MainRound/MainRoundEnding.h']],
  [TetraRoundState, ['TetraRoundState', 'Match/TetraRound/TetraRound.h']],
  [TetraRoundIntroState, ['TetraRoundIntroState', 'Match/TetraRound/TetraRoundIntro.h']],
  [TetraRoundInputState, ['TetraRoundInputState', 'Match/TetraRound/TetraRoundInput.h']],
  [TetraRoundStartingState, ['TetraRoundStartingState', 'Match/TetraRound/TetraRoundStarting.h']],
  [TetraRoundPresentingState, ['TetraRoundPresentingState', 'Match/TetraRound/TetraRoundPresenting.h']],
  [TetraRoundEndingState, ['TetraRoundEndingState', 'Match/TetraRound/TetraRoundEnding.h']],
  [TetraRoundOutroState, ['TetraRoundOutroState', 'Match/TetraRound/TetraRoundOutro.h']],
  [MatchTakeWinState, ['MatchTakeWinState', 'Match/MatchTakeWin/MatchTakeWin.h']],
  [MatchCappingAppliedState, ['MatchCappingAppliedState', 'Match/MatchCappingApplied/MatchCappingApplied.h']],
  [MatchEndingState, ['MatchEndingState', 'Match/MatchEnding/MatchEnding.h']],
  [CreditTaxationState, ['CreditTaxationState', 'Match/CreditTaxation/CreditTaxation.h']],
  [MatchEndOutroState, ['MatchEndOutroState', 'Match/MatchEndOutro/MatchEndOutro.h']],
]);

function cppClass(type: StateClass) {
  const known = STATE_CLASSES.get(type);
  if (!known) throw new Error(`The exporter does not know the C++ class of the state ${type.name}: add it to STATE_CLASSES`);
  return { name: known[0], header: `Egt/AlphaFamilyStatesLibrary/${known[1]}` };
}

export interface CppExportInput {
  /** The game's C++ name, such as BurningCrownTetraSpins10. */
  gameName: string;
  /** Its plugin's folder in game/alpha_family/plugins. */
  plugin: string;
  project: GameProject;
  fsm: StateNode;
  /** The view module's views, in drawing order, by class name, in the groups of its CreateViews(). */
  viewGroups: readonly ViewGroup[];
  /** The math module's rules and the math file they read. */
  math?: Omit<MathExportInput, 'gameName'>;
}

function collect(node: StateNode, into: Set<string>) {
  into.add(cppClass(node.type).header);
  for (const child of node.children) collect(child, into);
}

/** The FsmBuilder tree of a state machine, as BurningCrownTetraSpins10Fsm.cpp writes it. */
function builderTree(node: StateNode, indent: string, root: boolean): string {
  const name = `"${node.name}"`;
  const type = cppClass(node.type).name;
  if (!node.children.length) return `${indent}Node<${type}>(${name})`;
  const children = node.children.map(child => builderTree(child, `${indent}    `, false)).join(',\n');
  const open = root ? `std::make_shared<Node<${type}>>(${name}, std::tuple{` : `Node<${type}>(${name}, std::tuple{`;
  return `${indent}${open}\n${children}\n${indent}})`;
}

export function ExportCpp(input: CppExportInput): Record<string, string> {
  const { gameName, project } = input;
  const fsmName = `${gameName}Fsm`;
  const headers = new Set<string>();
  collect(input.fsm, headers);
  const includes = [...headers].sort().map(path => `#include <${path}>`).join('\n');
  const files: Record<string, string> = {};
  const src = `game/alpha_family/plugins/${input.plugin}/src/Egt`;

  files[`${src}/${fsmName}/${fsmName}.h`] = `#pragma once

#include <Egt/Game/Fsm/GameFsm.h>

#include <Egt/GameCore/Log/LogCategory.h>

namespace Egt::Game::AlphaFamily
{
    class ${fsmName} : public GameFsm
    {
        EgtALogCategoryClassDeclaration();

    public:
        virtual ~${fsmName}();

    protected:
        Ptr<FsmBuilder::INode> CreateBuilder() const override;
    };
}
`;

  files[`${src}/${fsmName}/${fsmName}.cpp`] = `// Generated by the browser game (frontend/src/game) from its state machine.
#include "${fsmName}.h"

${includes}

#include <Egt/GameCore/Common/Defensive.h>

namespace Egt::Game::AlphaFamily
{
    EgtALogCategoryClass(${fsmName}, "${fsmName}");

    ${fsmName}::~${fsmName}() = default;

    Ptr<FsmBuilder::INode> ${fsmName}::CreateBuilder() const
    {
        using namespace FsmBuilder;

        // clang-format off
        return
${builderTree(input.fsm, '            ', true)};
        // clang-format on
    }
}
`;

  files[`${src}/${fsmName}/CMakeLists.txt`] = `# cmake-format: off
if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    # Allow linking of big objects
    add_compile_options(/bigobj)

    # TODO use correcty with target_compile_options(target_name PRIVATE /bigobj)
endif()

egt_create_static_library(
    LINK_LIBRARIES
    EgtAlphaFamilyStatesLibraryStatic
)
# cmake-format: on
`;

  const viewModule = `${gameName}View`;
  const views = input.viewGroups.flatMap(group => group.views);
  // The game's views are in Views/, its software buttons in SwButtons/.
  const viewIncludes = views.map(view => `#include <Egt/${viewModule}/${view.endsWith('SwButtonView') ? 'SwButtons' : 'Views'}/${view}.h>`).sort().join('\n');
  const createViews = input.viewGroups
    .map(group => `${group.comment ? `        // ${group.comment}\n` : ''}${group.views.map(view => `        m_views.push_back(std::make_shared<${view}>());`).join('\n')}`)
    .join('\n\n');
  files[`${src}/${viewModule}/${viewModule}.h`] = ViewModuleH(gameName);
  files[`${src}/${viewModule}/${viewModule}.cpp`] = ViewModuleCpp(gameName, viewIncludes, `${createViews}\n`);
  files[`${src}/${viewModule}/CMakeLists.txt`] = ViewModuleCMakeLists();

  if (input.math) {
    for (const [path, text] of Object.entries(ExportMathCpp({ gameName, ...input.math }))) {
      files[`${src}/${gameName}Math/${path}`] = text;
    }
  }

  if (project.modules) {
    const name = project.modules.file.split(/[\\/]/).pop() ?? `${gameName}Modules.json`;
    files[`configs/${project.workspace.id}/modules/${name}`] = `${JSON.stringify(project.modules.config, null, 2)}\n`;
  }

  return files;
}
