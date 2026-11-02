// Egt::Game::AlphaFamily::RngQueueGridPreview (AlphaFamilyMathRngPreset/RngQueueGridPreview.h/.cpp): what a queued
// sequence would show, for the tooltips of the RNG Queue and the RNG Presets: the round's rules calculate a round on
// the sequence's numbers (the reels' stop, each tetra sub-screen's, or the wheel's sector), and the preview keeps it.
// The C++ preview draws itself with ImGui; this one gives the cells debug/RngGridPreview.vue draws.

import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import { HistoryEngine, MementoEngine, MonteCarloEngineHat, type RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';
import type { IRngGridPreview, IRngGridPreviewPtr, IRngQueueGridPreview, RngGridPreviewCell, RngGridPreviewSector } from '@game/integration/Runtime/IRngQueueGridPreview';
import { RoundType, type SymbolGrid, type SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { Weighted } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Weighted';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { SpinReelsPhase, TetraSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import type { ReelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules';
import { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { WheelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundInput.data';
import { WheelRoundPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundPhase.data';
import type { WheelSector, WheelSectorId } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';
import type { WheelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules';
import type { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';

const kPreviewCacheMaxEntries = 256;

export class RngQueueGridPreviewContext {
  m_mathRules: IMathRules | null = null;
  /** The symbol's name, and whether the rules have the symbol (C++'s bool and symbolNameOut). */
  m_symbolNameGetter: ((roundType: RoundType, symbolId: SymbolId) => [boolean, string]) | null = null;
  m_imageGetter: ((rssKey: string) => ImageData | null) | null = null;
}

function PrepareReelRoundInputForPreview(input: ReelRoundInput, rules: ReelRoundRules) {
  input.roundType = rules.GetRoundType();
  input.lines = rules.GetMinLines();
  input.bet = rules.GetMinBet();
  input.betPerLine = input.lines > 0 ? Math.trunc(input.bet / input.lines) : input.bet;
  input.betType = rules.GetBetBarCurrencyType();
  input.initialMatchCreditBet = input.bet;
  input.consume = new Currencies(input.betType, input.bet);

  if (input.roundType === RoundType.Tetra) {
    input.betPerLine = Math.trunc(input.betPerLine / rules.GetTetraSpinRules().GetSubScreenCount());
  }

  if (rules.GetMinBetMultiplier() > 0) {
    input.initialMatchCreditBet = Math.trunc(input.initialMatchCreditBet / rules.GetMinBetMultiplier());
  }
}

function PrepareWheelRoundInputForPreview(input: WheelRoundInput, rules: WheelRoundRules) {
  input.roundType = rules.GetRoundType();
  input.bet = Math.max(1, rules.GetMinimumCoinBet());
  const bettingGroups = rules.GetConfig().bettingGroups;
  input.betGroup = bettingGroups.length ? bettingGroups[0].id : 0;
}

function TryDecodeWheelSectorFromRng(sectors: Weighted<WheelSector>, sequence: RngSequence): WheelSectorId | null {
  const sectorRng = sequence.data.find(rng => rng.op === sectors.op);
  if (!sectorRng) return null;

  let roll = sectorRng.value;
  for (const weightedSector of sectors.range) {
    if (roll < weightedSector.weight) {
      return weightedSector.value.id;
    }
    roll -= weightedSector.weight;
  }

  return null;
}

/** The round's rules on an engine of the sequence's numbers: HistoryEngine<MementoEngine<MonteCarloEngineHat>>. */
function PreviewEngine(sequence: RngSequence) {
  const memento = new MementoEngine(new MonteCarloEngineHat());
  memento.PushOverride(sequence);
  return new HistoryEngine(memento);
}

function TryComputeReelGrids(mathRules: IMathRules | null, roundType: RoundType, sequence: RngSequence): SymbolGrid[] {
  if (!mathRules) return [];
  if (!mathRules.HasReelRoundRules(roundType)) return [];
  if (!sequence.data.length) return [];

  try {
    const rng = PreviewEngine(sequence);

    const rules = mathRules.GetReelRoundRules(roundType);
    const input = new ReelRoundInput();
    PrepareReelRoundInputForPreview(input, rules);

    const result = rules.CalculateRound(input, rng);
    if (!(result instanceof RoundResult)) return [];

    const phases = result.ForceGetPhasesWithoutRecovery();
    for (const phase of [...phases].reverse()) {
      if (phase instanceof TetraSpinPhase) {
        const grids: SymbolGrid[] = [];
        for (const subScreen of phase.subScreens) {
          for (const subPhase of [...subScreen.phases].reverse()) {
            if (subPhase instanceof SpinReelsPhase) {
              if (!subPhase.stop.length) continue;
              grids.push(subPhase.stop);
              break;
            }
          }
        }
        if (!grids.length) return [];
        return grids;
      }

      if (phase instanceof SpinReelsPhase) {
        if (!phase.stop.length) return [];
        return [phase.stop];
      }
    }
  } catch {
    return [];
  }

  return [];
}

function TryComputeWheelSector(mathRules: IMathRules | null, roundType: RoundType, sequence: RngSequence): WheelSectorId | null {
  if (!mathRules) return null;
  if (!mathRules.HasWheelRoundRules(roundType)) return null;
  if (!sequence.data.length) return null;

  try {
    const sectors = mathRules.GetWheelRoundRules(roundType).GetConfig().sectors;
    const sectorId = TryDecodeWheelSectorFromRng(sectors, sequence);
    if (sectorId !== null) {
      return sectorId;
    }

    const rng = PreviewEngine(sequence);

    const rules = mathRules.GetWheelRoundRules(roundType);
    const input = new WheelRoundInput();
    PrepareWheelRoundInputForPreview(input, rules);

    const result = rules.CalculateRound(input, rng);
    if (!(result instanceof RoundResult)) return null;

    const phases = result.ForceGetPhasesWithoutRecovery();
    for (const phase of [...phases].reverse()) {
      if (phase instanceof WheelRoundPhase) {
        if (phase.stopSector < 0) return null;
        return phase.stopSector;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function GetWheelSectorRssKey(roundType: RoundType, sectorName: string) {
  const roundTypeRssPrefix = roundType === RoundType.Wheel
    ? 'IMAGE_RNG_PICKER_WHEEL_SECTOR_'
    : roundType === RoundType.Gamble ? 'IMAGE_RNG_PICKER_GAMBLE_CARD_' : 'IMAGE_RNG_PICKER_WHEEL_';
  return roundTypeRssPrefix + sectorName;
}

/** ImGuiDrawWheelSectorImage: the sector's image at a height, else its name. */
function WheelSectorImage(roundType: RoundType, sectorId: WheelSectorId, context: RngQueueGridPreviewContext, imageHeight: number): RngGridPreviewSector | null {
  if (!context.m_mathRules) return null;

  const wheelRules = context.m_mathRules.GetWheelRoundRules(roundType);
  const sectors = wheelRules.GetConfig().sectors.range;
  const selectedSector = sectors.find(sector => sectorId === sector.value.id);
  if (!selectedSector) return null;

  const sectorName = selectedSector.value.name;
  const image = context.m_imageGetter?.(GetWheelSectorRssKey(roundType, sectorName)) ?? null;
  return { text: sectorName, image, height: imageHeight };
}

/** ImGuiDrawMiniSymbolCell: the symbol's IMAGE_RNG_PICKER_<name> image, else its name on a colour of its id. */
export function MiniSymbolCell(roundType: RoundType, symbolId: SymbolId, context: RngQueueGridPreviewContext): RngGridPreviewCell {
  const symbolText = context.m_symbolNameGetter ? context.m_symbolNameGetter(roundType, symbolId)[1] : '';

  const image = context.m_imageGetter?.(`IMAGE_RNG_PICKER_${symbolText}`) ?? null;
  const hue = (symbolId * 0.618) % 1;
  return { text: symbolText, image, hue };
}

interface PreviewCacheValue {
  reelGrids: SymbolGrid[];
  wheelSector: WheelSectorId | null;
}

// Concrete, self-contained implementation of the exported IRngGridPreview handle.
class GridPreview implements IRngGridPreview {
  private readonly m_cells: RngGridPreviewCell[][][];
  private readonly m_sector: RngGridPreviewSector | null;

  constructor(private readonly m_roundType: RoundType, private readonly m_value: PreviewCacheValue, private readonly m_context: RngQueueGridPreviewContext) {
    this.m_cells = m_value.reelGrids.map(grid => grid.map(reel => reel.map(symbolId => MiniSymbolCell(m_roundType, symbolId, m_context))));
    const imageHeight = m_roundType === RoundType.Gamble ? 80 : 60;
    this.m_sector = m_value.wheelSector !== null ? WheelSectorImage(m_roundType, m_value.wheelSector, m_context, imageHeight) : null;
  }

  GetReelGrids() {
    return this.m_cells;
  }

  GetGridsPerRow() {
    return this.m_value.reelGrids.length === 4 ? 2 : this.m_value.reelGrids.length;
  }

  GetWheelSector() {
    return this.m_sector;
  }
}

export class RngQueueGridPreview implements IRngQueueGridPreview {
  private readonly m_previewCache = new Map<string, IRngGridPreviewPtr>();

  constructor(private readonly m_context: RngQueueGridPreviewContext) {}

  BuildPreview(roundType: GameRoundType, rngSequence: RngSequence): IRngGridPreviewPtr {
    const alphaRoundType = roundType as RoundType;
    // PreviewCacheKey: the round type and the sequence's numbers
    const cacheKey = `${alphaRoundType}|${rngSequence.data.map(number => `${number.op}:${number.range}:${number.value}`).join(',')}`;
    if (this.m_previewCache.size >= kPreviewCacheMaxEntries) {
      this.m_previewCache.clear();
    }

    let preview = this.m_previewCache.get(cacheKey);
    if (preview === undefined) {
      preview = new GridPreview(alphaRoundType, this.BuildPreviewCacheValue(alphaRoundType, rngSequence), this.m_context);
      this.m_previewCache.set(cacheKey, preview);
    }

    return preview;
  }

  private BuildPreviewCacheValue(roundType: RoundType, rngSequence: RngSequence): PreviewCacheValue {
    const cachedValue: PreviewCacheValue = { reelGrids: [], wheelSector: null };
    if (!this.m_context.m_mathRules) return cachedValue;

    if (this.m_context.m_mathRules.HasReelRoundRules(roundType)) {
      const grids = TryComputeReelGrids(this.m_context.m_mathRules, roundType, rngSequence);
      if (grids.length) {
        cachedValue.reelGrids = grids;
        return cachedValue;
      }
    }

    if (this.m_context.m_mathRules.HasWheelRoundRules(roundType)) {
      const sectorId = TryComputeWheelSector(this.m_context.m_mathRules, roundType, rngSequence);
      if (sectorId !== null) {
        cachedValue.wheelSector = sectorId;
        return cachedValue;
      }
    }

    return cachedValue;
  }
}
