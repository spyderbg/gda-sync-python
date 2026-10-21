// The C++ math module of a game, from its MathRulesDescription and its math file:
//
//   <game>Math/MathRules.cpp                      CreateRules() fills each round's ReelRoundRulesConfig from the math file,
//                                                 as the description says; CollectConsecutiveRoundTypePriorities()
//   <game>Math/SimulatorConfig/<sim>.data.h       the math file's structs (Egt::Simulators::MathData::<sim>), by its JSON
//   <game>Math/...                                the rest of the module (MathTemplates.ts)
//
// The C++ is written as the hand-written MathRules.cpp files are, so that it reads like them.

import type { MathPath, MathRulesDescription, RoundDescription, ScreenDescription } from '@game/authoring/MathRulesDescription';
import { MathModuleFiles, MathRulesCpp } from './MathTemplates';

const I = '    ';

function indent(text: string, depth: number) {
  return text.split('\n').map(line => (line ? I.repeat(depth) + line : line)).join('\n');
}

function value(path: MathPath) {
  return `gameConfig.${path}`;
}

function linePaytable(paytable: MathPath) {
  return `Core::Vector<int64_t, 2> linePaytable;
std::transform(
    ${value(paytable)}.begin(),
    ${value(paytable)}.end(),
    std::back_inserter(linePaytable),
    [&toVecInt64](const auto& row) {
        return toVecInt64(row);
    });`;
}

/** The blocks that fill the configs of a screen: of `config.` for a round, of `subscreen.` for a sub screen. */
function ScreenCpp(screen: ScreenDescription, owner: string, description: MathRulesDescription) {
  const blocks: string[] = [];
  blocks.push(`if (auto& spin = ${owner}.spinConfig; true)
{
    const auto& names = ${value(description.symbolNames)};

    for (int i = 0; i < int(names.size()); i++)
    {
        spin.symbols.push_back({SymbolId(i), names[i]});
    }

    spin.weightedReels = toWeighted(
        GameCore::RngOp::SelectReels,
        true,
        ${value(screen.reels)} | std::views::transform([](const auto& r) {
            return r.probability;
        }),
        ${value(screen.reels)} | std::views::transform([](const auto& r) {
            return r.intReels;
        }));

    spin.additionalRowsToInclude = ${screen.additionalRowsToInclude};
}`);
  if (screen.lines) {
    const wilds = screen.lines.wildIds.map((path, i) => `\n\nauto& wild${i} = line.wildSymbols.emplace_back();\nwild${i}.symbolId = ${value(path)};`).join('');
    blocks.push(`if (auto& line = ${owner}.lineConfig; true)
{
    line.lines = ${value(screen.lines.lines)};
${indent(linePaytable(screen.lines.paytable), 1)}
    line.linePayTables = {{Currency::Credits, linePaytable}};${indent(wilds, 1)}
}`);
  }
  if (screen.scatter) {
    blocks.push(`if (auto& scatter = ${owner}.scatterConfig; true)
{
    for (const auto scatterSymId : ${value(screen.scatter.symbolIds)})
    {
        auto& scatterSymbol = scatter.scatterSymbols.emplace_back();
        scatterSymbol.symbolId = scatterSymId;
        scatterSymbol.combinationId = ${screen.scatter.combinationId};

        auto& scatterPayTableV2 = scatter.scatterPayTables.emplace_back();
        scatterPayTableV2.currencyType = Currency::Credits;
        scatterPayTableV2.symbolCountPayout[scatterSymId] = toVecInt64(${value(screen.scatter.paytable)}.at(scatterSymId));
    }
}`);
  }
  if (screen.expand) {
    const policy = screen.expand.policy;
    blocks.push(`if (auto& expand = ${owner}.expandConfig; true)
{${screen.expand.symbolIds.map((path, i) => `
    auto& expand${i} = expand.expandSymbols.emplace_back();
    expand${i}.symbolId = ${value(path)};
    expand${i}.policy = ExpandSymbol::ExpandPolicy::${policy};`).join('\n')}
}`);
  }
  if (screen.copySymbols) {
    blocks.push(`if (auto& copy = ${owner}.copySymbolsConfig; true)
{
${screen.copySymbols.symbolIds.map(path => `${I}copy.symbolIds.push_back(${value(path)});`).join('\n')}
}`);
  }
  if (screen.stickSymbols) {
    blocks.push(`if (auto& stick = ${owner}.stickSymbolsConfig; true)
{
    stick.symbolId = ${value(screen.stickSymbols.symbolId)};
    auto wc = ${value(screen.stickSymbols.distrPerReel)} | std::views::transform([&](const auto& weights) {
                  auto values = std::vector<int>(weights.size());
                  std::iota(values.begin(), values.end(), 0);
                  return toWeighted(GameCore::RngOp::WildPos, true, weights, values);
              });
    stick.distrPerReel = std::vector<Weighted<int>>(wc.begin(), wc.end());
}`);
  }
  return blocks.join('\n\n');
}

function visualName(round: RoundDescription) {
  return `${round.roundType.charAt(0).toLowerCase()}${round.roundType.slice(1)}VisualConfig`;
}

function RoundCpp(round: RoundDescription, description: MathRulesDescription) {
  const lines = [
    'ReelRoundRulesConfig config;',
    'config.version = "0.0.1";',
    'config.fakeReels = fakeReelsConfig.fakeReels;',
    `config.rowsCount = ${value(description.rowsCount)};`,
    `config.allowedBetLines = {${round.allowedBetLines.join(', ')}};`,
    `config.allowedBetAmounts = toVecInt64(${value(round.allowedBets)});`,
    `config.roundType = RoundType::${round.roundType};`,
    'config.betBarCurrencyType = Currency::Credits;',
  ];
  if (round.minBetMultiplier) lines.push(`config.minBetMultiplier = ${value(round.minBetMultiplier)};`);
  const body = [lines.join('\n'), `config.rtpConfig.rtp = rulesConfig.simRtp;
config.rtpConfig.zeroRoundChancePerBet = toZeroRound(
    ${value(round.allowedBets)},
    ${value(round.rtpReducer)}.zeroRounds,
    ${value(round.rtpReducer)}.perRounds);
config.rtpConfig.hasLeftOver = false;`, `config.estimateValues = {
    {Currency::Credits, 1.f},
};`];
  if (round.screen) body.push(ScreenCpp(round.screen, 'config', description));
  if (round.tetraSpin) {
    const subScreens = round.tetraSpin.subScreens
      .map(screen => `{\n    auto& subscreen = tetra.subScreens.emplace_back();\n\n${indent(ScreenCpp(screen, 'subscreen', description), 1)}\n}`)
      .join('\n\n');
    body.push(`if (auto& tetra = config.tetraSpinConfig; true)
{
    tetra.tetraTriggerTimesBet = ${value(round.tetraSpin.triggerTimesBet)};
    tetra.tetraMaxRounds = ${value(round.tetraSpin.maxRounds)};

${indent(subScreens, 1)}
}`);
  }
  body.push(`m_reelRoundRules[RoundType::${round.roundType}] = std::make_shared<ReelRoundRules>(std::move(config), ${visualName(round)});`);
  return `// ${round.roundType}\n{\n${indent(body.join('\n\n'), 1)}\n}`;
}

/** MathRules::CreateRules(), as BurningCrownTetraSpins10Math/MathRules.cpp writes it. */
export function CreateRulesCpp(description: MathRulesDescription) {
  const visuals = description.rounds.map(round => `VisualAnalyzeConfig ${visualName(round)};
${visualName(round)}.winTypeThresholds = {
${round.winTypeThresholds.map(([times, tag]) => `${I}{${times}, ERoundTags::${tag}},`).join('\n')}
};`).join('\n\n');
  const body = `// read from simulator's json config
auto& resources = m_math.RuntimeGet<IResources>();
Egt::Simulators::MathData::${description.simulatorName}::Game gameConfig;
auto mathIData = resources.Get<rss::RssIData>(rulesConfig.mathFileId);
rss::convert<decltype(gameConfig)>(mathIData, gameConfig);

FakeReelsConfig fakeReelsConfig;
auto frcIData = resources.Get<rss::RssIData>("FakeReelsConfig");
rss::convert<FakeReelsConfig>(frcIData, fakeReelsConfig);

// helpers
auto toWeighted = [](GameCore::RngOp op, bool repetition, const auto& weights, const auto& values) {
    using T = std::ranges::range_value_t<decltype(values)>;
    Weighted<T> result;
    result.op = op;
    result.repetition = repetition;
    result.range.resize(values.size());

    for (int i = 0; i < int(values.size()); i++)
    {
        result.range[i] = {uint32_t(weights[i]), values[i]};
    }

    return result;
};

auto toVecInt64 = [](const auto& values) {
    auto result = values | std::views::transform([](const auto& v) {
                      return static_cast<int64_t>(v);
                  });
    return std::vector<int64_t>(result.begin(), result.end());
};

auto toZeroRound = [](const auto& bets, const auto& zeroWeights, const auto totalWeight) {
    std::map<int64_t, Fraction> result;
    ReturnIf(zeroWeights.empty(), result);
    AssertReturnIf(bets.size() != zeroWeights.size(), result);

    for (int i = 0; i < int(bets.size()); i++)
    {
        result[bets[i]] = {uint32_t(zeroWeights[i]), uint32_t(totalWeight)};
    }

    return result;
};

// config with no impact on math and reel outcome
${visuals}

${description.rounds.map(round => RoundCpp(round, description)).join('\n\n')}`;
  return `    void MathRules::CreateRules(const MathRulesInitConfig& rulesConfig)
    {
${indent(body, 2)}
    }

`;
}

function PrioritiesCpp(description: MathRulesDescription) {
  return `    void MathRules::CollectConsecutiveRoundTypePriorities()
    {
        m_consecutiveRoundTypePriorities = {
${description.consecutiveRoundTypePriorities.map(([type, priority]) => `${I.repeat(3)}{RoundType::${type}, ${priority}},`).join('\n')}
        };
    }

`;
}

// The math file's structs ------------------------------------------------------------------------------------------

/** MathDefs.data.h's types, for the values the description names by what they are. */
function KnownTypes(description: MathRulesDescription) {
  const known = new Map<MathPath, string>();
  const screen = (s: ScreenDescription) => {
    known.set(s.reels, 'ReelsDistribution');
    if (s.lines) {
      known.set(s.lines.lines, 'Lines');
      known.set(s.lines.paytable, 'Paytable');
    }
    if (s.scatter) known.set(s.scatter.paytable, 'Paytable');
    if (s.stickSymbols) known.set(s.stickSymbols.distrPerReel, 'Core::Vector<int, 2>');
  };
  for (const round of description.rounds) {
    known.set(round.rtpReducer, 'RtpReducer');
    if (round.screen) screen(round.screen);
    round.tetraSpin?.subScreens.forEach(screen);
  }
  const symbols = description.symbolNames.split('.').slice(0, -1).join('.');
  if (symbols) known.set(symbols, 'SymbolsData');
  return known;
}

const pascal = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/** <sim>.data.h: a struct for each object of the math file, its fields in the file's order. */
export function SimulatorDataH(gameName: string, description: MathRulesDescription, game: Record<string, unknown>) {
  const known = KnownTypes(description);
  const structs: string[] = [];
  const names = new Set<string>();

  const numberType = (values: unknown[]) => (values.every(v => Number.isInteger(v)) ? 'int' : 'double');
  const typeOf = (path: string, key: string, sample: unknown): string => {
    const named = known.get(path);
    if (named) return named;
    if (typeof sample === 'boolean') return 'bool';
    if (typeof sample === 'number') return numberType([sample]);
    if (typeof sample === 'string') return 'std::string';
    if (Array.isArray(sample)) {
      if (!sample.length) return 'std::vector<int>';
      if (sample.every(v => typeof v === 'number')) return `std::vector<${numberType(sample)}>`;
      if (sample.every(v => typeof v === 'string')) return 'std::vector<std::string>';
      if (sample.every(v => Array.isArray(v) && v.every(x => typeof x === 'number'))) return `Core::Vector<${numberType(sample.flat())}, 2>`;
      if (sample.every(v => v && typeof v === 'object' && !Array.isArray(v))) return `std::vector<${struct(path, `${pascal(key)}Item`, sample[0] as Record<string, unknown>)}>`;
      throw new Error(`The math file's ${path} is a list of mixed values, which has no C++ type`);
    }
    if (sample && typeof sample === 'object') return struct(path, pascal(key), sample as Record<string, unknown>);
    throw new Error(`The math file's ${path} is null, which has no C++ type`);
  };
  const struct = (path: string, wanted: string, object: Record<string, unknown>): string => {
    let name = wanted;
    for (let n = 2; names.has(name); n++) name = `${wanted}${n}`;
    names.add(name);
    const fields = Object.entries(object).map(([key, sample]) => {
      const type = typeOf(path ? `${path}.${key}` : key, key, sample);
      const init = type === 'int' || type === 'double' ? ' = 0' : type === 'bool' ? ' = false' : '';
      return `${I.repeat(2)}${type} ${key}${init};`;
    });
    structs.push(`${I}struct ${name} : Data<${name}>\n${I}{\n${fields.join('\n')}\n${I}};`);
    return name;
  };
  struct('', 'Game', game);

  return `#pragma once

// Generated by the browser game (frontend/src/game/export/MathExporter.ts) from the math file: its fields are read by
// their names, so the math file's keys are kept as they are.
#include <Egt/${gameName}Math/SimulatorConfig/MathDefs.data.h>

#include <Egt/Core/Data/Data.h>
#include <Egt/Core/Tools/Containers.h>

namespace Egt::Simulators::MathData::${description.simulatorName}
{
${structs.join('\n\n')}
}
`;
}

export interface MathExportInput {
  /** The game's C++ name, such as BurningCrownTetraSpins10. */
  gameName: string;
  description: MathRulesDescription;
  /** The math file the setup plays. */
  mathFile: Record<string, unknown>;
}

/** The math module's files, by their path in the module's folder. */
export function ExportMathCpp({ gameName, description, mathFile }: MathExportInput): Record<string, string> {
  const names = { game: gameName, simulatorName: description.simulatorName };
  const files = MathModuleFiles(names);
  files['MathRules.cpp'] = MathRulesCpp(names, CreateRulesCpp(description), PrioritiesCpp(description));
  files[`SimulatorConfig/${description.simulatorName}.data.h`] = SimulatorDataH(gameName, description, mathFile);
  return files;
}
