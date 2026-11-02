// Egt::Game::AlphaFamily::RngPresets (AlphaFamilyMathRngPreset/RngPresets.h/.cpp): the RNG Presets' tree and what its
// presets queue. A preset's result grids become the RNG numbers that make the round stop on them (ResultToRng), queued
// in the kernel's RNG queue (IRngPreset) under the preset's name; a scenario queues each of its entries, tagged as one
// group. The C++ draws the tree as ImGui menus (ImGuiDraw); debug/RngPresetWindow.vue draws it from GetMenuRoots.

import { type RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { IRngGridPreviewPtr } from '@game/integration/Runtime/IRngQueueGridPreview';
import { RoundType, type SymbolGrid, type SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { ResultToRng } from '@game/alpha_family/libs/AlphaFamilyMathToolUtils/ResultToRng';
import type { RngPresetContext } from './RngPresetContext';
import type { RngPresetSingleEntry, RngPresetsData, RngPresetsGambleData, RngPresetsReelData, RngPresetsTetraData, RngPresetsWheelData } from './RngPresets.data';

const WILDCARD_ANY_SYMBOL: SymbolId = 255;
const kScenarioTagPrefix = '__SCENARIO__:';

type RngPresetsQueue = [RoundType, RngSequence][];

/** rngs += more */
function Append(rngs: RngSequence, more: RngSequence) {
  rngs.data.push(...more.data);
  return rngs;
}

function Transpose(matrix: SymbolGrid): SymbolGrid {
  console.assert(matrix.length > 0);
  const rowCount = matrix.length;
  console.assert(matrix[0].length > 0);
  const reelCount = matrix[0].length;
  const t: SymbolGrid = Array.from({ length: reelCount }, () => new Array<SymbolId>(rowCount).fill(-1));
  for (let reelIndex = 0; reelIndex < reelCount; ++reelIndex) {
    for (let rowIndex = 0; rowIndex < rowCount; ++rowIndex) {
      t[reelIndex][rowIndex] = matrix[rowIndex][reelIndex];
    }
  }

  return t;
}

function TransformReelFromRowToColumnsOfReel(reelData: RngPresetsReelData) {
  const rowMajorResults = reelData.resultReels;
  for (let resultIndex = 0; resultIndex < rowMajorResults.length; ++resultIndex) {
    rowMajorResults[resultIndex] = Transpose(rowMajorResults[resultIndex]);
  }
}

function TransformReelFromRowToColumns(data: RngPresetsData) {
  if (data.children !== undefined) {
    for (const child of data.children) {
      TransformReelFromRowToColumns(child);
    }
  } else if (data.scenario !== undefined) {
    const scenarioContainer = data.scenario;
    for (const entry of scenarioContainer) {
      if (entry.reel !== undefined) {
        TransformReelFromRowToColumnsOfReel(entry.reel);
      }
      if (entry.tetra !== undefined) {
        for (const subScreen of entry.tetra.subScreens) {
          TransformReelFromRowToColumnsOfReel(subScreen);
        }
      }
    }
  } else if (data.reel !== undefined) {
    TransformReelFromRowToColumnsOfReel(data.reel);
  } else if (data.tetra !== undefined) {
    for (const subScreen of data.tetra.subScreens) {
      TransformReelFromRowToColumnsOfReel(subScreen);
    }
  }
}

function BuildPresetPath(parentPath: string[], name: string) {
  const path = [...parentPath];
  if (name) {
    path.push(name);
  }

  return path;
}

function BuildPresetName(path: string[]) {
  if (!path.length) return '';
  if (path.length === 1) {
    return path[path.length - 1];
  }

  return `${path[path.length - 2]} ${path[path.length - 1]}`;
}

function BuildLastPathElementName(path: string[]) {
  if (!path.length) return '';
  return path[path.length - 1];
}

function ContainsPathSegment(path: string[], segment: string) {
  for (const pathPart of path) {
    if (pathPart === segment) {
      return true;
    }
  }

  return false;
}

function ToCapsLowerToken(name: string) {
  if (!name) return '__';

  let token = name.slice(0, Math.min(2, name.length));
  token = token[0].toUpperCase() + (token.length > 1 ? token[1].toLowerCase() : '');

  return token;
}

function BuildNoWinPresetName(reelData: RngPresetsReelData, mathRules: IMathRules | null) {
  if (!mathRules) return '';
  if (!mathRules.HasReelRoundRules(reelData.type)) return '';
  if (!reelData.resultReels.length) return '';

  const reelGrid = reelData.resultReels[0];
  if (!reelGrid.length) return '';
  if (!reelGrid[0].length) return '';

  const middleRowIndex = Math.trunc(reelGrid[0].length / 2);
  const symbols = mathRules.GetReelRoundRules(reelData.type).GetSymbolNames();

  let result = '';
  for (const reel of reelGrid) {
    if (middleRowIndex >= reel.length) {
      continue;
    }

    const symbolId = reel[middleRowIndex];
    let shortName: string;
    if (symbolId === WILDCARD_ANY_SYMBOL) {
      shortName = '*';
    } else if (symbolId >= 0 && symbolId < symbols.length) {
      const symbolName = symbols[symbolId].name;
      shortName = ToCapsLowerToken(symbolName);
    } else {
      shortName = '__';
    }

    if (!shortName) {
      shortName = '__';
    }

    if (result) {
      result += '-';
    }
    result += shortName;
  }

  return result;
}

function ResolvePresetName(container: RngPresetsData, path: string[], mathRules: IMathRules | null) {
  if (container.reel !== undefined && ContainsPathSegment(path, 'No Win')) {
    const noWinName = BuildNoWinPresetName(container.reel, mathRules);
    if (noWinName) {
      return noWinName;
    }
  }

  if (container.wheel !== undefined || container.gamble !== undefined) {
    return BuildLastPathElementName(path);
  }

  return BuildPresetName(path);
}

function EncodeScenarioPresetName(presetName: string, scenarioGroupId: number) {
  return `${kScenarioTagPrefix}${scenarioGroupId}:${presetName}`;
}

export class RngPresets {
  private m_isInitialized = false;
  private m_nextScenarioGroupId = 1;

  private m_context: RngPresetContext | null = null;
  private m_data: RngPresetsData = { name: '' };
  private m_cachedTooltipLeaf: RngPresetsData | null = null;
  private m_cachedTooltipPreviews: IRngGridPreviewPtr[] = [];

  Init(context: RngPresetContext | null, data: RngPresetsData) {
    if (this.m_isInitialized) return;
    if (!context) return;

    this.m_context = context;
    this.m_data = data;

    // adjust the reels data from row major matrix( vector of rows) to column major (vector of reels)
    TransformReelFromRowToColumns(this.m_data);

    this.m_isInitialized = true;
  }

  Deinit() {
    this.m_isInitialized = false;
    this.m_nextScenarioGroupId = 1;
    this.m_cachedTooltipLeaf = null;
    this.m_cachedTooltipPreviews = [];
    this.m_context = null;
    this.m_data = { name: '' };
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The "RNG Preset" window's menus (C++ ImGuiDraw, ImguiDrawPresetMenu)
  ////////////////////////////////////////////////////////////////////////////////

  /** The menus the window shows: the root's children (skip the name of the first list), else the root. */
  GetMenuRoots(): RngPresetsData[] {
    // skip the name of the first list
    if (this.m_data.children !== undefined) {
      return this.m_data.children;
    }
    return [this.m_data];
  }

  /** Whether a node is a submenu (ImGui::BeginMenu), else a preset (ImGui::MenuItem). */
  static IsSubmenu(container: RngPresetsData) {
    return container.children !== undefined && container.children.length > 0;
  }

  static GetMenuLabel(container: RngPresetsData) {
    return container.name || '__';
  }

  static GetMenuPath(parentPath: string[], container: RngPresetsData) {
    return BuildPresetPath(parentPath, container.name);
  }

  /** A preset's item clicked: its path is its parents' names and its own. */
  ApplyMenuItem(container: RngPresetsData, parentPath: string[]) {
    const presetPath = BuildPresetPath(parentPath, container.name);
    return this.ApplyLeaf(container, presetPath);
  }

  /** A preset's tooltip (ImGuiShowPresetLeafTooltip): the preview of each sequence it queues. */
  GetPresetLeafTooltipPreviews(container: RngPresetsData): IRngGridPreviewPtr[] {
    const gridPreview = this.m_context ? this.m_context.m_rngQueueGridPreview : null;
    if (!gridPreview) return [];

    if (this.m_cachedTooltipLeaf !== container) {
      this.m_cachedTooltipPreviews = [];
      for (const [roundType, rngs] of this.BuildRngQueueForLeaf(container)) {
        this.m_cachedTooltipPreviews.push(gridPreview.BuildPreview(roundType, rngs));
      }
      this.m_cachedTooltipLeaf = container;
    }
    return this.m_cachedTooltipPreviews;
  }

  private BuildRngQueueForLeaf(container: RngPresetsData): RngPresetsQueue {
    if (container.scenario !== undefined) {
      const rngQueue: RngPresetsQueue = [];
      for (const singleEntry of container.scenario) {
        if (singleEntry.reel !== undefined) {
          rngQueue.push(...this.GenerateFromReel(singleEntry.reel));
        } else if (singleEntry.wheel !== undefined) {
          rngQueue.push(...this.GenerateFromWheel(singleEntry.wheel));
        } else if (singleEntry.gamble !== undefined) {
          rngQueue.push(...this.GenerateFromGamble(singleEntry.gamble));
        } else if (singleEntry.tetra !== undefined) {
          rngQueue.push(...this.GenerateFromTetra(singleEntry.tetra));
        }
      }
      return rngQueue;
    }

    if (container.reel !== undefined) {
      return this.GenerateFromReel(container.reel);
    }
    if (container.wheel !== undefined) {
      return this.GenerateFromWheel(container.wheel);
    }
    if (container.gamble !== undefined) {
      return this.GenerateFromGamble(container.gamble);
    }
    if (container.tetra !== undefined) {
      return this.GenerateFromTetra(container.tetra);
    }

    return [];
  }

  private EnqueueRngs(rngsQueue: RngPresetsQueue, presetName: string) {
    for (const [roundType, rngs] of rngsQueue) {
      this.m_context!.m_kernelRngPresets!.AddRngSequence(roundType, rngs, presetName);
    }
  }

  private ApplyLeaf(container: RngPresetsData, presetPath: string[]) {
    const presetName = ResolvePresetName(container, presetPath, this.m_context!.m_mathRules);
    if (container.scenario !== undefined) {
      const scenarioGroupId = this.m_nextScenarioGroupId++;
      for (const singleEntry of container.scenario) {
        this.AddRngsFor(singleEntry, presetName, scenarioGroupId);
      }
      return true;
    }

    const rngsQueue = this.BuildRngQueueForLeaf(container);
    if (!rngsQueue.length) return false;

    this.EnqueueRngs(rngsQueue, presetName);
    return true;
  }

  /// Apply the preset addressed by a name path, e.g. {"Win","Reel Main","Cherry","x5"}.
  /// Returns false when the path does not resolve to an applicable leaf.
  ApplyByPath(path: string[]) {
    if (!this.m_isInitialized) return false;
    if (!path.length) return false;
    if (this.m_data.children === undefined) return false;

    // Top-level entries are m_data.children — the root "presets" name is not
    // part of the path (mirrors how ImGuiDraw renders the menu).
    let level = this.m_data.children;
    let node: RngPresetsData | null = null;

    for (let i = 0; i < path.length; ++i) {
      node = level.find(entry => entry.name === path[i]) ?? null;
      if (node === null) return false;

      const lastSegment = i + 1 === path.length;
      if (!lastSegment) {
        if (node.children === undefined) return false;
        level = node.children;
      }
    }

    // The addressed node must be a leaf, not a submenu.
    if (node!.children !== undefined && node!.children.length) return false;

    return this.ApplyLeaf(node!, path);
  }

  private CollectLeafPaths(node: RngPresetsData, prefix: string[], out: string[]) {
    prefix = [...prefix, node.name];

    if (node.children !== undefined && node.children.length) {
      for (const child of node.children) {
        this.CollectLeafPaths(child, prefix, out);
      }
      return;
    }

    const applicable = node.reel !== undefined || node.wheel !== undefined || node.gamble !== undefined
      || node.tetra !== undefined || node.scenario !== undefined;
    if (!applicable) return;

    out.push(prefix.join('/'));
  }

  /// Every applicable leaf path, each joined with '/'.
  ListLeafPaths() {
    const out: string[] = [];
    if (this.m_data.children === undefined) return out;
    for (const child of this.m_data.children) {
      this.CollectLeafPaths(child, [], out);
    }
    return out;
  }

  private AddRngsFor(entry: RngPresetSingleEntry, presetName: string, scenarioGroupId?: number) {
    let scenarioEntryPresetName = presetName;
    let rngsQueue: RngPresetsQueue = [];
    if (entry.reel !== undefined) {
      const reel = entry.reel;
      const noWinStyleName = BuildNoWinPresetName(reel, this.m_context!.m_mathRules);
      if (noWinStyleName) {
        scenarioEntryPresetName = noWinStyleName;
      }
      rngsQueue = this.GenerateFromReel(reel);
    } else if (entry.wheel !== undefined) {
      rngsQueue = this.GenerateFromWheel(entry.wheel);
    } else if (entry.gamble !== undefined) {
      rngsQueue = this.GenerateFromGamble(entry.gamble);
    } else if (entry.tetra !== undefined) {
      rngsQueue = this.GenerateFromTetra(entry.tetra);
    }

    if (scenarioGroupId !== undefined) {
      scenarioEntryPresetName = EncodeScenarioPresetName(scenarioEntryPresetName, scenarioGroupId);
    }

    this.EnqueueRngs(rngsQueue, scenarioEntryPresetName);
  }

  // GenerateFrom(const RngPresetsReelData&)
  private GenerateFromReel(reels: RngPresetsReelData): RngPresetsQueue {
    const math = this.m_context!.m_mathRules!;
    const isReelType = math.HasReelRoundRules(reels.type);
    if (!isReelType) return [];
    if (!reels.resultReels.length) return [];

    const rngsQueue: RngPresetsQueue = [];
    const rngsReeling: RngSequence = { data: [] };
    const type = reels.type;
    {
      // rngs for the reel stops & replace the symbols
      const replacedReels = reels.resultReels[0];
      const reelSetIndex = reels.reelsSetDistributionIndex ?? 0;
      const distributionIndex = reels.distribution ?? 0;
      Append(rngsReeling, ResultToRng.GenerateFromSpin(reelSetIndex, replacedReels, new Set([WILDCARD_ANY_SYMBOL]), math, type, distributionIndex));
    }
    rngsQueue.push([type, rngsReeling]);

    if (reels.distribution === undefined) return rngsQueue;
    if (reels.resultReels.length <= 1) return rngsQueue;
    if (math.HasHoldAndSpinRules(type)) {
      // rngs for hold & spin
      const distributionIndex = reels.distribution;
      const trigger = reels.resultReels[0];
      for (let index = 1; index < reels.resultReels.length; ++index) {
        const holdAndSpin = reels.resultReels[index];
        const prev = index === 1 ? trigger : reels.resultReels[index - 1];
        const rngsHoldAndSpin = ResultToRng.GenerateFromHoldAndSpin(holdAndSpin, prev, trigger, math, type, distributionIndex);
        rngsQueue.push([RoundType.HoldAndSpin, rngsHoldAndSpin]);
      }
    }

    return rngsQueue;
  }

  // GenerateFrom(const RngPresetsWheelData&)
  private GenerateFromWheel(wheel: RngPresetsWheelData): RngPresetsQueue {
    const rngs = ResultToRng.GenerateFromWheelSector(wheel.sector, this.m_context!.m_mathRules!, wheel.type);
    return [[wheel.type, rngs]];
  }

  // GenerateFrom(const RngPresetsGambleData&)
  private GenerateFromGamble(_gamble: RngPresetsGambleData): RngPresetsQueue {
    return [];
  }

  // GenerateFrom(const RngPresetsTetraData&)
  private GenerateFromTetra(tetra: RngPresetsTetraData): RngPresetsQueue {
    const math = this.m_context!.m_mathRules!;
    const isReelType = math.HasReelRoundRules(tetra.type);
    if (!isReelType) return [];
    if (tetra.type !== RoundType.Tetra) return [];

    const rngs: RngSequence = { data: [] };
    const type = tetra.type;
    const isZeroRound = (tetra.rtpReducer ?? { isZeroRound: false }).isZeroRound;
    Append(rngs, ResultToRng.GenerateFromRtpReducer(isZeroRound, math, type));
    if (isZeroRound) {
      return [[type, rngs]];
    }

    const tetraRules = math.GetReelRoundRules(type).GetTetraSpinRules();
    if (tetra.subScreens.length !== tetraRules.GetSubScreenCount()) return [];

    for (let subScreenIndex = 0; subScreenIndex < tetra.subScreens.length; ++subScreenIndex) {
      const subScreen = tetra.subScreens[subScreenIndex];
      if (!subScreen.resultReels.length) return [];

      Append(rngs, ResultToRng.GenerateFromSubScreen(
        subScreenIndex,
        subScreen.reelsSetDistributionIndex ?? 0,
        subScreen.resultReels[0],
        new Set([WILDCARD_ANY_SYMBOL]),
        math,
        type,
      ));

      let stickSymbolsCode: number[] = [];
      if (subScreen.wildStickSymbolsCode !== undefined) {
        stickSymbolsCode = subScreen.wildStickSymbolsCode.codePerReel;
      }
      Append(rngs, ResultToRng.GenerateFromStickSymbols(subScreenIndex, stickSymbolsCode, math, type));
    }

    return [[type, rngs]];
  }
}
