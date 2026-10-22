// Checks of the alpha family's math ports (AlphaFamily/Math): the wheel's and hold and spin's rules, against what their
// C++ computes (the wheel's sector wins of WheelRoundRules.cpp's worked example) and what their rules promise.

import { HistoryEngine, MonteCarloEngineHat, RngOp } from '@game/engine/GameCore/Random/IRng';
import { Currency, RoundType } from '../Common/Common.data';
import { HoldAndSpinRoundInput } from '../HoldAndSpin/HoldAndSpinRoundInput.data';
import { HoldAndSpinPhase } from '../HoldAndSpin/HoldAndSpinRoundPhase.data';
import { HoldAndSpinRoundRules } from '../HoldAndSpin/HoldAndSpinRoundRules';
import { HoldAndSpinRoundRulesConfig } from '../HoldAndSpin/HoldAndSpinRoundRules.data';
import { PayTableV2 } from '../Common/Common.data';
import { RoundResult } from '../RoundResult.data';
import { WheelRoundInput } from '../Wheel/WheelRoundInput.data';
import { WheelRoundPhase } from '../Wheel/WheelRoundPhase.data';
import { WheelRoundRules } from '../Wheel/WheelRoundRules';
import { WheelRoundRulesConfig, type WheelSector } from '../Wheel/WheelRoundRules.data';

export function run() {
  const failures: string[] = [];
  let checks = 0;
  const check = (ok: boolean, what: string) => {
    checks++;
    if (!ok) failures.push(what);
  };

  // the wheel: WheelRoundRules.cpp's example, bet 270 on four sectors: wins 243, 248, 270 and the last one's remainder 276
  const wheelConfig = WheelRoundRulesConfig();
  wheelConfig.roundType = RoundType.Wheel;
  wheelConfig.maxAttempts = 1;
  wheelConfig.minimumBet = 100;
  const sector = (id: number, name: string, weight: number, pays: number) => ({ weight, value: { id, name, payouts: [{ currencyType: Currency.Credits, pays }] } as WheelSector });
  wheelConfig.sectors = { op: RngOp.StopWheel, repetition: true, range: [sector(0, 'RED', 296923, 0.9), sector(1, 'GREEN', 6060, 0.92), sector(2, 'PURPLE', 687956, 1.0), sector(3, 'BLUE', 9061, 1.02)] };
  wheelConfig.bettingGroups = [{ id: 0, name: 'ALL', sectorIds: [0, 1, 2, 3] }];
  const wheel = new WheelRoundRules(wheelConfig);
  const wins = [...wheel.GetWheelRewardsPerSector(270).values()].map(rewards => rewards.Get(Currency.Credits));
  check(wins.join() === '243,248,270,276', `wheel sector wins ${wins.join()}, expected 243,248,270,276`);
  // the coins' capping: the credits cap over the least sector's pay
  check(wheel.GetCoinCapping(500000) === Math.ceil(500000 / 0.9), `wheel coin capping ${wheel.GetCoinCapping(500000)}`);

  const wheelInput = new WheelRoundInput();
  wheelInput.roundType = RoundType.Wheel;
  wheelInput.bet = 270;
  wheelInput.betGroup = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const result = wheel.CalculateRound(wheelInput, new HistoryEngine(new MonteCarloEngineHat(seed)));
    if (!(result instanceof RoundResult)) {
      check(false, `wheel round failed: ${result.message}`);
      break;
    }
    const phase = result.m_phases[0];
    check(phase instanceof WheelRoundPhase && result.m_summary.rewards.Get(Currency.Credits) === wins[(phase as WheelRoundPhase).stopSector],
      'a wheel round pays its stop sector\'s win');
  }
  const badInput = wheelInput.Clone();
  badInput.bet = 50;
  check(!(wheel.CalculateRound(badInput, new HistoryEngine(new MonteCarloEngineHat(1))) instanceof RoundResult), 'a bet below the wheel\'s minimum is refused');

  // hold and spin: coins (10) stay where they are; a free position drops a coin (9, replaced by a value 10 or 11) or a fake
  // symbol; a drop gives back the initial spins; one spin per round (EMode::OneSpin)
  const hsConfig = HoldAndSpinRoundRulesConfig();
  hsConfig.triggerRoundType = RoundType.Main;
  hsConfig.triggerSymbolIds = [10, 11];
  hsConfig.triggerSymbolCount = 6;
  hsConfig.initialSpins = 3;
  hsConfig.dropSymbolId = 9;
  hsConfig.dropDistribution = { op: RngOp.CoinPos, repetition: true, range: [{ weight: 1, value: true }, { weight: 9, value: false }] };
  hsConfig.replaceMaps = {
    op: RngOp.SelectLowMidHigh, repetition: true,
    range: [{ weight: 1, value: new Map([[9, { op: RngOp.CoinType, repetition: true, range: [{ weight: 3, value: 10 }, { weight: 1, value: 11 }] }]]) }],
  };
  hsConfig.paytable = [new PayTableV2(Currency.Credits, new Map([[10, Array.from({ length: 16 }, (_, i) => i * 2)], [11, Array.from({ length: 16 }, (_, i) => i * 5)]]))];
  hsConfig.fakeDrops = { op: RngOp.HoldAndSpinNoCoinDrop, repetition: true, range: [{ weight: 1, value: 0 }, { weight: 1, value: 1 }] };
  const holdAndSpin = new HoldAndSpinRoundRules(hsConfig);
  const stop = [[10, 0, 1], [0, 10, 1], [11, 1, 0], [10, 10, 0], [1, 0, 11]];
  let input = new HoldAndSpinRoundInput();
  input.roundType = RoundType.HoldAndSpin;
  input.bet = 10;
  input.triggerRoundType = RoundType.Main;
  input.triggerStop = stop;
  input.prevStop = stop;
  input.prevHoldAndSpinEnergy = 3 * 10;
  let rounds = 0;
  let energy = input.prevHoldAndSpinEnergy;
  let paid = 0;
  while (energy > 0 && rounds < 100) {
    const result = holdAndSpin.CalculateRound(input, new HistoryEngine(new MonteCarloEngineHat(rounds + 7)));
    if (!(result instanceof RoundResult)) {
      check(false, `hold and spin round failed: ${result.message}`);
      break;
    }
    rounds++;
    check(result.m_phases.length === 1 && result.m_phases[0] instanceof HoldAndSpinPhase, 'a hold and spin round is one spin');
    const phase = result.m_phases[0] as HoldAndSpinPhase;
    const before = input.prevStop;
    let held = true;
    let dropped = false;
    phase.stop.forEach((reel, r) => reel.forEach((symbol, row) => {
      if (hsConfig.triggerSymbolIds.includes(before[r][row]) && symbol !== before[r][row]) held = false;
      if (!hsConfig.triggerSymbolIds.includes(before[r][row]) && hsConfig.triggerSymbolIds.includes(symbol)) dropped = true;
    }));
    check(held, 'the coins on the reels stay');
    const [type, left] = result.m_overrideCurrencies[0];
    check(type === Currency.HoldAndSpinEnergy, 'the remaining spins are the HoldAndSpinEnergy');
    const full = phase.stop.every(reel => reel.every(symbol => hsConfig.triggerSymbolIds.includes(symbol)));
    check(full ? left === 0 : dropped ? left === hsConfig.initialSpins * input.bet : left === energy - input.bet,
      `the spins left (${left}) after ${dropped ? 'a drop' : 'no drop'} from ${energy}`);
    check(phase.winFiguresInfo.length === phase.stop.flat().filter(symbol => hsConfig.triggerSymbolIds.includes(symbol)).length, 'the win figures are the coins');
    paid += result.m_summary.rewards.Get(Currency.Credits);
    energy = left;
    const next = new HoldAndSpinRoundInput();
    next.roundType = RoundType.HoldAndSpin;
    next.bet = input.bet;
    holdAndSpin.PrepareInput(next, input, phase);
    next.prevHoldAndSpinEnergy = energy;
    check(next.triggerStop === input.triggerStop || next.triggerStop.flat().join() === stop.flat().join(), 'the trigger stop is kept');
    input = next;
  }
  // the rewards of all the rounds are the paytable's for the coins at the end, less the trigger's
  const count = (grid: number[][], id: number) => grid.flat().filter(symbol => symbol === id).length;
  const pay = (grid: number[][]) => input.bet * (count(grid, 10) * 2 + count(grid, 11) * 5);
  check(paid === pay(input.prevStop) - pay(stop), `hold and spin pays the coins it dropped (${paid}, expected ${pay(input.prevStop) - pay(stop)})`);
  check(energy === 0 && rounds < 100, 'hold and spin ends');

  return { checks, failures };
}
