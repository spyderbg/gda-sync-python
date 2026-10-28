// Egt::Game::AlphaFamily::MathRules (NordicRushMath/MathRules.h/.cpp): the rules of the main, free, coins and coins free
// rounds, the hold and spin round each of them triggers, and the coins wheel, made from the math file the setup names (an
// IData of math/RssIData.json) and the fake reels, as MathRules::CreateRules() fills them.

import { RngOp } from '@game/engine/GameCore/Random/IRng';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import {
  Currency, ELastResultSlot, ERoundTags, PayTable, PayTableV2, RoundType, type SymbolId, type SymbolIds,
} from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { Weighted, WeightedValue } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Weighted';
import { HoldAndSpinRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules';
import { HoldAndSpinRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules.data';
import { ReelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules';
import { ReelRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules.data';
import { WildSymbol } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/LineRules.data';
import type { ReplaceSymbolsMap } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/SpinRules.data';
import { VisualAnalyzeConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.data';
import { WheelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules';
import { type WheelSector, WheelRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import type { NordicRushMath } from './NordicRushMath';
import type { FakeReelsConfig, MathRulesInitConfig } from './MathRules.data';
import type { NordicRush } from './SimulatorConfig/NordicRushMath.data';

// helpers
function toWeighted<T>(op: RngOp, repetition: boolean, weights: number[], values: T[]): Weighted<T> {
  const result: Weighted<T> = { op, repetition, range: [] };
  for (let i = 0; i < values.length; i++) {
    result.range.push({ weight: weights[i], value: values[i] });
  }
  return result;
}

function toVecInt64(values: number[]) {
  return [...values];
}

export class MathRules implements IMathRules {
  private m_reelRoundRules = new Map<RoundType, ReelRoundRules>();
  private m_holdAndSpinRoundRules = new Map<RoundType, HoldAndSpinRoundRules>();
  private m_wheelRoundRules = new Map<RoundType, WheelRoundRules>();
  private m_availableRoundTypes: RoundType[] = [];
  private m_consecutiveRoundTypePriorities = new Map<RoundType, number>();

  constructor(private readonly m_math: NordicRushMath) {}

  Init(rulesConfig: MathRulesInitConfig) {
    this.m_math.RuntimeAdd(IMathRules, this);

    this.CreateRules(rulesConfig);
    this.CollectAvailableRoundTypes();
    this.CollectConsecutiveRoundTypePriorities();
  }

  Deinit() {
    this.m_math.RuntimeRemove(IMathRules);
  }

  GetAvailableRoundTypes() {
    return this.m_availableRoundTypes;
  }

  GetConsecutiveRoundTypePriorities() {
    return this.m_consecutiveRoundTypePriorities;
  }

  HasReelRoundRules(roundType: RoundType) {
    return this.m_reelRoundRules.has(roundType);
  }

  GetReelRoundRules(roundType: RoundType) {
    const rules = this.m_reelRoundRules.get(roundType);
    if (!rules) throw new Error(`ReelRoundRules not found for roundType=${roundType}`);
    return rules;
  }

  HasHoldAndSpinRules(roundType: RoundType) {
    return this.m_holdAndSpinRoundRules.has(roundType);
  }

  GetHoldAndSpinRoundRules(roundType: RoundType) {
    const rules = this.m_holdAndSpinRoundRules.get(roundType);
    if (!rules) throw new Error(`HoldAndSpinRoundRules not found for round = ${roundType}`);
    return rules;
  }

  HasWheelRoundRules(roundType: RoundType) {
    return this.m_wheelRoundRules.has(roundType);
  }

  GetWheelRoundRules(roundType: RoundType) {
    const rules = this.m_wheelRoundRules.get(roundType);
    if (!rules) throw new Error(`Wheel::RoundRules not found for roundType=${roundType}`);
    return rules;
  }

  /** The rules of the math file's game, without the runtime: what CreateRules() makes, for the tests. */
  static CreateRoundRules(gameConfig: NordicRush.Game, fakeReelsConfig: FakeReelsConfig, rulesConfig: MathRulesInitConfig) {
    const reelRoundRules = new Map<RoundType, ReelRoundRules>();
    const holdAndSpinRoundRules = new Map<RoundType, HoldAndSpinRoundRules>();
    const wheelRoundRules = new Map<RoundType, WheelRoundRules>();

    // helpers
    const fs1 = 30, fs2 = 31, fs3 = 32, fs4 = 33, jp1 = 34, jp2 = 35, jp3 = 36, jp4 = 37;
    const coinValues: SymbolIds = [fs1, fs2, fs3, fs4, jp1, jp2, jp3, jp4];

    const fsPaytable = (idx: number) => {
      const n = gameConfig.reelsCount * gameConfig.rowsCount;
      const result: number[] = new Array(n + 1).fill(0);

      for (let i = 0; i <= n; i++) {
        result[i] = gameConfig.coinFsValues[idx] * i;
      }

      return result;
    };

    const jpPaytable = (idx: number) => {
      const n = gameConfig.reelsCount * gameConfig.rowsCount;
      const result: number[] = new Array(n + 1).fill(0);

      for (let i = 0; i <= n; i++) {
        switch (idx) {
          case 3:
            result[i] =
              Math.trunc(i / 3) * gameConfig.grandX3Value + (i % 3) * gameConfig.coinJpValues[idx];
            break;
          case 2:
            result[i] =
              Math.trunc(i / 2) * gameConfig.majorX2Value + (i % 2) * gameConfig.coinJpValues[idx];
            break;
          default: result[i] = gameConfig.coinJpValues[idx] * i; break;
        }
      }

      return result;
    };

    // config with no impact on math and reel outcome
    const visualConfig = VisualAnalyzeConfig();
    visualConfig.attractionScatterCount = new Map();
    visualConfig.attractionLineCount = new Map();
    visualConfig.winTypeThresholds = new Map([
      [fakeReelsConfig.animationCoinThreshold, ERoundTags.BigWin],
    ]);
    visualConfig.winTypeThresholdsPerSymbol = new Map<SymbolId, Map<number, ERoundTags>>([
      [36, new Map([[2, ERoundTags.MajorSymbolPrize]])], // jp3
      [37, new Map([[3, ERoundTags.GrandSymbolPrize]])], // jp4
    ]);
    visualConfig.nearMissSymbolCount = new Map();
    visualConfig.stackFigureConfig = { visibleCols: 0, visibleRows: 0, stackedFigureId: -1 };

    const createRoundConfig = (
      roundType: RoundType,
      betType: CurrencyType,
      rewardType: CurrencyType,
      freeType: CurrencyType,
      simConfig: NordicRush.RoundMain | NordicRush.RoundFree,
    ) => {
      const config = ReelRoundRulesConfig();

      config.version = '0.0.1';
      config.fakeReels = (roundType === RoundType.Free || roundType === RoundType.CoinsFree ? fakeReelsConfig.fakeReelsFree : fakeReelsConfig.fakeReels);
      config.rowsCount = gameConfig.rowsCount;
      config.allowedBetLines = [10];
      config.roundType = roundType;
      config.betBarCurrencyType = betType;

      config.rtpConfig.rtp = rulesConfig.simRtp;
      config.rtpConfig.zeroRoundChancePerBet = new Map();
      config.rtpConfig.hasLeftOver = false;

      config.estimateValues = new Map([
        [Currency.Credits, 1],
        [Currency.CoinsSpinEnergy, 1],
        [Currency.FreeSpinEnergy, 3],
        [Currency.CoinsFreeSpinEnergy, 3],
      ]);

      {
        const spin = config.spinConfig;
        const names = simConfig.symbolsData.symbolNames;

        for (let i = 0; i < names.length; i++) {
          spin.symbols.push({ id: i, name: names[i] });
        }

        spin.symbols.push({ id: fs1, name: 'HS_FREE1' });
        spin.symbols.push({ id: fs2, name: 'HS_FREE2' });
        spin.symbols.push({ id: fs3, name: 'HS_FREE3' });
        spin.symbols.push({ id: fs4, name: 'HS_FREE4' });
        spin.symbols.push({ id: jp1, name: 'HS_MINI' });
        spin.symbols.push({ id: jp2, name: 'HS_MINOR' });
        spin.symbols.push({ id: jp3, name: 'HS_MAJOR' });
        spin.symbols.push({ id: jp4, name: 'HS_GRAND' });

        spin.weightedReels = toWeighted(
          RngOp.SelectReels,
          true,
          simConfig.reelsDistribution.map(r => r.probability),
          simConfig.reelsDistribution.map(r => r.intReels));

        spin.additionalRowsToInclude = 1;
      }

      {
        const line = config.lineConfig;
        line.lines = simConfig.lines;
        line.linePayTables = [new PayTable(rewardType, simConfig.linePaytable)];

        line.wildSymbols.push(WildSymbol(simConfig.symbolsData.wildId));
      }

      {
        const coinId = simConfig.symbolsData.coinId;
        const coinValues: SymbolIds = [fs1, fs2, fs3, fs4];

        const values: ReplaceSymbolsMap[] = [];
        values.push(new Map([[coinId, toWeighted(RngOp.CoinVal, false, simConfig.coinFsLowProbaPool, coinValues)]]));
        values.push(new Map([[coinId, toWeighted(RngOp.CoinVal, false, simConfig.coinFsMidProbaPool, coinValues)]]));
        values.push(new Map([[coinId, toWeighted(RngOp.CoinVal, false, simConfig.coinFsHighProbaPool, coinValues)]]));
        config.spinConfig.replaceMaps = toWeighted(RngOp.SelectLowMidHigh, true, simConfig.probaLMH, values);
      }

      {
        const hs = config.holdAndSpinTriggerConfig;
        hs.triggerSymbolIds = coinValues;
        hs.triggerSymbolCount = simConfig.cashHeat.triggerCoins;
        hs.initialSpins = simConfig.cashHeat.initialSpins;
        hs.combinationId = simConfig.symbolsData.coinId;
        hs.paytable = [
          new PayTableV2(rewardType, new Map([[jp1, jpPaytable(0)], [jp2, jpPaytable(1)], [jp3, jpPaytable(2)], [jp4, jpPaytable(3)]])),
          new PayTableV2(freeType, new Map([[fs1, fsPaytable(0)], [fs2, fsPaytable(1)], [fs3, fsPaytable(2)], [fs4, fsPaytable(3)]])),
        ];
      }

      return config;
    };

    // Main
    {
      const config = createRoundConfig(
        RoundType.Main,
        Currency.Credits,
        Currency.CoinsSpinEnergy,
        Currency.FreeSpinEnergy,
        gameConfig.roundMain);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundMain.allowedBets);

      reelRoundRules.set(RoundType.Main, new ReelRoundRules(config, visualConfig));
    }

    // Free
    {
      const config = createRoundConfig(
        RoundType.Free,
        Currency.FreeSpinEnergy,
        Currency.CoinsSpinEnergy,
        Currency.FreeSpinEnergy,
        gameConfig.roundFree);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundMain.allowedBets);
      config.lastResultSlot = ELastResultSlot.Free;

      reelRoundRules.set(RoundType.Free, new ReelRoundRules(config, visualConfig));
    }

    // Coins
    {
      const config = createRoundConfig(
        RoundType.Coins,
        Currency.CoinsSpinEnergy,
        Currency.Credits,
        Currency.CoinsFreeSpinEnergy,
        gameConfig.roundPuntiMain);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundPuntiMain.allowedBets);
      config.rtpConfig.hasLeftOver = true;
      config.maxBetMultiplier = gameConfig.maxBetMultiplier ?? 0;

      reelRoundRules.set(RoundType.Coins, new ReelRoundRules(config, visualConfig));
    }

    // CoinsFree
    {
      const config = createRoundConfig(
        RoundType.CoinsFree,
        Currency.CoinsFreeSpinEnergy,
        Currency.Credits,
        Currency.CoinsFreeSpinEnergy,
        gameConfig.roundPuntiFree);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundPuntiMain.allowedBets);
      config.lastResultSlot = ELastResultSlot.Free;

      reelRoundRules.set(RoundType.CoinsFree, new ReelRoundRules(config, visualConfig));
    }

    // HoldAndSpin
    const createHS = (roundType: RoundType, rewardType: CurrencyType, freeType: CurrencyType, simConfig: NordicRush.RoundMain | NordicRush.RoundFree) => {
      const hs = HoldAndSpinRoundRulesConfig();
      const coinId = simConfig.symbolsData.coinId;

      hs.triggerRoundType = roundType;
      hs.triggerSymbolIds = coinValues;
      hs.triggerSymbolCount = simConfig.cashHeat.triggerCoins;
      hs.initialSpins = simConfig.cashHeat.initialSpins;
      hs.dropSymbolId = coinId;
      hs.dropDistribution = toWeighted(
        RngOp.CoinPos, true, simConfig.cashHeat.dropCoinYesNo, [true, false]);

      const low = [...simConfig.cashHeat.coinFsLowProbaPool];
      const mid = [...simConfig.cashHeat.coinFsMidProbaPool];
      const high = [...simConfig.cashHeat.coinFsHighProbaPool];
      low.push(...simConfig.cashHeat.coinJpLowProbaPool);
      mid.push(...simConfig.cashHeat.coinJpMidProbaPool);
      high.push(...simConfig.cashHeat.coinJpHighProbaPool);

      const values: ReplaceSymbolsMap[] = [];
      values.push(new Map([[coinId, toWeighted(RngOp.CoinType, false, low, coinValues)]]));
      values.push(new Map([[coinId, toWeighted(RngOp.CoinType, false, mid, coinValues)]]));
      values.push(new Map([[coinId, toWeighted(RngOp.CoinType, false, high, coinValues)]]));
      hs.replaceMaps = toWeighted(RngOp.SelectLowMidHigh, true, simConfig.probaLMH, values);

      hs.paytable = [
        new PayTableV2(rewardType, new Map([[jp1, jpPaytable(0)], [jp2, jpPaytable(1)], [jp3, jpPaytable(2)], [jp4, jpPaytable(3)]])),
        new PayTableV2(freeType, new Map([[fs1, fsPaytable(0)], [fs2, fsPaytable(1)], [fs3, fsPaytable(2)], [fs4, fsPaytable(3)]])),
      ];

      hs.fakeReels = fakeReelsConfig.fakeReelsFlash;

      hs.fakeDrops = toWeighted<SymbolId>(
        RngOp.HoldAndSpinNoCoinDrop,
        true,
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 2, 3, 4, 5, 6, 7, 8]);

      hs.winTypeThresholds = new Map([
        [fakeReelsConfig.animationCoinThreshold, ERoundTags.BigWin],
      ]);
      hs.winTypeThresholdsPerSymbol = new Map<SymbolId, Map<number, ERoundTags>>([
        [36, new Map([[2, ERoundTags.MajorSymbolPrize]])], // jp3
        [37, new Map([[3, ERoundTags.GrandSymbolPrize]])], // jp4
      ]);

      return hs;
    };

    {
      const config =
        createHS(RoundType.Main, Currency.CoinsSpinEnergy, Currency.FreeSpinEnergy, gameConfig.roundMain);
      holdAndSpinRoundRules.set(RoundType.Main, new HoldAndSpinRoundRules(config));
    }

    {
      const config =
        createHS(RoundType.Free, Currency.CoinsSpinEnergy, Currency.FreeSpinEnergy, gameConfig.roundFree);
      holdAndSpinRoundRules.set(RoundType.Free, new HoldAndSpinRoundRules(config));
    }

    {
      const config =
        createHS(RoundType.Coins, Currency.Credits, Currency.CoinsFreeSpinEnergy, gameConfig.roundPuntiMain);
      holdAndSpinRoundRules.set(RoundType.Coins, new HoldAndSpinRoundRules(config));
    }

    {
      const config = createHS(
        RoundType.CoinsFree, Currency.Credits, Currency.CoinsFreeSpinEnergy, gameConfig.roundPuntiFree);
      holdAndSpinRoundRules.set(RoundType.CoinsFree, new HoldAndSpinRoundRules(config));
    }

    // Coin Wheel
    {
      const wheelWeights = gameConfig.roundWheel.weights;
      const wheelPercents = gameConfig.roundWheel.percentageValues;
      assert(wheelWeights.length === 4);
      assert(wheelPercents.length === 4);
      assert(
        (wheelPercents[0] <= wheelPercents[1]) && (wheelPercents[1] <= wheelPercents[2]) &&
        (wheelPercents[2] <= wheelPercents[3]));

      const coinExchangeWheelConfig = WheelRoundRulesConfig();
      coinExchangeWheelConfig.roundType = RoundType.Wheel;
      coinExchangeWheelConfig.version = '0.0.1';
      coinExchangeWheelConfig.rtp = 1.00;
      coinExchangeWheelConfig.maxAttempts = 1;
      const weightedWheelSectors: WeightedValue<WheelSector>[] = [
        { weight: wheelWeights[0], value: { id: 0, name: 'RED', payouts: [{ currencyType: Currency.Credits, pays: wheelPercents[0] / 100.0 }] } },
        { weight: wheelWeights[1], value: { id: 1, name: 'GREEN', payouts: [{ currencyType: Currency.Credits, pays: wheelPercents[1] / 100.0 }] } },
        { weight: wheelWeights[2], value: { id: 2, name: 'PURPLE', payouts: [{ currencyType: Currency.Credits, pays: wheelPercents[2] / 100.0 }] } },
        { weight: wheelWeights[3], value: { id: 3, name: 'BLUE', payouts: [{ currencyType: Currency.Credits, pays: wheelPercents[3] / 100.0 }] } },
      ];

      coinExchangeWheelConfig.sectors = { op: RngOp.StopWheel, repetition: true, range: weightedWheelSectors };
      coinExchangeWheelConfig.bettingGroups = [{ id: 0, name: 'ALL', sectorIds: [0, 1, 2, 3] }];
      coinExchangeWheelConfig.minimumBet = 100;
      wheelRoundRules.set(RoundType.Wheel, new WheelRoundRules(coinExchangeWheelConfig));
    }

    return { reelRoundRules, holdAndSpinRoundRules, wheelRoundRules };
  }

  private CreateRules(rulesConfig: MathRulesInitConfig) {
    // read from simulator's json config
    const resources = this.m_math.RuntimeGet(IResources);
    const gameConfig = resources.GetIData<NordicRush.Game>(rulesConfig.mathFileId);
    const fakeReelsConfig = resources.GetIData<FakeReelsConfig>('FakeReelsConfig');
    const { reelRoundRules, holdAndSpinRoundRules, wheelRoundRules } = MathRules.CreateRoundRules(gameConfig, fakeReelsConfig, rulesConfig);
    this.m_reelRoundRules = reelRoundRules;
    this.m_holdAndSpinRoundRules = holdAndSpinRoundRules;
    this.m_wheelRoundRules = wheelRoundRules;
  }

  private CollectConsecutiveRoundTypePriorities() {
    this.m_consecutiveRoundTypePriorities = new Map([
      [RoundType.HoldAndSpin, 4],
      [RoundType.CoinsFree, 3],
      [RoundType.Free, 3],
      [RoundType.Coins, 2],
      [RoundType.Main, 2],
      [RoundType.Wheel, 1],
    ]);
  }

  private CollectAvailableRoundTypes() {
    this.m_availableRoundTypes = [];

    for (const roundType of this.m_reelRoundRules.keys()) {
      this.m_availableRoundTypes.push(roundType);
    }

    for (const roundType of this.m_wheelRoundRules.keys()) {
      this.m_availableRoundTypes.push(roundType);
    }
  }
}
