// tweeny::ease (tweeny/tween_ease.h/.cpp): the easing functions, which map a tween's progress (0 to 1) to the share of
// the change it has made.

import { reverse_scale, scale } from './tween_math';

const pi = 3.14159265358979323846;
const half_pi = pi * 0.5;

function linearInterpolation(a: number) {
  return a;
}

function quadraticEaseIn(a: number) {
  return a * a;
}

function quadraticEaseOut(a: number) {
  return -(a * (a - 2));
}

function quadraticEaseInOut(a: number) {
  if (a < 0.5) return 2 * a * a;
  return -2 * a * a + 4 * a - 1;
}

function cubicEaseIn(a: number) {
  return a * a * a;
}

function cubicEaseOut(a: number) {
  const f = a - 1;
  return f * f * f + 1;
}

function cubicEaseInOut(a: number) {
  if (a < 0.5) return 4 * a * a * a;
  const f = 2 * a - 2;
  return 0.5 * f * f * f + 1;
}

function quarticEaseIn(a: number) {
  return a * a * a * a;
}

function quarticEaseOut(a: number) {
  const f = a - 1;
  return f * f * f * (1 - a) + 1;
}

function quarticEaseInOut(a: number) {
  if (a < 0.5) return 8 * a * a * a * a;
  const f = a - 1;
  return -8 * f * f * f * f + 1;
}

function quinticEaseIn(a: number) {
  return a * a * a * a * a;
}

function quinticEaseOut(a: number) {
  const f = a - 1;
  return f * f * f * f * f + 1;
}

function quinticEaseInOut(a: number) {
  if (a < 0.5) return 16 * a * a * a * a * a;
  const f = 2 * a - 2;
  return 0.5 * f * f * f * f * f + 1;
}

function sineEaseIn(a: number) {
  return Math.sin((a - 1) * half_pi) + 1;
}

function sineEaseOut(a: number) {
  return Math.sin(a * half_pi);
}

function sineEaseInOut(a: number) {
  return 0.5 * (1 - Math.cos(a * pi));
}

function circularEaseIn(a: number) {
  return 1 - Math.sqrt(1 - a * a);
}

function circularEaseOut(a: number) {
  return Math.sqrt((2 - a) * a);
}

function circularEaseInOut(a: number) {
  if (a < 0.5) return 0.5 * (1 - Math.sqrt(1 - 4 * (a * a)));
  return 0.5 * (Math.sqrt(-(2 * a - 3) * (2 * a - 1)) + 1);
}

function exponentialEaseIn(a: number) {
  if (a <= 0) return a;
  return Math.pow(2, (a - 1) * 10);
}

function exponentialEaseOut(a: number) {
  if (a >= 1) return a;
  return 1 - Math.pow(2, -10 * a);
}

function exponentialEaseInOut(a: number) {
  if (a < 0.5) return 0.5 * Math.pow(2, 20 * a - 10);
  return -0.5 * Math.pow(2, -20 * a + 10) + 1;
}

function elasticEaseIn(a: number) {
  return Math.sin(13 * half_pi * a) * Math.pow(2, 10 * (a - 1));
}

function elasticEaseOut(a: number) {
  return Math.sin(-13 * half_pi * (a + 1)) * Math.pow(2, -10 * a) + 1;
}

function elasticEaseInOut(a: number) {
  if (a < 0.5) return 0.5 * Math.sin(13 * half_pi * (2 * a)) * Math.pow(2, 10 * (2 * a - 1));
  return 0.5 * (Math.sin(-13 * half_pi * (2 * a - 1 + 1)) * Math.pow(2, -10 * (2 * a - 1)) + 2);
}

function backEaseIn(a: number, o = 1.70158) {
  const z = (o + 1) * a - o;
  return a * a * z;
}

function backEaseOut(a: number, o = 1.70158) {
  const n = a - 1;
  const z = (o + 1) * n + o;
  return n * n * z + 1;
}

function backEaseInOut(a: number, o = 1.70158) {
  const s = o * 1.525;
  const x = 0.5;
  let n = a / 0.5;
  if (n < 1) {
    const z = (s + 1) * n - s;
    const m = n * n * z;
    return x * m;
  }
  n -= 2;
  const z = (s + 1) * n + s;
  const m = n * n * z + 2;
  return x * m;
}

function bounceEaseOut(a: number) {
  if (a < 4.0 / 11.0) return (121 * a * a) / 16;
  if (a < 8.0 / 11.0) return (363.0 / 40.0) * a * a - (99.0 / 10.0) * a + 17.0 / 5.0;
  if (a < 9.0 / 10.0) return (4356.0 / 361.0) * a * a - (35442.0 / 1805.0) * a + 16061.0 / 1805.0;
  return (54.0 / 5.0) * a * a - (513.0 / 25.0) * a + 268.0 / 25.0;
}

function bounceEaseIn(a: number) {
  return 1 - bounceEaseOut(1 - a);
}

function bounceEaseInOut(a: number) {
  if (a < 0.5) return 0.5 * (1 - bounceEaseOut(a * 2));
  return 0.5 * bounceEaseOut(a * 2 - 1) + 0.5;
}

export function linear(progress: number) {
  return linearInterpolation(progress);
}

/** Modelled after quarter-cycle of sine wave */
export function smooth_start(progress: number) {
  return sineEaseIn(progress);
}

/** Modelled after quarter-cycle of sine wave (different phase) */
export function smooth_stop(progress: number) {
  return sineEaseOut(progress);
}

/** Modelled after half sine wave */
export function smooth_start_stop(progress: number) {
  return sineEaseInOut(progress);
}

/** Modelled after the parabola y = x^2 */
export function smooth_start2(progress: number) {
  return quadraticEaseIn(progress);
}

/** Modelled after the parabola y = -x^2 + 2x */
export function smooth_stop2(progress: number) {
  return quadraticEaseOut(progress);
}

/** Modelled after the piecewise quadratic */
export function smooth_start_stop2(progress: number) {
  return quadraticEaseInOut(progress);
}

/** Modelled after the cubic y = x^3 */
export function smooth_start3(progress: number) {
  return cubicEaseIn(progress);
}

/** Modelled after the cubic y = (x - 1)^3 + 1 */
export function smooth_stop3(progress: number) {
  return cubicEaseOut(progress);
}

/** Modelled after the piecewise cubic */
export function smooth_start_stop3(progress: number) {
  return cubicEaseInOut(progress);
}

/** Modelled after the quartic x^4 */
export function smooth_start4(progress: number) {
  return quarticEaseIn(progress);
}

/** Modelled after the quartic y = 1 - (x - 1)^4 */
export function smooth_stop4(progress: number) {
  return quarticEaseOut(progress);
}

/** Modelled after the piecewise quartic */
export function smooth_start_stop4(progress: number) {
  return quarticEaseInOut(progress);
}

/** Modelled after the quintic y = x^5 */
export function smooth_start5(progress: number) {
  return quinticEaseIn(progress);
}

/** Modelled after the quintic y = (x - 1)^5 + 1 */
export function smooth_stop5(progress: number) {
  return quinticEaseOut(progress);
}

/** Modelled after the piecewise quintic */
export function smooth_start_stop5(progress: number) {
  return quinticEaseInOut(progress);
}

/** Modelled after the exponential function y = 2^(10(x - 1)) */
export function smooth_start6(progress: number) {
  return exponentialEaseIn(progress);
}

/** Modelled after the exponential function y = -2^(-10x) + 1 */
export function smooth_stop6(progress: number) {
  return exponentialEaseOut(progress);
}

/** Modelled after the piecewise exponential */
export function smooth_start_stop6(progress: number) {
  return exponentialEaseInOut(progress);
}

/** Modelled after shifted quadrant IV of unit circle */
export function circular_start(progress: number) {
  return circularEaseIn(progress);
}

/** Modelled after shifted quadrant II of unit circle */
export function circular_stop(progress: number) {
  return circularEaseOut(progress);
}

/** Modelled after the piecewise circular function */
export function circular_start_stop(progress: number) {
  return circularEaseInOut(progress);
}

/** Modelled after the damped sine wave y = sin(13pi/2*x)*pow(2, 10 * (x - 1)) */
export function elastic_start(progress: number) {
  return elasticEaseIn(progress);
}

/** Modelled after the damped sine wave y = sin(-13pi/2*(x + 1))*pow(2, -10x) + 1 */
export function elastic_stop(progress: number) {
  return elasticEaseOut(progress);
}

/** Modelled after the piecewise exponentially-damped sine wave */
export function elastic_start_stop(progress: number) {
  return elasticEaseInOut(progress);
}

export function back_start(progress: number) {
  return backEaseIn(progress);
}

export function back_stop(progress: number) {
  return backEaseOut(progress);
}

export function back_start_stop(progress: number) {
  return backEaseInOut(progress);
}

export function bounce_start(progress: number) {
  return bounceEaseIn(progress);
}

export function bounce_stop(progress: number) {
  return bounceEaseOut(progress);
}

export function bounce_start_stop(progress: number) {
  return bounceEaseInOut(progress);
}

export function arch(progress: number) {
  return progress * (1 - progress) * 4;
}

export function arch_smooth_step(progress: number) {
  return reverse_scale(scale(arch(progress), progress), progress) * 4;
}

export function arch_smooth_start_stop(progress: number) {
  return arch_smooth_start(progress) * arch_smooth_stop(progress);
}

export function arch_smooth_start(progress: number) {
  return progress * progress * (1 - progress) * 8;
}

export function arch_smooth_stop(progress: number) {
  const remaining = 1 - progress;
  return progress * remaining * remaining * 8;
}

export function create_back_start(overshoot = 1.70158) {
  return (a: number) => backEaseIn(a, overshoot);
}

export function create_back_stop(overshoot = 1.70158) {
  return (a: number) => backEaseOut(a, overshoot);
}

export function create_back_stop_stop(overshoot = 1.70158) {
  return (a: number) => backEaseInOut(a, overshoot);
}

const list: readonly (readonly [string, (progress: number) => number])[] = [
  ['linear', linear],

  ['smooth_start', smooth_start],
  ['smooth_start2', smooth_start2],
  ['smooth_start3', smooth_start3],
  ['smooth_start4', smooth_start4],
  ['smooth_start5', smooth_start5],
  ['smooth_start6', smooth_start6],

  ['smooth_stop', smooth_stop],
  ['smooth_stop2', smooth_stop2],
  ['smooth_stop3', smooth_stop3],
  ['smooth_stop4', smooth_stop4],
  ['smooth_stop5', smooth_stop5],
  ['smooth_stop6', smooth_stop6],

  ['smooth_start_stop', smooth_start_stop],
  ['smooth_start_stop2', smooth_start_stop2],
  ['smooth_start_stop3', smooth_start_stop3],
  ['smooth_start_stop4', smooth_start_stop4],
  ['smooth_start_stop5', smooth_start_stop5],
  ['smooth_start_stop6', smooth_start_stop6],

  ['circular_start', circular_start],
  ['circular_stop', circular_stop],
  ['circular_start_stop', circular_start_stop],

  ['elastic_start', elastic_start],
  ['elastic_stop', elastic_stop],
  ['elastic_start_stop', elastic_start_stop],

  ['back_start', back_start],
  ['back_stop', back_stop],
  ['back_start_stop', back_start_stop],

  ['bounce_start', bounce_start],
  ['bounce_stop', bounce_stop],
  ['bounce_start_stop', bounce_start_stop],

  ['arch', arch],
  ['arch_smooth_step', arch_smooth_step],
  ['arch_smooth_start_stop', arch_smooth_start_stop],
  ['arch_smooth_start', arch_smooth_start],
  ['arch_smooth_stop', arch_smooth_stop],
];

/** The easings by name. */
export function get_ease_list() {
  return list;
}
