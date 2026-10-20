// Egt::Game::AlphaFamily::ViewTools::Accumulation (AlphaFamily/Views/Tools/AccumulationControl.h/.cpp).

import { type AccumulationDescriptor, AccumulationType } from './AccumulationControl.data';

export const Accumulation = {
  CreateInstantAccumulation(startValue: number, endValue: number): AccumulationDescriptor {
    return { type: AccumulationType.eInstantly, initialValue: startValue, targetValue: endValue, steps: [{ value: endValue, beginTimeSinceStartMs: 0, endTimeSinceStartMs: 1 }] };
  },

  CreateInstantAccumulationWithPauseAtEnd(startValue: number, endValue: number, pauseDuration: number): AccumulationDescriptor {
    if (pauseDuration === 0 || startValue === endValue) return Accumulation.CreateInstantAccumulation(startValue, endValue);
    return {
      type: AccumulationType.eGeometric, initialValue: startValue, targetValue: endValue, steps: [
        { value: startValue, beginTimeSinceStartMs: 0, endTimeSinceStartMs: 1 },
        { value: endValue, beginTimeSinceStartMs: 1, endTimeSinceStartMs: 2 },
        { value: endValue, beginTimeSinceStartMs: 2, endTimeSinceStartMs: 2 + pauseDuration },
      ],
    };
  },

  /** Each step covers 1/factor of what remains, a step every changeDuration. */
  CreateGeometryAccumulationByFactor(startValue: number, endValue: number, factor: number, changeDuration: number): AccumulationDescriptor {
    const steps = [{ value: startValue, beginTimeSinceStartMs: 0, endTimeSinceStartMs: changeDuration }];
    const direction = Math.sign(endValue - startValue);
    while (steps[steps.length - 1].value !== endValue && direction !== 0) {
      const last = steps[steps.length - 1];
      let diff = Math.trunc((endValue - last.value) / factor);
      if (diff === 0) diff = direction * Math.max(1, Math.min(Math.abs(endValue - last.value), Math.ceil(Math.abs(endValue - startValue) / 100)));
      const value = direction > 0 ? Math.min(endValue, last.value + diff) : Math.max(endValue, last.value + diff);
      steps.push({ value, beginTimeSinceStartMs: last.endTimeSinceStartMs, endTimeSinceStartMs: last.endTimeSinceStartMs + changeDuration });
    }
    return { type: AccumulationType.eGeometric, initialValue: startValue, targetValue: endValue, steps };
  },

  /** changesCount equal steps, each changeDuration long. */
  CreateLinearAccumulationBySpeed(startValue: number, endValue: number, changesCount: number, changeDuration: number): AccumulationDescriptor {
    const steps = [{ value: startValue, beginTimeSinceStartMs: 0, endTimeSinceStartMs: changeDuration }];
    const count = Math.max(1, changesCount);
    for (let i = 1; i <= count; i++) {
      steps.push({ value: Math.round(startValue + ((endValue - startValue) * i) / count), beginTimeSinceStartMs: i * changeDuration, endTimeSinceStartMs: (i + 1) * changeDuration });
    }
    return { type: AccumulationType.eLinear, initialValue: startValue, targetValue: endValue, steps };
  },

  CreateLinearAccumulationByDuration(startValue: number, endValue: number, changesCount: number, targetDuration: number, minChangeDuration = 0,
    maxChangeDuration = 999_999): AccumulationDescriptor {
    if (changesCount === 0 || startValue === endValue) return Accumulation.CreateInstantAccumulation(startValue, endValue);
    const changeDuration = Math.min(maxChangeDuration, Math.max(minChangeDuration, Math.trunc(targetDuration / changesCount)));
    return Accumulation.CreateLinearAccumulationBySpeed(startValue, endValue, changesCount, changeDuration);
  },

  GetAccumulationDuration(descriptor: AccumulationDescriptor) {
    return descriptor.steps.length ? descriptor.steps[descriptor.steps.length - 1].endTimeSinceStartMs : 0;
  },
};
