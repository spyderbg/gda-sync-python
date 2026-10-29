// Egt::Game::AlphaFamily::MathRules (JokerReelsCoins10Math/MathRules.h/.cpp): the rules of the main and coins rounds, the
// coins wheel and the red/black gamble, made from the math file the setup names (an IData of math/RssIData.json) and
// the fake reels, as MathRules::CreateRules() fills them.

import { RngOp } from '@game/engine/GameCore/Random/IRng';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { Currency, ERoundTags, PayTable, PayTableV2, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { Weighted, WeightedValue } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Weighted';
import type { HoldAndSpinRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules';
import { ReelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules';
import { ReelRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules.data';
import { ExpandPolicy } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/ExpandRules.data';
import { WildSymbol } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/LineRules.data';
import { VisualAnalyzeConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.data';
import { WheelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules';
import { type WheelSector, WheelRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import type { JokerReelsCoins10Math } from './JokerReelsCoins10Math';
import type { FakeReelsConfig, MathRulesInitConfig } from './MathRules.data';
import type { GameCoins, Round } from './SimulatorConfig/BasicHot.data';
import type { SymbolsData } from './SimulatorConfig/MathDefs.data';

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
  private m_wheelRoundRules = new Map<RoundType, WheelRoundRules>();
  private m_availableRoundTypes: RoundType[] = [];
  private m_consecutiveRoundTypePriorities = new Map<RoundType, number>();

  constructor(private readonly m_math: JokerReelsCoins10Math) {}

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

  HasHoldAndSpinRules(_roundType: RoundType) {
    return false;
  }

  GetHoldAndSpinRoundRules(roundType: RoundType): HoldAndSpinRoundRules {
    throw new Error(`HoldAndSpinRoundRules not found for round = ${roundType}`);
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
  static CreateRoundRules(gameConfig: GameCoins, fakeReelsConfig: FakeReelsConfig, rulesConfig: MathRulesInitConfig) {
    const reelRoundRules = new Map<RoundType, ReelRoundRules>();
    const wheelRoundRules = new Map<RoundType, WheelRoundRules>();

    // config with no impact on math and reel outcome
    const visualConfig = VisualAnalyzeConfig();
    visualConfig.attractionScatterCount = new Map();
    visualConfig.attractionLineCount = new Map();
    visualConfig.winTypeThresholds = new Map([[15, ERoundTags.BigWin]]);
    visualConfig.nearMissSymbolCount = new Map();
    visualConfig.stackFigureConfig = { visibleCols: 5, visibleRows: 3, stackedFigureId: 8 };

    const createRoundConfig = (
      roundType: RoundType,
      betType: CurrencyType,
      rewardType: CurrencyType,
      simConfig: Round,
      simSymbolsData: SymbolsData,
    ) => {
      const config = ReelRoundRulesConfig();

      config.version = '0.0.1';
      config.fakeReels = fakeReelsConfig.fakeReels;
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
      ]);

      {
        const spin = config.spinConfig;
        const names = simSymbolsData.symbolNames;

        for (let i = 0; i < names.length; i++) {
          spin.symbols.push({ id: i, name: names[i] });
        }

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
        const linePaytable = simConfig.linePaytable.map(row => toVecInt64(row));
        line.linePayTables = [new PayTable(rewardType, linePaytable)];

        line.wildSymbols.push(WildSymbol(simSymbolsData.wildId));
      }

      {
        const scatter = config.scatterConfig;
        for (const scatterSymId of simSymbolsData.scatterIds) {
          scatter.scatterSymbols.push({ symbolId: scatterSymId, combinationId: 2 });

          const simScatter = simConfig.scatterPaytable[scatterSymId];
          scatter.scatterPayTables.push(new PayTableV2(rewardType, new Map([[scatterSymId, toVecInt64(simScatter)]])));
        }
      }

      if (simConfig.isExpandingWild) {
        const expand = config.expandConfig;
        expand.expandSymbols.push({ symbolId: simSymbolsData.wildId, include: new Set(), exclude: new Set(), policy: ExpandPolicy.WinForming });
      }

      return config;
    };

    // Main
    {
      const config = createRoundConfig(
        RoundType.Main, Currency.Credits, Currency.CoinsSpinEnergy, gameConfig.roundMain, gameConfig.symbolsData);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundMain.allowedBets);

      reelRoundRules.set(RoundType.Main, new ReelRoundRules(config, visualConfig));
    }

    // Coin
    {
      const config = createRoundConfig(
        RoundType.Coins,
        Currency.CoinsSpinEnergy,
        Currency.Credits,
        gameConfig.roundCoins,
        gameConfig.symbolsData);
      config.allowedBetAmounts = toVecInt64(gameConfig.roundMain.allowedBets);
      config.rtpConfig.hasLeftOver = true;
      config.maxBetMultiplier = gameConfig.maxBetMultiplier ?? 0;

      reelRoundRules.set(RoundType.Coins, new ReelRoundRules(config, visualConfig));
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

    // Gamble Red/Black
    {
      const gambleConfig = WheelRoundRulesConfig();
      gambleConfig.roundType = RoundType.Gamble;
      gambleConfig.version = '0.0.1';
      gambleConfig.rtp = 1.00;
      gambleConfig.maxAttempts = 1;
      gambleConfig.sectors = {
        op: RngOp.DrawCard,
        repetition: true,
        range: [
          { weight: 1, value: { id: 0, name: 'SPADE', payouts: [{ currencyType: Currency.Credits, pays: 2 }] } },
          { weight: 1, value: { id: 1, name: 'HEART', payouts: [{ currencyType: Currency.Credits, pays: 2 }] } },
          { weight: 1, value: { id: 2, name: 'CLUB', payouts: [{ currencyType: Currency.Credits, pays: 2 }] } },
          { weight: 1, value: { id: 3, name: 'DIAMOND', payouts: [{ currencyType: Currency.Credits, pays: 2 }] } },
        ],
      };
      gambleConfig.bettingGroups = [
        { id: 0, name: 'RED', sectorIds: [1, 3] }, { id: 1, name: 'BLACK', sectorIds: [0, 2] }];
      wheelRoundRules.set(RoundType.Gamble, new WheelRoundRules(gambleConfig));
    }

    return { reelRoundRules, wheelRoundRules };
  }

  private CreateRules(rulesConfig: MathRulesInitConfig) {
    // read from simulator's json config
    const resources = this.m_math.RuntimeGet(IResources);
    const gameConfig = resources.GetIData<GameCoins>(rulesConfig.mathFileId);
    const fakeReelsConfig = resources.GetIData<FakeReelsConfig>('FakeReelsConfig');
    const { reelRoundRules, wheelRoundRules } = MathRules.CreateRoundRules(gameConfig, fakeReelsConfig, rulesConfig);
    this.m_reelRoundRules = reelRoundRules;
    this.m_wheelRoundRules = wheelRoundRules;
  }

  private CollectConsecutiveRoundTypePriorities() {
    this.m_consecutiveRoundTypePriorities = new Map([
      [RoundType.Coins, 2],
      [RoundType.Main, 2],
      [RoundType.Wheel, 1],
      [RoundType.Gamble, 1],
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
