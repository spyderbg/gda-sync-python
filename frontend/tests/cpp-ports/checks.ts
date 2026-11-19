// Checks of the browser game's ports of C++ that writes amounts, cuts image fonts and draws rounds from the kernel's
// numbers, against what the C++ does: Egt::Game::NumberFormatter with the LocalizationManager's formats, video_ctrl's
// create_font_from_cyan_sep_png, GameCore's BitQueue and RngDistributionHat, and the engine's timing and input: the
// Stopwatch, the ButtonElement's pressed time, the game pause (PauseMonitor, GameFsm) and the events' sentinels.
//
// The game Clock reads performance.now(), which the checks replace with a time they move on (Advance).

import { NumberFormatter } from '@game/engine/Game/Utils/NumberFormatter';
import { NumberFormatConfig } from '@game/engine/Game/Utils/NumberFormatter.data';
import { CreateFontFromCyanSepPng } from '@game/engine/GameVideoCtrl/Fonts';
import { LocalizationManager } from '@game/integration/LocalizationManager/LocalizationManager';
import { BitQueue } from '@game/engine/GameCore/Random/BitGenerator/BitQueue';
import { RngDistributionHat } from '@game/engine/GameCore/Random/Distribution/RngDistributionHat';
import { ExternalRngEngineHat } from '@game/engine/GameCore/Random/Engine/ExternalRngEngine';
import { InsufficientRandomBits } from '@game/engine/GameCore/Random/Exceptions';
import { RngOp } from '@game/engine/GameCore/Random/IRng';
import { Event, EventQueue, Sentinel } from '@game/engine/Core/Event';
import { Machine, Node, State, type Reaction } from '@game/engine/Fsm/Fsm';
import { GameFsm } from '@game/engine/Game/Fsm/GameFsm';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IPause } from '@game/engine/Game/RuntimeImport/IPause';
import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { IVideo } from '@game/engine/GameVideoCtrl/RuntimeExport/IVideo';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { PauseMonitor } from '@game/integration/Runtime/Common/PauseMonitor';
import { IPauseControl, PauseReason } from '@game/integration/Runtime/IPauseControl';

export function run() {
  let checks = 0;
  const equal = (actual: unknown, expected: unknown, message: string) => {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };

  // The LocalizationManager's defaults (LocalizationManager.data.h), as the C++ game writes amounts.
  const localization = new LocalizationManager();
  equal(localization.FormatCurrency(89750), '€ 897,50', 'an amount of cents, with the euro and a decimal comma');
  equal(localization.FormatCurrency(0), '€ 0,00', 'nothing');
  equal(localization.FormatCurrency(123456789), '€ 1.234.567,89', 'the thousands grouped with points');
  equal(localization.FormatCurrency(5), '€ 0,05', 'cents filled to two digits');
  equal(localization.FormatNumber(100), '1,00', 'a number, without the currency');
  equal(localization.FormatCoins(250), '@ 2,50', 'coins');
  // std::div truncates toward zero and keeps the value's sign in the remainder; the sign is grouped as a digit.
  equal(localization.FormatCurrency(-150), '€ -1,-50', 'a negative amount, as C++ writes it');
  equal(localization.FormatCurrency(-100050), '€ -1.000,-50', 'a negative amount in thousands');
  equal(NumberFormatter.FormatNumber(-123456, new NumberFormatConfig(false, '', 1, ',', '.')), '-.123.456', 'the sign grouped as a digit');
  // The other members of the config.
  equal(NumberFormatter.FormatNumber(1234, new NumberFormatConfig(true, '$', 100, '.', ',')), '+$12.34', 'a plus sign and other separators');
  equal(NumberFormatter.FormatNumber(1234567, new NumberFormatConfig(false, '', 1, ',', '')), '1234567', 'no grouping, no decimals');
  equal(NumberFormatter.FormatNumber(5, new NumberFormatConfig(false, '', 1000, ',', '.')), '0,005', 'decimals as wide as the denomination');
  equal(NumberFormatter.FormatNumber(1234567, new NumberFormatConfig(false, '', 1, ',', ' . ')), '1 . 234 . 567', 'a separator of several characters');
  equal(NumberFormatter.FormatNumber(150.9, new NumberFormatConfig(false, '', 100, ',', '.')), '1,50', 'an int64_t: the fraction cut off');

  // video_ctrl's glyph cut: only a cyan pixel ends a glyph, the next starts at its column, the first at the left edge; a
  // glyph is the font's size tall, a line without one more cyan pixel goes on below.
  const width = 12;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  const set = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * width + x) * 4);
  set(4, 0, [0, 255, 255, 255]);
  set(7, 0, [0, 255, 255, 255]);
  set(2, 0, [255, 0, 0, 255]); // opaque, but not cyan: not a mark
  set(5, 4, [0, 255, 255, 255]);
  const glyphs = CreateFontFromCyanSepPng('font.png', { width, height, data }, 3, ['0', '1', '2']);
  equal(Object.fromEntries(glyphs), { 0: { x: 0, y: 1, w: 4, h: 3 }, 1: { x: 4, y: 1, w: 3, h: 3 }, 2: { x: 0, y: 5, w: 5, h: 3 } },
    'the glyphs of two lines');
  equal(CreateFontFromCyanSepPng('font.png', { width, height, data }, 5, ['0']).get('0'), { x: 0, y: 1, w: 4, h: 5 }, 'the font size tall');
  let error = '';
  try {
    CreateFontFromCyanSepPng('font.png', { width, height, data }, 3, ['0', '1', '2', '3']);
  } catch (caught) {
    error = (caught as Error).message;
  }
  equal(error.startsWith("Could not find codepoint : '3' in PNG font [font.png]"), true, 'a font that runs out of cyan pixels');

  // GameCore::BitQueue: numbers pushed at a width, popped lowest bits first, across its 32-bit words.
  const queue = new BitQueue();
  queue.Push(4, 0xa);
  queue.Push(4, 0x5);
  queue.Push(32, 0xdeadbeef);
  equal(queue.GetBitsRemaining(), 40, 'the bits pushed');
  equal(queue.Pop(8), 0x5a, 'two 4-bit numbers, the first in the lowest bits');
  equal(queue.Pop(32), 0xdeadbeef, 'a 32-bit number across two words, unsigned');
  equal([queue.GetBitsRemaining(), queue.GetBitsPopped()], [0, 40], 'all popped');
  const kernel16 = new BitQueue();
  kernel16.Push(16, [0x1234, 0xabcd, 0xffff]);
  equal(kernel16.Next(), 0xabcd1234, 'a kernel of 16-bit numbers: two of them a draw of 32 bits');
  error = '';
  try {
    kernel16.Next();
  } catch (caught) {
    error = caught instanceof InsufficientRandomBits ? 'InsufficientRandomBits' : String(caught);
  }
  equal(error, 'InsufficientRandomBits', '16 bits left: a draw of 32 throws');
  equal(kernel16.Pop(16), 0xffff, 'the bits left after the failed draw');

  // RngDistributionHat::GenerateUniform: a power of 2 takes the highest bits, range 1 takes nothing, any other range
  // scales a number below `acceptable` and draws again at or above it.
  const draws = (numbers: number[], ranges: number[]) => {
    const engine = new ExternalRngEngineHat();
    const bits = new BitQueue();
    bits.Push(32, numbers);
    engine.SetBitQueue(bits);
    return [...ranges.map(range => engine.Generate(RngOp.UnitTest, range)), engine.GetBitsRemaining()];
  };
  equal(draws([0x80000000, 0xc0000000], [4, 1, 2]), [2, 0, 1, 0], 'a power of 2: (n * range) >> 32; range 1: 0, no bits');
  equal(draws([0x89abcdef], [0]), [0x89abcdef, 0], 'range 0: all 32 bits');
  // range 3: acceptable = 2^32 - 2^32 % 3 = 0xffffffff, so 0xffffffff is drawn again
  equal(draws([0xffffffff, 0x80000000], [3]), [1, 0], 'range 3: the biased tail drawn again, then n * 3 / acceptable');
  equal(draws([0xfffffffa, 0xfffffff9], [10]), [9, 0], 'range 10: acceptable = 0xfffffffa, its highest number gives the range\'s last value');
  // its inverse (the Truserv exports' numbers) gives the value back
  for (const [value, range] of [[0, 3], [2, 3], [5, 10], [9, 10], [3, 4], [123456, 1000000], [0x7fffffff, 0x80000000], [4000000000, 4000000001]]) {
    const inverse = new BitQueue();
    RngDistributionHat.InverseUniform(value, range, inverse);
    const engine = new ExternalRngEngineHat();
    engine.SetBitQueue(inverse);
    equal(engine.Generate(RngOp.UnitTest, range), value, `InverseUniform then GenerateUniform of ${value} in [0, ${range})`);
  }

  // The game Clock on a time the checks move on (its durations are differences of the page's fractional times: rounded).
  let pageTime = performance.now();
  const realNow = performance.now.bind(performance);
  performance.now = () => pageTime;
  const Advance = (ms: number) => {
    pageTime += ms;
  };
  try {
    checks += timingAndInput(equal, Advance);
  } finally {
    performance.now = realNow;
  }
  return checks;
}

function timingAndInput(equal: (actual: unknown, expected: unknown, message: string) => void, Advance: (ms: number) => void) {
  let checks = 0;
  const check = (actual: unknown, expected: unknown, message: string) => {
    ++checks;
    equal(actual, expected, message);
  };

  // Game::Stopwatch: Reset starts it again from 0, running, and returns the time it had run.
  const stopwatch = new Stopwatch();
  stopwatch.Pause();
  Advance(100);
  check([stopwatch.IsRunning(), Math.round(stopwatch.Measure())], [false, 0], 'a paused stopwatch measures nothing');
  check(Math.round(stopwatch.Reset()), 0, 'Reset returns the time it had run');
  Advance(50);
  check([stopwatch.IsRunning(), Math.round(stopwatch.Measure())], [true, 50], 'Reset resumes it');
  stopwatch.Pause();
  Advance(20);
  stopwatch.Resume();
  Advance(5);
  check(Math.round(stopwatch.Measure()), 55, 'paused time is left out');

  // ButtonElement: a touch down presses an idle button for 210 ms, whatever the touch up does; it takes no touch then.
  const runtime = new Runtime();
  const sounds: string[] = [];
  runtime.Add(IResources, { GetImage: (key: string) => (key.startsWith('IMG_') ? { file: key, source: { x: 0, y: 0, w: 100, h: 50 } } : null) } as unknown as IResources);
  runtime.Add(IVideo, { GetImages: () => ({ Get: () => ({ naturalWidth: 100, naturalHeight: 50 }) }) } as unknown as IVideo);
  runtime.Add(IAudioApi, { Play: (id: string) => { sounds.push(id); return null; } } as unknown as IAudioApi);
  const button = new ButtonElement();
  button.Init(runtime, '');
  button.SetElementData({ type: 'Button', rssKeys: ['IMG_IDLE', 'IMG_PRESSED', 'IMG_DISABLED'], position: { x: 10, y: 10 }, rssKeySound: 'SOUND_PRESS' });
  const inside = { x: 20, y: 20 };
  const outside = { x: 500, y: 500 };
  check(button.HandleTouchDown(outside), false, 'a touch outside the button');
  check(button.HandleTouchDown(inside), true, 'a touch down presses the button');
  check(sounds, ['SOUND_PRESS'], 'with its sound');
  check(button.HandleTouchUp(inside), true, 'the touch up on the pressed button is taken');
  Advance(100);
  button.Update(0);
  check(button.HandleTouchDown(inside), false, 'a second tap within 210 ms is not taken');
  button.SetEnabled(false);
  check(Math.round(button.GetPressedDuration()), 100, 'disabling it does not end the pressed time');
  Advance(111);
  button.Update(0);
  check(button.HandleTouchDown(inside), false, 'after 210 ms, a disabled button takes no touch');
  button.SetEnabled(true);
  check(button.HandleTouchDown(inside), true, 'enabled again, it is pressed again');
  check(sounds.length, 2, 'and plays its sound again');
  const area = new ButtonElement();
  area.Init(runtime, '');
  area.SetElementData({ type: 'Button', rssKeys: ['AREA_ONLY'], touchArea: { x: 0, y: 0, w: 40, h: 40 }, rssKeySound: 'SOUND_AREA' });
  check([area.HandleTouchDown(inside), area.HandleTouchDown(inside), sounds.length], [true, true, 2],
    'an area element only says whether the point is in it: no pressed state, no sound');

  // Event: a queued callback whose sentinel expired before its queue ran it does not run; unregistering does not cancel it.
  const event = new Event<[number]>();
  const queue = new EventQueue();
  const got: string[] = [];
  const sentinel = new Sentinel();
  const owner = {};
  event.Register(queue, sentinel, value => got.push(`sentinel ${value}`));
  event.Register(queue, owner, value => got.push(`owner ${value}`));
  event.Post(1);
  sentinel.Expire();
  event.Unregister(owner);
  queue.ExecuteAllCallbacks();
  check(got, ['owner 1'], 'the expired sentinel\'s callback is dropped, the unregistered owner\'s still runs');
  check(event.IsRegistered(sentinel), false, 'an expired sentinel is not registered');

  // Fsm: an event posted to a state that is destroyed before the machine's queue runs is dropped, even if the state
  // entered meanwhile reacts on it too; it reaches that state while a state that reacts on it stays.
  const start = new Event();
  const parentEvent = new Event();
  const reactions: string[] = [];
  class Root extends State {
    OnTransit() {
      this.ReactOn(parentEvent, () => (reactions.push('Root'), this.Consume()));
    }
  }
  class A extends State {
    OnTransit() {
      this.ReactOn(start, () => (reactions.push('A'), this.Transit('B')));
      this.ReactOn(parentEvent, () => (reactions.push('A parent'), this.Skip()));
    }
  }
  class B extends State {
    OnTransit() {
      this.ReactOn(start, () => (reactions.push('B'), this.Consume()) as Reaction);
    }
  }
  const machine = new Machine(Node(Root, 'Root', [Node(A, 'A'), Node(B, 'B')]));
  machine.Init(runtime);
  start.Post();
  start.Post();
  machine.Process();
  check(reactions, ['A'], 'the second Start, posted to A, is dropped once A is gone');
  start.Post();
  machine.Process();
  check(reactions, ['A', 'B'], 'B reacts on the Start posted to it');
  parentEvent.Post();
  machine.Process();
  check(reactions, ['A', 'B', 'Root'], 'the event of a state still alive reaches the states there are when it runs');

  // PauseMonitor: paused from the first reason held to the last one released; the GameFsm takes no step meanwhile.
  const pauseRuntime = new Runtime();
  const monitor = new PauseMonitor();
  monitor.Init(pauseRuntime);
  monitor.PostInit();
  const pauseEvents: string[] = [];
  pauseRuntime.Get(IPause.Events).paused.RegisterInstant(pauseEvents, () => pauseEvents.push('paused'));
  pauseRuntime.Get(IPause.Events).resumed.RegisterInstant(pauseEvents, () => pauseEvents.push('resumed'));
  const control = pauseRuntime.Get(IPauseControl);
  const step = new Event();
  const steps: string[] = [];
  class Step extends State {
    OnTransit() {
      this.ReactOn(step, () => (steps.push('step'), this.Consume()));
    }
  }
  class TestFsm extends GameFsm {
    protected CreateBuilder() {
      return Node(Step, 'Step');
    }
  }
  const fsm = new TestFsm();
  fsm.Init(pauseRuntime, {});
  fsm.PostInit();
  control.Request(PauseReason.Debug);
  control.Request(PauseReason.Qa);
  step.Post();
  fsm.Process();
  check([pauseRuntime.Get(IPause).IsPaused(), steps], [true, []], 'paused: the machine takes no step, the event waits');
  control.Release(PauseReason.Debug);
  fsm.Process();
  check([pauseRuntime.Get(IPause).IsPaused(), steps], [true, []], 'one reason released, another still held: still paused');
  control.Release(PauseReason.Qa);
  fsm.Process();
  check([pauseRuntime.Get(IPause).IsPaused(), steps, pauseEvents], [false, ['step'], ['paused', 'resumed']],
    'the last reason released: resumed, and the waiting event handled');
  monitor.Deinit();
  return checks;
}
