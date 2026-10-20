// A game's math rules as data: which rules each round type has, and where in the math file their values are.
//
// This has no C++ counterpart. In C++ each game's MathRules::CreateRules() fills its ReelRoundRulesConfigs by hand from
// the math file's structs; here a description says the same, so that one source makes both:
//
//   - the browser game's rules: BuildReelRoundRules() fills the same ReelRoundRulesConfigs (the game's MathRules.ts);
//   - the C++ code: export/MathExporter.ts writes the game's MathRules.cpp, its math module and its math file's structs.
//
// A value of the math file is named by its path, such as 'mainRound.allowedBets'. A new rule is added here, to
// BuildScreen(), and to MathExporter's ScreenCpp(), in the C++ names of its config.

import { RngOp } from '../engine/GameCore/Random/IRng';
import { Currency, ERoundTags, PayTable, PayTableV2, RoundType } from '../alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { Weighted } from '../alpha_family/libs/AlphaFamily/Math/Common/Weighted';
import { ReelRoundRules } from '../alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules';
import { ReelRoundRulesConfig } from '../alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules.data';
import { ExpandPolicy } from '../alpha_family/libs/AlphaFamily/Math/Reel/Rules/ExpandRules.data';
import { WildSymbol } from '../alpha_family/libs/AlphaFamily/Math/Reel/Rules/LineRules.data';
import { SubScreenConfig } from '../alpha_family/libs/AlphaFamily/Math/Reel/Rules/TetraSpinRules.data';
import { VisualAnalyzeConfig } from '../alpha_family/libs/AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.data';

/** A value of the math file, by its path: 'tetraRound.reelsScreen0'. */
export type MathPath = string;
export type RoundTypeName = Exclude<keyof typeof RoundType, number>;
export type RoundTagName = 'BigWin' | 'SuperWin' | 'EpicWin' | 'MegaWin';

/** The rules of one reel screen: a round's, or a tetra round's sub screen's. */
export interface ScreenDescription {
  /** A ReelsDistribution: [{probability, intReels}], chosen by probability (RngOp::SelectReels). */
  reels: MathPath;
  additionalRowsToInclude: number;
  /** Line wins: the lines' rows, the paytable [symbolId][count] in times the bet per line, the wild symbols. */
  lines?: { lines: MathPath; paytable: MathPath; wildIds: MathPath[] };
  /** Scatter wins: the scatter symbols (a list), each paid by the paytable's row of its symbol id. */
  scatter?: { symbolIds: MathPath; paytable: MathPath; combinationId: number };
  /** Symbols that fill their reel. */
  expand?: { symbolIds: MathPath[]; policy: keyof typeof ExpandPolicy };
  /** Symbols copied to the next spin of a sub screen. */
  copySymbols?: { symbolIds: MathPath[] };
  /** A symbol stuck on each reel at a row chosen by its reel's weights [reel][row] (RngOp::WildPos). */
  stickSymbols?: { symbolId: MathPath; distrPerReel: MathPath };
}

export interface RoundDescription {
  roundType: RoundTypeName;
  allowedBetLines: number[];
  /** The bets, in credits. */
  allowedBets: MathPath;
  /** {zeroRounds: [one per bet], perRounds}: the chance of a round without a win, by bet. */
  rtpReducer: MathPath;
  /** The round's bet is at least this times the main bet. */
  minBetMultiplier?: MathPath;
  /** Wins of at least so many times the bet are tagged: no effect on the math. */
  winTypeThresholds: [number, RoundTagName][];
  screen?: ScreenDescription;
  tetraSpin?: { triggerTimesBet: MathPath; maxRounds: MathPath; subScreens: ScreenDescription[] };
}

export interface MathRulesDescription {
  /** The math file's structs are Egt::Simulators::MathData::<simulatorName>::Game. */
  simulatorName: string;
  rowsCount: MathPath;
  symbolNames: MathPath;
  rounds: RoundDescription[];
  /** Which round type plays first when several are due. */
  consecutiveRoundTypePriorities: [RoundTypeName, number][];
}

export interface MathRulesInput {
  simRtp: number;
}

/** The value of the math file at a path. */
export function MathValue<T>(game: unknown, path: MathPath): T {
  let value = game;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object' || !(key in value)) throw new Error(`The math file has no ${path}`);
    value = (value as Record<string, unknown>)[key];
  }
  return value as T;
}

function toWeighted<T>(op: RngOp, repetition: boolean, weights: number[], values: T[]): Weighted<T> {
  return { op, repetition, range: values.map((value, i) => ({ weight: weights[i], value })) };
}

function toZeroRound(bets: number[], zeroWeights: number[], totalWeight: number) {
  const result = new Map<number, { numerator: number; denominator: number }>();
  if (!zeroWeights.length || bets.length !== zeroWeights.length) return result;
  bets.forEach((bet, i) => result.set(bet, { numerator: zeroWeights[i], denominator: totalWeight }));
  return result;
}

type ScreenConfig = Pick<SubScreenConfig, 'spinConfig' | 'lineConfig' | 'scatterConfig' | 'expandConfig' | 'copySymbolsConfig' | 'stickSymbolsConfig'>;

function BuildScreen(screen: ScreenDescription, config: ScreenConfig, game: unknown, description: MathRulesDescription) {
  const value = <T>(path: MathPath) => MathValue<T>(game, path);
  config.spinConfig.symbols = value<string[]>(description.symbolNames).map((name, id) => ({ id, name }));
  const reels = value<{ probability: number; intReels: number[][] }[]>(screen.reels);
  config.spinConfig.weightedReels = toWeighted(RngOp.SelectReels, true, reels.map(r => r.probability), reels.map(r => r.intReels));
  config.spinConfig.additionalRowsToInclude = screen.additionalRowsToInclude;
  if (screen.lines) {
    config.lineConfig.lines = value(screen.lines.lines);
    config.lineConfig.linePayTables = [new PayTable(Currency.Credits, value<number[][]>(screen.lines.paytable).map(row => [...row]))];
    config.lineConfig.wildSymbols = screen.lines.wildIds.map(path => WildSymbol(value<number>(path)));
  }
  if (screen.scatter) {
    const paytable = value<number[][]>(screen.scatter.paytable);
    for (const symbolId of value<number[]>(screen.scatter.symbolIds)) {
      config.scatterConfig.scatterSymbols.push({ symbolId, combinationId: screen.scatter.combinationId });
      config.scatterConfig.scatterPayTables.push(new PayTableV2(Currency.Credits, new Map([[symbolId, [...paytable[symbolId]]]])));
    }
  }
  if (screen.expand) {
    for (const path of screen.expand.symbolIds) {
      config.expandConfig.expandSymbols.push({ symbolId: value(path), include: new Set(), exclude: new Set(), policy: ExpandPolicy[screen.expand.policy] });
    }
  }
  if (screen.copySymbols) config.copySymbolsConfig.symbolIds = screen.copySymbols.symbolIds.map(path => value<number>(path));
  if (screen.stickSymbols) {
    config.stickSymbolsConfig.symbolId = value(screen.stickSymbols.symbolId);
    config.stickSymbolsConfig.distrPerReel = value<number[][]>(screen.stickSymbols.distrPerReel)
      .map(weights => toWeighted(RngOp.WildPos, true, weights, weights.map((_, i) => i)));
  }
}

/** The rules of each round type of the description, from the math file, as the game's MathRules::CreateRules() makes them. */
export function BuildReelRoundRules(description: MathRulesDescription, game: unknown, fakeReels: number[][], input: MathRulesInput) {
  const value = <T>(path: MathPath) => MathValue<T>(game, path);
  const rules = new Map<RoundType, ReelRoundRules>();
  for (const round of description.rounds) {
    // config with no impact on math and reel outcome
    const visualConfig = VisualAnalyzeConfig();
    visualConfig.winTypeThresholds = new Map(round.winTypeThresholds.map(([times, tag]) => [times, ERoundTags[tag]]));

    const config = ReelRoundRulesConfig();
    config.version = '0.0.1';
    config.fakeReels = fakeReels;
    config.rowsCount = value(description.rowsCount);
    config.allowedBetLines = [...round.allowedBetLines];
    const bets = value<number[]>(round.allowedBets);
    config.allowedBetAmounts = [...bets];
    config.roundType = RoundType[round.roundType];
    config.betBarCurrencyType = Currency.Credits;
    if (round.minBetMultiplier) config.minBetMultiplier = value(round.minBetMultiplier);
    config.rtpConfig.rtp = input.simRtp;
    const reducer = value<{ zeroRounds: number[]; perRounds: number }>(round.rtpReducer);
    config.rtpConfig.zeroRoundChancePerBet = toZeroRound(bets, reducer.zeroRounds, reducer.perRounds);
    config.rtpConfig.hasLeftOver = false;
    config.estimateValues = new Map([[Currency.Credits, 1]]);
    if (round.screen) BuildScreen(round.screen, config, game, description);
    if (round.tetraSpin) {
      config.tetraSpinConfig.tetraTriggerTimesBet = value(round.tetraSpin.triggerTimesBet);
      config.tetraSpinConfig.tetraMaxRounds = value(round.tetraSpin.maxRounds);
      config.tetraSpinConfig.subScreens = round.tetraSpin.subScreens.map(screen => {
        const subscreen = SubScreenConfig();
        BuildScreen(screen, subscreen, game, description);
        return subscreen;
      });
    }
    rules.set(config.roundType, new ReelRoundRules(config, visualConfig));
  }
  return rules;
}
