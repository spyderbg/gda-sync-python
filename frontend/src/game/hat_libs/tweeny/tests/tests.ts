// tweeny's tests (hat_libs/tweeny/tests/tests.cpp), and those of what the browser game relies on: the combinators'
// timing, copies of actions, the easings. run.mjs runs them with Node.js.
//
// C++ runs every scenario with uint8_t, int8_t and float values, and with a value or a shared_ptr; the browser's values
// are numbers, which it tweens by a reference with a sentinel. Its "tween_by" of a value tests tween_by (C++'s calls
// tween_to there).

import { make_sentinel, sentinel } from '../../egt_hpp/sentinel';
import * as detail from '../detail/tweeny_internal';
import * as tweeny from '../tweeny';

const failures: string[] = [];
let checks = 0;
let context: string[] = [];

function REQUIRE(condition: boolean, what = 'REQUIRE') {
  checks++;
  if (!condition) failures.push(`${context.join(' / ')}: ${what}`);
}

function REQUIRE_NOTHROWS(fn: () => unknown, what = 'REQUIRE_NOTHROWS') {
  try {
    fn();
    REQUIRE(true);
  } catch (error) {
    REQUIRE(false, `${what}: threw ${(error as Error).message}`);
  }
}

function REQUIRE_THROWS(fn: () => unknown, what = 'REQUIRE_THROWS') {
  try {
    fn();
    REQUIRE(false, `${what}: did not throw`);
  } catch {
    REQUIRE(true);
  }
}

function SCENARIO(name: string, body: () => void) {
  const saved = context;
  context = [...context, name];
  try {
    body();
  } catch (error) {
    REQUIRE(false, `threw ${(error as Error).stack ?? error}`);
  } finally {
    context = saved;
  }
}

/** A seeded random, so a failure repeats. */
let seed = 155724;
function random_value(min: number, max: number) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return min + (seed / 2147483648) * (max - min);
}

const TWEENY_UPDATE_STEP_COUNT = 10;
let EASING: tweeny.ease_t = tweeny.ease.linear;

function tweeny_update(duration: tweeny.duration_t) {
  // test update with 0
  tweeny.update(0);
  const step = duration / TWEENY_UPDATE_STEP_COUNT;
  for (let i = 0; i < TWEENY_UPDATE_STEP_COUNT; ++i) tweeny.update(step);
}

function compare(a: number, b: number, epsilon = 0.001) {
  const diff = Math.abs(a - b);
  if (diff <= epsilon) return true;
  return diff < Math.max(Math.abs(a), Math.abs(b)) * epsilon;
}

class values_t {
  value: number;
  private expired = false;
  readonly sentinel = new sentinel(() => this.expired);

  constructor(value: number) {
    this.value = value;
  }

  sentinel_reset() {
    this.expired = true;
  }

  sentinel_expired() {
    return this.expired;
  }
}

function core_tween_test_impl(action: tweeny.tween_action, duration: number, step_update: boolean, values: values_t, begin: number, end: number) {
  REQUIRE(action.is_valid(), 'the action should be valid');
  // pause before starting should do nothing
  REQUIRE_NOTHROWS(() => tweeny.pause(action));
  REQUIRE(!tweeny.is_paused(action), 'it should not be paused');
  REQUIRE_NOTHROWS(() => tweeny.resume(action));
  REQUIRE(!tweeny.is_running(action), 'it should not be running');
  REQUIRE_NOTHROWS(() => tweeny.start(action));
  // pause after starting successfully should work just fine
  if (tweeny.is_running(action)) {
    REQUIRE_NOTHROWS(() => tweeny.set_speed_multiplier(action, 10.0));
    REQUIRE(Math.trunc(tweeny.get_speed_multiplier(action)) === 10, 'speed multiplier');
    REQUIRE(tweeny.get_duration(action) > 0, 'duration > 0');
    REQUIRE(tweeny.get_elapsed(action) === 0, 'elapsed == 0');
    REQUIRE_NOTHROWS(() => tweeny.pause(action));
    REQUIRE(tweeny.is_paused(action), 'paused');
    REQUIRE_NOTHROWS(() => tweeny.resume(action));
    REQUIRE(tweeny.is_running(action), 'running');
    REQUIRE(!tweeny.is_finished(action), 'not finished');
  }
  REQUIRE_NOTHROWS(() => tweeny.stop_when_finished(action));
  REQUIRE(tweeny.is_stopping(action), "the action is 'stopping'");

  if (duration > 0 && !values.sentinel_expired() && tweeny.is_running(action)) {
    REQUIRE(compare(values.value, begin), `the object should be equal to the begin value (${values.value} != ${begin})`);
  }

  if (step_update) REQUIRE_NOTHROWS(() => tweeny_update(duration));
  else REQUIRE_NOTHROWS(() => tweeny.stop_and_finish(action));

  if (duration > 0 && tweeny.get_elapsed(action) >= duration && !values.sentinel_expired()) {
    REQUIRE(compare(values.value, end), 'the object should be equal to the end value');
  }
}

function creator(type: string, values: values_t, begin: { value: number }, end: number, duration: number) {
  const object = tweeny.ref(values, 'value');
  if (type === 'tween_from_to') return tweeny.tween_from_to(object, begin.value, end, duration, values.sentinel, EASING);
  if (type === 'tween_to') {
    if (!values.sentinel_expired()) begin.value = values.value;
    return tweeny.tween_to(object, end, duration, values.sentinel, EASING);
  }
  if (type === 'tween_by') {
    if (!values.sentinel_expired()) begin.value = values.value;
    return tweeny.tween_by(object, end, duration, values.sentinel, EASING);
  }
  return new tweeny.tween_action();
}

function scenario(step_update: boolean, type: string, duration: number, begin_value: number, end: number, object_value: number) {
  const make = () => {
    const values = new values_t(object_value);
    const begin = { value: begin_value };
    return { values, begin, action: creator(type, values, begin, end, duration) };
  };
  const callback_scenario = (name: string, connect: (action: tweeny.tween_action, values: values_t, flags: { requested: boolean }) => void,
    then: (action: tweeny.tween_action, values: values_t, flags: { requested: boolean }) => void) => {
    SCENARIO(name, () => {
      const { values, begin, action } = make();
      const flags = { requested: false };
      connect(action, values, flags);
      core_tween_test_impl(action, duration, step_update, values, begin.value, end);
      then(action, values, flags);
    });
  };

  SCENARIO('a valid sentinel is passed', () => {
    const { values, begin, action } = make();
    core_tween_test_impl(action, duration, step_update, values, begin.value, end);
    REQUIRE(tweeny.is_finished(action), 'the action should finish successfully');
  });

  SCENARIO('an invalid sentinel is passed', () => {
    const values = new values_t(object_value);
    values.sentinel_reset();
    const action = creator(type, values, { value: begin_value }, end, duration);
    REQUIRE(!action.is_valid(), 'the action should not be valid');
  });

  const finished = (action: tweeny.tween_action) => REQUIRE(tweeny.is_finished(action), 'the action should be finished');
  const expired = (action: tweeny.tween_action, values: values_t, flags: { requested: boolean }) => {
    finished(action);
    if (flags.requested) REQUIRE(values.sentinel_expired(), 'the sentinel should be expired');
  };
  const paused_if_requested = (action: tweeny.tween_action, _values: values_t, flags: { requested: boolean }) => {
    if (flags.requested && step_update) REQUIRE(tweeny.is_paused(action), 'the action should be paused');
    else finished(action);
  };

  callback_scenario("the 'on_begin' callback expires the sentinel", (action, values, flags) => {
    action.on_begin.connect(() => {
      flags.requested = true;
      values.sentinel_reset();
    });
  }, expired);
  callback_scenario("the 'on_begin' callback calls 'stop'", action => {
    action.on_begin.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop(action)));
  }, finished);
  callback_scenario("the 'on_begin' callback calls 'stop_and_finish'", action => {
    action.on_begin.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop_and_finish(action)));
  }, finished);
  callback_scenario("the 'on_begin' callback calls 'pause'", (action, _values, flags) => {
    action.on_begin.connect(() => {
      flags.requested = true;
      REQUIRE_NOTHROWS(() => tweeny.pause(action));
    });
  }, paused_if_requested);

  callback_scenario("the 'on_update' callback expires the sentinel", (action, values, flags) => {
    action.on_update.connect(() => {
      flags.requested = true;
      values.sentinel_reset();
    });
  }, expired);
  callback_scenario("the 'on_update' callback calls 'stop'", action => {
    action.on_update.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop(action)));
  }, finished);
  callback_scenario("the 'on_update' callback calls 'stop_and_finish'", action => {
    action.on_update.connect(() => REQUIRE_THROWS(() => tweeny.stop_and_finish(action)));
  }, finished);
  callback_scenario("the 'on_update' callback calls 'pause'", (action, _values, flags) => {
    action.on_update.connect(() => {
      flags.requested = true;
      REQUIRE_NOTHROWS(() => tweeny.pause(action));
    });
  }, paused_if_requested);

  callback_scenario("the 'on_step' callback expires the sentinel", (action, values, flags) => {
    action.on_step.connect(() => {
      flags.requested = true;
      values.sentinel_reset();
    });
  }, expired);
  callback_scenario("the 'on_step' callback calls 'stop'", action => {
    action.on_step.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop(action)));
  }, finished);
  callback_scenario("the 'on_step' callback calls 'stop_and_finish'", action => {
    let counter = 0;
    action.on_step.connect(() => {
      // first on_step can be called from start();
      if (counter++ > 0) REQUIRE_THROWS(() => tweeny.stop_and_finish(action));
    });
  }, finished);
  callback_scenario("the 'on_step' callback calls 'pause'", (action, _values, flags) => {
    action.on_step.connect(() => {
      flags.requested = true;
      REQUIRE_NOTHROWS(() => tweeny.pause(action));
    });
  }, paused_if_requested);

  callback_scenario("the 'on_end' callback expires the sentinel", (action, values, flags) => {
    action.on_end.connect(() => {
      flags.requested = true;
      values.sentinel_reset();
    });
  }, expired);
  callback_scenario("the 'on_end' callback calls 'stop'", action => {
    action.on_end.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop(action)));
  }, finished);
  callback_scenario("the 'on_end' callback calls 'stop_and_finish'", action => {
    action.on_end.connect(() => REQUIRE_NOTHROWS(() => tweeny.stop_and_finish(action)));
  }, finished);
  callback_scenario("the 'on_end' callback calls 'pause'", action => {
    action.on_end.connect(() => REQUIRE_NOTHROWS(() => tweeny.pause(action)));
  }, finished);
}

function run_tween_test(type: string, begin: number, end: number, object: number) {
  for (const duration of [random_value(-1_000_000, -1000), 0, random_value(1000, 1_000_000)]) {
    for (const step_update of [true, false]) {
      SCENARIO(`${type} duration ${Math.round(duration)}ms step_update ${step_update}`, () => scenario(step_update, type, duration, begin, end, object));
      // a scenario's tweens must not linger (C++ starts the next scenario with the manager as it is)
      tweeny.shutdown();
    }
  }
}

function test_scopes() {
  tweeny.scope.push('test1');
  {
    const t1 = tweeny.start(tweeny.delay(1000));
    const t2 = tweeny.start(tweeny.delay(1000));
    tweeny.scope.pause_all('test1');
    REQUIRE(tweeny.is_paused(t1));
    REQUIRE(tweeny.is_paused(t2));
    tweeny.scope.resume_all('test1');
    REQUIRE(!tweeny.is_paused(t1));
    REQUIRE(!tweeny.is_paused(t2));
    tweeny.scope.stop_and_finish_all('test1');
    REQUIRE(tweeny.is_finished(t1));
    REQUIRE(tweeny.is_finished(t2));
  }
  {
    tweeny.scope.push('test2');
    const t1 = tweeny.start(tweeny.delay(1000));
    const t2 = tweeny.start(tweeny.delay(1000));
    tweeny.scope.push('test3');
    const t3 = tweeny.start(tweeny.delay(1000));
    const t4 = tweeny.start(tweeny.delay(1000));
    tweeny.scope.stop_and_finish_all('test1');
    REQUIRE(tweeny.is_finished(t1));
    REQUIRE(tweeny.is_finished(t2));
    REQUIRE(tweeny.is_finished(t3));
    REQUIRE(tweeny.is_finished(t4));
  }
  REQUIRE(tweeny.scope.get_current() === 'test3');
  tweeny.scope.pop();
  REQUIRE(tweeny.scope.get_current() === 'test2');
  tweeny.scope.close('test1');
  REQUIRE(tweeny.scope.get_current() === '');
  REQUIRE_THROWS(() => tweeny.scope.pop());
  tweeny.scope.push('test1');
  tweeny.scope.push('test2');
  tweeny.scope.push('test3');
  tweeny.scope.push('test4');
  REQUIRE(tweeny.scope.get_current() === 'test4');
  tweeny.scope.pop();
  REQUIRE(tweeny.scope.get_current() === 'test3');
  REQUIRE_THROWS(() => tweeny.scope.push('test2'));
  tweeny.scope.clear();
  {
    // stacked
    tweeny.scope.push('test1');
    tweeny.scope.push('test2');
    const t1 = tweeny.start(tweeny.delay(100_000), 'test3');
    REQUIRE(tweeny.scope.get_current() === 'test2');
    REQUIRE(tweeny.has_tween_with_scope('test3'));
    tweeny.scope.stop_and_finish_all('test2');
    REQUIRE(tweeny.is_finished(t1));
    tweeny_update(1000); // process for tweens pending to remove.
    REQUIRE(!tweeny.has_tween_with_scope('test3'));
    tweeny.scope.clear();
  }
  {
    const scope_policy = new tweeny.tween_scope_policy();
    scope_policy.scope = 'test3';
    scope_policy.policy = tweeny.tween_scope_policy.policy_t.independent;
    tweeny.scope.push('test1');
    tweeny.scope.push('test2');
    const t1 = tweeny.start(tweeny.delay(100_000), scope_policy);
    REQUIRE(tweeny.scope.get_current() === 'test2');
    REQUIRE(tweeny.has_tween_with_scope('test3'));
    tweeny.scope.stop_and_finish_all('test2');
    tweeny.scope.close('test2');
    tweeny_update(1000); // process for tweens pending to remove.
    REQUIRE(tweeny.scope.get_current() === 'test1');
    REQUIRE(tweeny.is_running(t1));
    REQUIRE(tweeny.has_tween_with_scope('test3'));
    tweeny.stop_and_finish(t1);
  }
  {
    tweeny.scope.clear();
    REQUIRE(tweeny.scope.get_current() === '');
    tweeny.scope.push('test1');
    tweeny.start(tweeny.delay(100_000));
    REQUIRE(tweeny.has_tween_with_scope('test1'));
    tweeny.scope.push('test2');
    tweeny.start(tweeny.delay(100_000));
    REQUIRE(tweeny.has_tween_with_scope('test2'));
    tweeny.scope.push('test3');
    tweeny.start(tweeny.delay(100_000));
    REQUIRE(tweeny.has_tween_with_scope('test3'));
    tweeny.scope.push('test4');
    tweeny.start(tweeny.delay(100_000));
    REQUIRE(tweeny.has_tween_with_scope('test4'));
    tweeny.scope.pop();
    REQUIRE(tweeny.scope.get_current() === 'test3');
    tweeny.scope.stop_all('test1');
    tweeny_update(1000); // process for tweens pending to remove.
    REQUIRE(!tweeny.has_tween_with_scope('test1'));
    REQUIRE(!tweeny.has_tween_with_scope('test2'));
    REQUIRE(!tweeny.has_tween_with_scope('test3'));
    REQUIRE(!tweeny.has_tween_with_scope('test4'));
  }
  {
    tweeny.scope.clear();
    REQUIRE(tweeny.scope.get_current() === '');
    tweeny.scope.push('test1');
    const t1 = tweeny.start(tweeny.delay(100_000));
    tweeny.scope.push('test2');
    const t2 = tweeny.start(tweeny.delay(100_000));
    tweeny.scope.push('test3');
    const t3 = tweeny.start(tweeny.delay(100_000));
    tweeny.scope.push('test4');
    const t4 = tweeny.start(tweeny.delay(100_000));
    tweeny.scope.pause_all('test1', 'KEY');
    for (const t of [t1, t2, t3, t4]) REQUIRE(tweeny.is_paused(t), 'paused by the scope');
    // a tween paused with a key resumes only with it
    for (const t of [t1, t2, t3, t4]) {
      tweeny.resume(t);
      REQUIRE(tweeny.is_paused(t), 'still paused');
    }
    tweeny.scope.resume_all('test1', 'KEY');
    for (const t of [t1, t2, t3, t4]) REQUIRE(!tweeny.is_paused(t), 'resumed with the key');
  }
  tweeny.scope.clear();
  tweeny.shutdown();
}

/** What the browser game relies on, beyond the C++ tests. */
function test_combinators() {
  SCENARIO('sequence runs its tweens one after another', () => {
    const log: string[] = [];
    const a = tweeny.delay(100);
    a.on_begin.connect(() => log.push('a begin'));
    a.on_end.connect(() => log.push('a end'));
    const b = tweeny.delay(50);
    b.on_end.connect(() => log.push('b end'));
    const seq = tweeny.sequence(a, b);
    seq.on_end.connect(() => log.push('end'));
    REQUIRE(tweeny.get_duration(tweeny.start(seq)) === 150, 'a sequence lasts its tweens');
    REQUIRE(log.join() === 'a begin', `${log}`);
    for (let i = 0; i < 9; i++) tweeny.update(10);
    REQUIRE(log.join() === 'a begin', `before 100ms: ${log}`);
    tweeny.update(10);
    REQUIRE(log.join() === 'a begin,a end', `at 100ms: ${log}`);
    for (let i = 0; i < 6; i++) tweeny.update(10);
    REQUIRE(log.join() === 'a begin,a end,b end,end', `at 150ms: ${log}`);
    REQUIRE(tweeny.is_finished(seq));
  });

  SCENARIO('sequence_precise carries the time a tween runs over into the next', () => {
    let value = 0;
    const holder = { value };
    const moves = (precise: boolean) => {
      holder.value = 0;
      const step = (to: number) => tweeny.tween_to(tweeny.ref(holder, 'value'), to, 100, make_sentinel());
      const seq = (precise ? tweeny.sequence_precise : tweeny.sequence)([step(100), step(200)]);
      tweeny.start(seq);
      tweeny.update(0);
      // 70 + 70 = 140 ms: the first runs over by 40 ms
      tweeny.update(70);
      tweeny.update(70);
      tweeny.update(10);
      value = holder.value;
      tweeny.shutdown();
      return value;
    };
    const plain = moves(false);
    const precise = moves(true);
    REQUIRE(precise > plain, `precise ${precise} > plain ${plain}`);
  });

  SCENARIO('together lasts its longest tween', () => {
    let ended = 0;
    const action = tweeny.together([tweeny.delay(30), tweeny.delay(100)]);
    action.on_end.connect(() => ended++);
    tweeny.start(action);
    tweeny.update(50);
    REQUIRE(ended === 0 && tweeny.is_running(action));
    tweeny.update(50);
    REQUIRE(ended === 1 && tweeny.is_finished(action), `ended ${ended}`);
  });

  SCENARIO('repeat runs its tween the times given, or until stopped', () => {
    let begins = 0;
    const tween = tweeny.delay(10);
    tween.on_begin.connect(() => begins++);
    const three = tweeny.repeat(tween, 3);
    REQUIRE(tweeny.get_duration(tweeny.start(three)) === 30);
    for (let i = 0; i < 10; i++) tweeny.update(10);
    REQUIRE(tweeny.is_finished(three), 'three times');
    REQUIRE(begins === 3, `begins ${begins}`);
    begins = 0;
    const forever = tweeny.repeat(tween);
    tweeny.start(forever);
    for (let i = 0; i < 100; i++) tweeny.update(10);
    REQUIRE(tweeny.is_running(forever) && begins >= 50, `forever: ${begins}`);
    tweeny.stop(forever);
    tweeny.update(10);
    REQUIRE(tweeny.is_finished(forever));
  });

  SCENARIO('an action is a value: a started copy runs, the action stays as it was', () => {
    let ended = 0;
    const action = tweeny.delay(10);
    tweeny.start(action);
    // connected after the start: the copy started has no such slot
    action.on_end.connect(() => ended++);
    tweeny.update(20);
    REQUIRE(ended === 0, 'the started copy has no slot connected later');
    tweeny.start(action);
    tweeny.update(20);
    REQUIRE(ended === 1, 'started again: a copy with the slot');
  });

  SCENARIO('stop ends a tween without on_end, stop_and_finish with it', () => {
    let ended = 0;
    const holder = { value: 0 };
    const action = tweeny.tween_from_to(tweeny.ref(holder, 'value'), 0, 10, 100, make_sentinel());
    action.on_end.connect(() => ended++);
    tweeny.start(action);
    tweeny.update(10);
    tweeny.stop(action);
    REQUIRE(ended === 0 && holder.value < 10, 'stopped');
    tweeny.start(action);
    tweeny.update(0);
    tweeny.stop_and_finish(action);
    REQUIRE(ended === 1 && holder.value === 10, `finished at the end (${holder.value})`);
  });

  SCENARIO('a tween of an object value', () => {
    const holder = { point: { x: 0, y: 10 } };
    const action = tweeny.tween_to(tweeny.ref(holder, 'point'), { x: 100, y: 20 }, 100, make_sentinel());
    tweeny.start(action);
    tweeny.update(0);
    tweeny.update(50);
    REQUIRE(holder.point.x === 50 && holder.point.y === 15, JSON.stringify(holder.point));
    tweeny.update(50);
    REQUIRE(holder.point.x === 100 && holder.point.y === 20, JSON.stringify(holder.point));
  });

  SCENARIO('the easings are those of C++', () => {
    const list = tweeny.ease.get_ease_list();
    REQUIRE(list.length === 36, `${list.length} easings`);
    for (const [name, fn] of list) {
      // the arches go back to 0; C++'s bounce_start_stop starts at 0.5 (its first half bounces out, not in)
      if (name.startsWith('arch') || name === 'bounce_start_stop') continue;
      REQUIRE(compare(fn(0), 0) && compare(fn(1), 1), `${name}(0) = ${fn(0)}, ${name}(1) = ${fn(1)}`);
    }
    REQUIRE(compare(tweeny.ease.smooth_stop2(0.5), 0.75), 'smooth_stop2');
    REQUIRE(compare(tweeny.ease.back_stop(0.5), 1.0876975), `back_stop ${tweeny.ease.back_stop(0.5)}`);
    REQUIRE(compare(tweeny.ease.arch(0.5), 1), 'arch');
    REQUIRE(compare(tweeny.ease.bounce_start_stop(0), 0.5), 'bounce_start_stop(0), as C++');
  });
  tweeny.shutdown();
}

export function run() {
  failures.length = 0;
  checks = 0;
  // C++ runs the first easing (linear)
  const [easing_type, easing] = tweeny.ease.get_ease_list()[0];
  EASING = easing;
  for (const [begin, end, object] of [[-1000, 1000, random_value(-1000, 1000)], [random_value(-1000, 1000), random_value(-1000, 1000), 0]]) {
    SCENARIO(`[${easing_type}] begin ${Math.round(begin)} end ${Math.round(end)}`, () => {
      run_tween_test('tween_from_to', begin, end, object);
      run_tween_test('tween_to', begin, end, object);
      run_tween_test('tween_by', begin, end, 0);
    });
  }
  SCENARIO('scopes', test_scopes);
  test_combinators();
  if (detail.get_manager().get_tweenies().size) failures.push('tweens linger in the manager');
  return { checks, failures: [...failures] };
}
