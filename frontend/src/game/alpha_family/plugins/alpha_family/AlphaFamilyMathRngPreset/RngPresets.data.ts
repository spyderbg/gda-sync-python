// Egt::Game::AlphaFamily::RngPresetsData and its entries (AlphaFamilyMathRngPreset/RngPresets.data.h): the RNG Presets'
// tree, the IData DevMathRngPresetConfig (resources/<game>/math/DevMathRngPreset.json). A node is a submenu (children)
// or a preset: a reel round's result grids, a tetra round's sub-screens, a wheel's sector, or a scenario of those.

import { RoundType, type SymbolGrid } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';

export type RowGrid = number[][];

export interface RngPresetStickSymbolsCode {
  codePerReel: number[];
}

export interface RngPresetRtpReducer {
  isZeroRound: boolean;
}

export interface RngPresetsReelData {
  type: RoundType;
  // the screen which you entered the round from - must have for hold and spin
  // std::optional<SymbolGrid> triggerReels;
  reelsSetDistributionIndex?: number;
  resultReels: SymbolGrid[]; // set at least one

  // HOLD AND SPIN
  // std::vector<SymbolGrid> resultReels
  // std::optional<uint32_t> distribution;
  distribution?: number;

  // Encoded wild stick-symbol positions per reel - ex. 10 Burning Crown Tetra
  wildStickSymbolsCode?: RngPresetStickSymbolsCode;
}

export interface RngPresetsWheelData {
  type: RoundType;
  sector: number;
}

export interface RngPresetsGambleData {
  type: RoundType;
  card: number;
}

export interface RngPresetsTetraData {
  type: RoundType;
  rtpReducer?: RngPresetRtpReducer;
  subScreens: RngPresetsReelData[];
}

export interface RngPresetSingleEntry {
  reel?: RngPresetsReelData;
  wheel?: RngPresetsWheelData;
  gamble?: RngPresetsGambleData;
  tetra?: RngPresetsTetraData;
}

export type RngPresetScenarioEntry = RngPresetSingleEntry[];

export interface RngPresetsData {
  name: string;

  // flat entries
  reel?: RngPresetsReelData;
  wheel?: RngPresetsWheelData;
  gamble?: RngPresetsGambleData;
  tetra?: RngPresetsTetraData;
  scenario?: RngPresetScenarioEntry;
  // list of the sub menus
  children?: RngPresetsData[];
}

////////////////////////////////////////////////////////////////////////////////
/// rss::convert<RngPresetsData>: the IData's JSON, its round types by name
////////////////////////////////////////////////////////////////////////////////

type Json = Record<string, unknown>;

function ToRoundType(value: unknown): RoundType {
  if (typeof value === 'number') return value as RoundType;
  const type = RoundType[value as keyof typeof RoundType];
  return type === undefined ? RoundType.Undefined : type;
}

function ToReel(json: Json): RngPresetsReelData {
  return {
    type: ToRoundType(json.type),
    reelsSetDistributionIndex: json.reelsSetDistributionIndex as number | undefined,
    resultReels: ((json.resultReels as SymbolGrid[] | undefined) ?? []).map(grid => grid.map(row => [...row])),
    distribution: json.distribution as number | undefined,
    wildStickSymbolsCode: json.wildStickSymbolsCode ? { codePerReel: [...((json.wildStickSymbolsCode as Json).codePerReel as number[] ?? [])] } : undefined,
  };
}

function ToEntry(json: Json): RngPresetSingleEntry {
  return {
    reel: json.reel ? ToReel(json.reel as Json) : undefined,
    wheel: json.wheel ? { type: ToRoundType((json.wheel as Json).type), sector: Number((json.wheel as Json).sector ?? 0) } : undefined,
    gamble: json.gamble ? { type: ToRoundType((json.gamble as Json).type), card: Number((json.gamble as Json).card ?? 0) } : undefined,
    tetra: json.tetra
      ? {
        type: ToRoundType((json.tetra as Json).type ?? 'Tetra'),
        rtpReducer: (json.tetra as Json).rtpReducer ? { isZeroRound: !!((json.tetra as Json).rtpReducer as Json).isZeroRound } : undefined,
        subScreens: (((json.tetra as Json).subScreens as Json[] | undefined) ?? []).map(ToReel),
      }
      : undefined,
  };
}

export function RngPresetsDataFrom(json: Json): RngPresetsData {
  return {
    name: String(json.name ?? ''),
    ...ToEntry(json),
    scenario: Array.isArray(json.scenario) ? (json.scenario as Json[]).map(ToEntry) : undefined,
    children: Array.isArray(json.children) ? (json.children as Json[]).map(RngPresetsDataFrom) : undefined,
  };
}
