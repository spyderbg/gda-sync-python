// Egt::Game::AlphaFamily::ResultToRng (AlphaFamilyMathToolUtils/ResultToRng.h/.cpp): the RNG numbers that make a round's
// math produce a result the RNG tools ask for (the reels' stops, a wheel's sector, a tetra round's sub-screens, a hold
// and spin's coins), as the round's rules draw them.

import { type RngNumber, RngOp, type RngSequence } from '@game/engine/GameCore/Random/IRng';
import { RoundType, type SymbolGrid, type SymbolId } from '../AlphaFamily/Math/Common/Common.data';
import { GetTotalOffset, GetTotalWeight, MinMaxWeightForIndex, MinMaxWeightForValue, type WeightedOffset } from '../AlphaFamily/Math/Common/Weighted';
import type { ReelRoundRules } from '../AlphaFamily/Math/Reel/ReelRoundRules';
import type { WheelSectorId } from '../AlphaFamily/Math/Wheel/WheelRoundRules.data';
import type { IMathRules } from '../AlphaFamily/RuntimeExport/IMathRules';
import { RulesHelper } from './RulesHelper';

/** rngs += more: GameCore::RngSequence's operator+=. */
function Append(rngs: RngSequence, more: RngSequence) {
  rngs.data.push(...more.data);
  return rngs;
}

function Emplace(rngs: RngSequence): RngNumber {
  const number: RngNumber = { op: RngOp.Undefined, range: 0, value: 0 };
  rngs.data.push(number);
  return number;
}

/** weightOffset[symbol] -= 1 */
function Decrement(offset: WeightedOffset<SymbolId>, symbol: SymbolId) {
  offset.set(symbol, (offset.get(symbol) ?? 0) - 1);
}

export class ResultToRng {
  static GenerateFromSpin(
    reelSetIndex: number,
    replacedSpinSearch: SymbolGrid,
    wildcardSearchSymbolIds: Set<SymbolId>,
    math: IMathRules,
    type: RoundType,
    distributionIndex = 0,
  ): RngSequence {
    const spin = ResultToRng.RevertReelTransformation(replacedSpinSearch, math, type, distributionIndex);
    const spinStops = RulesHelper.FindFirstStops(spin, wildcardSearchSymbolIds, math, type, reelSetIndex);

    return ResultToRng.GenerateFromSpinStops(reelSetIndex, spinStops, replacedSpinSearch, math, type, distributionIndex);
  }

  static GenerateFromSpinStops(
    reelSetIndex: number,
    spinStops: number[],
    replaced: SymbolGrid,
    math: IMathRules,
    type: RoundType,
    distributionIndex = 0,
  ): RngSequence {
    const rngs: RngSequence = { data: [] };
    Append(rngs, ResultToRng.GenerateFromReelStops(reelSetIndex, spinStops, math, type));

    if (!spinStops.length) return rngs;

    let hasReplaceInputSyms = false;
    let hasReplacedSyms = false;
    {
      const replaceInputSymbols = RulesHelper.GetSpinReplaceInputSymbols(math, type, distributionIndex);
      const allReplaceableSymbols = new Set<SymbolId>();
      for (const inputSymbol of replaceInputSymbols) {
        const outputSymbols = RulesHelper.GetSpinReplacedOutputSymbols(math, type, distributionIndex, inputSymbol);
        for (const symbol of outputSymbols) allReplaceableSymbols.add(symbol);
      }
      for (const reel of replaced) {
        hasReplacedSyms ||= reel.some(sym => allReplaceableSymbols.has(sym));
      }
      for (const reel of replaced) {
        hasReplaceInputSyms ||= reel.some(sym => replaceInputSymbols.has(sym));
      }
    }

    if (hasReplaceInputSyms || hasReplacedSyms) {
      Append(rngs, ResultToRng.GenerateFromDistributionIndex(distributionIndex, math, type));
    }

    if (hasReplacedSyms) {
      Append(rngs, ResultToRng.GenerateFromReelReplace(replaced, math, type, distributionIndex));
    }

    return rngs;
  }

  private static GenerateFromReelStops(reelSetIndex: number, reelStops: number[], math: IMathRules, type: RoundType): RngSequence {
    const spinRngs: RngSequence = { data: [] };
    // visual
    if (type === RoundType.Main) {
      const visualDiversity = Emplace(spinRngs);
      visualDiversity.op = RngOp.VisualDiversitySeed;
      visualDiversity.value = 1;
      visualDiversity.range = 0;
    }

    // reels spin
    Append(spinRngs, ResultToRng.GenerateFromReelRoundRules(reelSetIndex, reelStops, math.GetReelRoundRules(type)));

    return spinRngs;
  }

  private static GenerateFromReelRoundRules(reelSetIndex: number, reelStops: number[], reelRoundRules: ReelRoundRules): RngSequence {
    const spinRngs: RngSequence = { data: [] };
    const spinRulesConfig = reelRoundRules.GetSpinRules().GetConfig();
    const weightedReels = spinRulesConfig.weightedReels.range;
    console.assert(reelSetIndex >= 0 && reelSetIndex < weightedReels.length);

    if (weightedReels.length >= 2) {
      const selectReels = Emplace(spinRngs);
      selectReels.op = spinRulesConfig.weightedReels.op; // Egt::GameCore::RngOp::SelectReels

      const distributionValue = MinMaxWeightForIndex(spinRulesConfig.weightedReels, reelSetIndex)[0];
      const distributionRange = GetTotalWeight(spinRulesConfig.weightedReels.range);
      selectReels.value = distributionValue;
      selectReels.range = distributionRange;
    }

    const configReels = weightedReels[reelSetIndex].value;
    console.assert(reelStops.length === configReels.length);
    for (let reelIndex = 0; reelIndex < reelStops.length; ++reelIndex) {
      const reelRng = Emplace(spinRngs);
      reelRng.op = RngOp.StopReels;
      reelRng.value = reelStops[reelIndex];
      reelRng.range = configReels[reelIndex].length;
    }

    return spinRngs;
  }

  private static GenerateFromDistributionIndex(distributionIndex: number, math: IMathRules, type: RoundType): RngSequence {
    const distributionRngs: RngSequence = { data: [] };
    const weightedDistributions = math.GetReelRoundRules(type).GetSpinRules().GetConfig().replaceMaps;
    const distributionValue = MinMaxWeightForIndex(weightedDistributions, distributionIndex)[0];
    const distributionRange = GetTotalWeight(weightedDistributions.range);

    if (distributionRange <= distributionValue) return { data: [] };

    const distributionRng = Emplace(distributionRngs);
    distributionRng.op = RngOp.SelectLowMidHigh;
    distributionRng.value = distributionValue;
    distributionRng.range = distributionRange;

    return distributionRngs;
  }

  private static GenerateFromReelReplace(replace: SymbolGrid, math: IMathRules, type: RoundType, distributionIndex: number): RngSequence {
    const reelReplaceRngs: RngSequence = { data: [] };

    const replaceInputSymbols = RulesHelper.GetSpinReplaceInputSymbols(math, type, distributionIndex);
    console.assert(replaceInputSymbols.size === 1);
    const inputSymbol = [...replaceInputSymbols][0];
    const allowedValues = RulesHelper.GetSpinReplacedOutputSymbols(math, type, distributionIndex, inputSymbol);

    // extract the transformed symbols
    const transformedSymbols: SymbolId[] = [];
    for (const reel of replace) {
      transformedSymbols.push(...reel.filter(cellValue => allowedValues.has(cellValue)));
    }

    // rng transform operations
    const replaceInputSymbol = math.GetReelRoundRules(type).GetSpinRules().GetConfig().replaceMaps.range[distributionIndex].value.get(inputSymbol)!;
    console.assert(replaceInputSymbol.repetition === false);

    const weightOffset: WeightedOffset<SymbolId> = new Map();
    const totalWeight = GetTotalWeight(replaceInputSymbol.range);

    for (const transformedSym of transformedSymbols) {
      const transformRng = Emplace(reelReplaceRngs);
      transformRng.op = replaceInputSymbol.op; // Egt::GameCore::RngOp::CoinVal;
      transformRng.value = MinMaxWeightForValue(replaceInputSymbol, transformedSym, weightOffset)[0];
      transformRng.range = totalWeight - GetTotalOffset(weightOffset);

      // correct weight
      Decrement(weightOffset, transformedSym);
    }

    return reelReplaceRngs;
  }

  static GenerateFromHoldAndSpin(
    holdAndSpin: SymbolGrid,
    previous: SymbolGrid,
    trigger: SymbolGrid,
    math: IMathRules,
    type: RoundType,
    distributionIndex: number,
  ): RngSequence {
    const holdAndSpinRngs: RngSequence = { data: [] };

    const replaceInputSymbols = RulesHelper.GetHoldAndSpinReplaceInputSymbols(math, type, distributionIndex);
    console.assert(replaceInputSymbols.size === 1);
    const inputSymbol = [...replaceInputSymbols][0];
    const allowedValues = RulesHelper.GetHoldAndSpinReplacedOutputSymbols(math, type, distributionIndex, inputSymbol);

    // extract the transformed symbols
    const finalSymbols: SymbolId[] = [];
    const inheritedWeightOffset: WeightedOffset<SymbolId> = new Map();
    for (let reelIndex = 0; reelIndex < previous.length; ++reelIndex) {
      for (let rowIndex = 0; rowIndex < previous[reelIndex].length; ++rowIndex) {
        const prevSym = previous[reelIndex][rowIndex];
        const wasCoin = allowedValues.has(prevSym);
        if (!wasCoin) {
          finalSymbols.push(holdAndSpin[reelIndex][rowIndex]);
        }
        if (wasCoin && prevSym !== trigger[reelIndex][rowIndex]) {
          Decrement(inheritedWeightOffset, prevSym);
        }
      }
    }
    if (!finalSymbols.length) return { data: [] };
    // rng
    // has or not a coin on the position
    const holdAndSpinRulesConfig = math.GetHoldAndSpinRoundRules(type).GetConfig();

    for (const finalSymbol of finalSymbols) {
      const isCoin = allowedValues.has(finalSymbol);
      Append(holdAndSpinRngs, ResultToRng.GenerateFromCoinPosition(math, type, isCoin));
    }
    // when there is a coin
    const configReplaceMap = holdAndSpinRulesConfig.replaceMaps.range[distributionIndex].value.get(inputSymbol)!;
    console.assert(configReplaceMap.repetition === false);
    const weightOffset: WeightedOffset<SymbolId> = new Map(inheritedWeightOffset);

    const totalWeight = GetTotalWeight(configReplaceMap.range);
    for (const finalSymbol of finalSymbols) {
      const isCoin = allowedValues.has(finalSymbol);
      if (!isCoin) continue;
      const coinValRng: RngNumber = { op: RngOp.Undefined, range: 0, value: 0 };
      {
        coinValRng.op = configReplaceMap.op; // ::GameCore::RngOp::CoinType;
        coinValRng.value = MinMaxWeightForValue(configReplaceMap, finalSymbol, weightOffset)[0];
        coinValRng.range = totalWeight - GetTotalOffset(weightOffset);
      }
      holdAndSpinRngs.data.push(coinValRng);

      // correct weight
      Decrement(weightOffset, finalSymbol);
    }
    return holdAndSpinRngs;
  }

  private static GenerateFromCoinPosition(math: IMathRules, type: RoundType, isCoin: boolean): RngSequence {
    const dropDistribution = math.GetHoldAndSpinRoundRules(type).GetConfig().dropDistribution;
    console.assert(dropDistribution.repetition === true);
    const coinPositionRngs: RngSequence = { data: [] };

    const coinPosRng = Emplace(coinPositionRngs);
    coinPosRng.op = dropDistribution.op; // Egt::GameCore::RngOp::CoinPos;
    coinPosRng.value = MinMaxWeightForValue(dropDistribution, isCoin)[0];
    coinPosRng.range = GetTotalWeight(dropDistribution.range);

    return coinPositionRngs;
  }

  static GenerateFromWheelSector(sectorId: WheelSectorId, math: IMathRules, type: RoundType): RngSequence {
    const wheelRulesConfig = math.GetWheelRoundRules(type).GetConfig();
    const wheelSectors = wheelRulesConfig.sectors;

    let lowerBound = 0;
    let sectorWeight = 0;
    {
      const sectors = wheelSectors.range;
      const sectorIt = sectors.findIndex(sector => sectorId === sector.value.id);
      lowerBound = sectors.slice(0, sectorIt).reduce((sum, sector) => sum + sector.weight, 0);
      sectorWeight = sectors[sectorIt].weight;
    }
    // Core::Rng::GetRandom(sectorWeight - 1): any roll of the sector
    const randomRoll = lowerBound + Math.floor(Math.random() * sectorWeight);

    const totalWeight = GetTotalWeight(wheelSectors.range);
    const sectorRng: RngNumber = { op: RngOp.Undefined, range: 0, value: 0 };
    {
      sectorRng.op = type === RoundType.Gamble
        ? RngOp.DrawCard
        : type === RoundType.Wheel ? RngOp.StopWheel : RngOp.Undefined;
      sectorRng.value = randomRoll;
      sectorRng.range = totalWeight;
    }

    const rngs: RngSequence = { data: [] };
    rngs.data.push(sectorRng);

    return rngs;
  }

  static GenerateFromRtpReducer(isZeroRound: boolean, math: IMathRules, type: RoundType): RngSequence {
    console.assert(!!math);
    const isReelType = math.HasReelRoundRules(type);
    if (!isReelType) return { data: [] };
    const rtpRules = math.GetReelRoundRules(type).GetRtpRules();

    const rtpRng: RngNumber = { op: RngOp.Undefined, range: 0, value: 0 };
    {
      // the chance of the least bet (C++'s std::map begin)
      const zeroRoundChancePerBet = rtpRules.GetConfig().zeroRoundChancePerBet;
      const leastBet = Math.min(...zeroRoundChancePerBet.keys());
      const totalWeight = zeroRoundChancePerBet.get(leastBet)!.denominator;
      const value = isZeroRound ? 0 : totalWeight - 1;
      rtpRng.op = RngOp.RtpReducer;
      rtpRng.value = value;
      rtpRng.range = totalWeight;
    }

    const rngs: RngSequence = { data: [] };
    rngs.data.push(rtpRng);

    return rngs;
  }

  static GenerateFromSubScreen(
    subScreenIndex: number,
    reelSetIndex: number,
    replacedSpinSearch: SymbolGrid,
    wildcardSearchSymbolIds: Set<SymbolId>,
    math: IMathRules,
    type: RoundType,
  ): RngSequence {
    console.assert(!!math);
    console.assert(type === RoundType.Tetra);
    const tetraRules = math.GetReelRoundRules(type).GetTetraSpinRules();
    console.assert(subScreenIndex < tetraRules.GetSubScreenCount());

    const subScreenRules = tetraRules.GetSubScreenRules(subScreenIndex);
    const spinStops = RulesHelper.FindFirstStops(replacedSpinSearch, wildcardSearchSymbolIds, subScreenRules, reelSetIndex);

    return ResultToRng.GenerateFromSubScreenStops(subScreenIndex, reelSetIndex, spinStops, math, type);
  }

  static GenerateFromSubScreenStops(subScreenIndex: number, reelSetIndex: number, spinStops: number[], math: IMathRules, type: RoundType): RngSequence {
    console.assert(!!math);
    console.assert(type === RoundType.Tetra);
    const tetraRules = math.GetReelRoundRules(type).GetTetraSpinRules();
    console.assert(subScreenIndex < tetraRules.GetSubScreenCount());

    const rngs: RngSequence = { data: [] };
    Append(rngs, ResultToRng.GenerateFromReelRoundRules(reelSetIndex, spinStops, tetraRules.GetSubScreenRules(subScreenIndex)));
    return rngs;
  }

  static GenerateFromStickSymbols(subScreenIndex: number, codePerReel: number[], math: IMathRules, type: RoundType): RngSequence {
    console.assert(!!math);
    console.assert(type === RoundType.Tetra);
    const tetraRules = math.GetReelRoundRules(type).GetTetraSpinRules();
    console.assert(subScreenIndex < tetraRules.GetSubScreenCount());

    const stickConfig = tetraRules.GetSubScreenRules(subScreenIndex).GetConfig().stickSymbolsConfig;
    if (stickConfig.symbolId === -1) return { data: [] };

    const stickSymbolsRngs: RngSequence = { data: [] };
    for (let reelIndex = 0; reelIndex < stickConfig.distrPerReel.length; ++reelIndex) {
      const distr = stickConfig.distrPerReel[reelIndex];
      const patchIdx = reelIndex < codePerReel.length ? codePerReel[reelIndex] : 0;
      console.assert(patchIdx >= 0 && patchIdx < distr.range.length);

      const wildPosRng = Emplace(stickSymbolsRngs);
      wildPosRng.op = distr.op; // Egt::GameCore::RngOp::WildPos
      wildPosRng.value = MinMaxWeightForValue(distr, patchIdx)[0];
      wildPosRng.range = GetTotalWeight(distr.range);
    }

    return stickSymbolsRngs;
  }

  private static RevertReelTransformation(transformed: SymbolGrid, math: IMathRules, type: RoundType, distributionIndex: number): SymbolGrid {
    if (!transformed.length) return [];
    if (!transformed[0].length) return [];

    const beforeReplace = transformed.map(reel => [...reel]);
    const replaceInputSymbols = RulesHelper.GetSpinReplaceInputSymbols(math, type, distributionIndex);
    for (const inputSymbol of replaceInputSymbols) {
      const outputSymbols = RulesHelper.GetSpinReplacedOutputSymbols(math, type, distributionIndex, inputSymbol);
      for (const reel of beforeReplace) {
        for (let i = 0; i < reel.length; i++) {
          // is transformed ?
          if (outputSymbols.has(reel[i])) {
            reel[i] = inputSymbol;
          }
        }
      }
    }
    return beforeReplace;
  }
}
