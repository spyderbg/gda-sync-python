// Egt::Game::AlphaFamily::ViewTools::Accumulation (AlphaFamily/Views/Tools/AccumulationControl.h/.cpp): the steps a
// numeric bar counts by from one value to another. The values are C++'s int64_t: its divisions truncate (Math.trunc).

import type { int, int64_t } from '@game/engine/GameCore/Common/Types';
import { type AccumulationDescriptor, type AccumulationStep, AccumulationType } from './AccumulationControl.data';

/** std::numeric_limits<int64_t>::max(), as far as a number holds it exactly. */
const INT64_MAX = Number.MAX_SAFE_INTEGER;

function NewDescriptor(type: AccumulationType, initialValue: int64_t, targetValue: int64_t): AccumulationDescriptor {
  return { type, initialValue, targetValue, steps: [] };
}

function NewStep(value: int64_t, beginTimeSinceStartMs: int64_t, endTimeSinceStartMs: int64_t): AccumulationStep {
  return { value, beginTimeSinceStartMs, endTimeSinceStartMs };
}

function _calcCoeff(duration: int64_t, changeSpeed: int64_t, distance: int64_t) {
  const stepsTo_1 = duration / changeSpeed;
  const geometricCoeff = Math.pow(1.0 / distance, 1.0 / stepsTo_1);
  return geometricCoeff;
}

export const Accumulation = {
  CreateGeometryAccumulationByFactor(
    startValue: int64_t, // units
    endValue: int64_t, // units
    factor: int, // geometric progression: (1/factor) * units
    changeDuration: int64_t, // time/unit (example: 360ms per 1 unit)
  ): AccumulationDescriptor {
    const descriptor = NewDescriptor(AccumulationType.eGeometric, startValue, endValue);
    const steps = descriptor.steps;

    steps.push(NewStep(descriptor.initialValue, 0, changeDuration));
    if (endValue === startValue) {
      return descriptor;
    }

    const direction = Math.trunc((endValue - startValue) / Math.abs(endValue - startValue));
    while (steps[steps.length - 1].value !== descriptor.targetValue) {
      const lastStep = steps[steps.length - 1];
      let diff = Math.trunc((descriptor.targetValue - lastStep.value) / factor);
      if (diff === 0) {
        diff = direction;
      }
      const newValue = lastStep.value + diff;
      const newTime = lastStep.endTimeSinceStartMs;
      steps.push(NewStep(newValue, newTime, newTime + changeDuration));
    }
    return descriptor;
  },

  CreateGeometryAccumulationByDuration(
    startValue: int64_t, // units
    endValue: int64_t, // units
    changesCount: int64_t, // changesCount * changeSpeed = duration ms
    changeDuration: int64_t, // time/unit (example: 360ms per 1 unit)
  ): AccumulationDescriptor {
    if (changesCount === 0 || changeDuration === 0 || startValue === endValue) {
      return Accumulation.CreateInstantAccumulation(startValue, endValue);
    }

    const descriptor = NewDescriptor(AccumulationType.eGeometric, startValue, endValue);
    const steps = descriptor.steps;

    steps.push(NewStep(descriptor.initialValue, 0, changeDuration));
    if (endValue === startValue) {
      return descriptor;
    }

    const k = _calcCoeff(changesCount * changeDuration, changeDuration, Math.abs(endValue - startValue));
    const direction = Math.trunc((endValue - startValue) / Math.abs(endValue - startValue));

    for (let changeNumber = 1; changeNumber <= changesCount; changeNumber++) {
      const lastStep = steps[steps.length - 1];
      const stepsLeft = changesCount - changeNumber;

      const valueLeft = descriptor.targetValue - lastStep.value;
      let diff = Math.trunc(valueLeft - valueLeft * k) * direction;
      if (diff === 0) {
        diff = direction;
      }
      if (Math.abs(endValue - lastStep.value - diff) < stepsLeft) {
        diff = endValue - lastStep.value - stepsLeft;
      }

      if (endValue !== lastStep.value + diff && stepsLeft === 0) {
        diff = endValue - lastStep.value;
      }

      const newValue = lastStep.value + diff;
      const newTime = lastStep.endTimeSinceStartMs;
      steps.push(NewStep(newValue, newTime, newTime + changeDuration));
    }
    return descriptor;
  },

  CreateLinearAccumulationBySpeed(
    startValue: int64_t, // units
    endValue: int64_t, // units
    changesCount: int64_t, // changesCount * changeSpeed = duration ms
    changeDuration: int64_t, // time/unit (example: 360ms per 1 unit)
    minDuration: int64_t = 0, // ms
    maxDuration: int64_t = INT64_MAX, // ms
  ): AccumulationDescriptor {
    const descriptor = NewDescriptor(AccumulationType.eGeometric, startValue, endValue);
    const steps = descriptor.steps;

    steps.push(NewStep(descriptor.initialValue, 0, changeDuration));
    if (endValue === startValue) {
      return descriptor;
    }

    if (changeDuration * changesCount > maxDuration) {
      changeDuration = Math.trunc(maxDuration / changesCount);
    }
    if (changeDuration * changesCount < minDuration) {
      changeDuration = Math.trunc(minDuration / changesCount);
    }

    const direction = Math.trunc((endValue - startValue) / Math.abs(endValue - startValue));
    for (let changeNumber = 0; changeNumber < changesCount; changeNumber++) {
      const lastStep = steps[steps.length - 1];
      const stepsLeft = changesCount - changeNumber - 1;

      const valueLeft = descriptor.targetValue - lastStep.value;
      let diff = Math.trunc(valueLeft / (stepsLeft + 1));
      if (diff === 0) {
        diff = direction;
      }
      if (Math.abs(endValue - lastStep.value - diff) < stepsLeft) {
        diff = endValue - lastStep.value - stepsLeft;
      }

      if (endValue !== lastStep.value + diff && stepsLeft === 0) {
        diff = endValue - lastStep.value;
      }

      const newValue = lastStep.value + diff;
      if (newValue === endValue) break;

      const newTime = lastStep.endTimeSinceStartMs;
      steps.push(NewStep(newValue, newTime, newTime + changeDuration));
    }
    return descriptor;
  },

  CreateLinearAccumulationByDuration(
    startValue: int64_t, // units
    endValue: int64_t, // units
    changesCount: int64_t, // changesCount * changeSpeed = duration ms
    targetDuration: int64_t, // changeSpeed = targetDuration / changesCount
    minChangeDuration: int64_t = 1, // duration = changesCount * changeSpeed
    maxChangeDuration: int64_t = INT64_MAX, // duration = changesCount * changeSpeed
  ): AccumulationDescriptor {
    if (changesCount === 0 || startValue === endValue) {
      return Accumulation.CreateInstantAccumulation(startValue, endValue);
    }
    // std::clamp
    const changeDuration = Math.min(Math.max(Math.trunc(targetDuration / changesCount), minChangeDuration), maxChangeDuration);
    return Accumulation.CreateLinearAccumulationBySpeed(startValue, endValue, changesCount, changeDuration);
  },

  CreateInstantAccumulation(
    startValue: int64_t, // units
    endValue: int64_t, // units
  ): AccumulationDescriptor {
    const descriptor = NewDescriptor(AccumulationType.eInstantly, startValue, endValue);
    //
    descriptor.steps.push(NewStep(endValue, 0, 1));

    return descriptor;
  },

  CreateInstantAccumulationWithPauseAtEnd(startValue: int64_t, endValue: int64_t, pauseDuration: int64_t): AccumulationDescriptor {
    if (pauseDuration === 0 || startValue === endValue) {
      return Accumulation.CreateInstantAccumulation(startValue, endValue);
    }

    const descriptor = NewDescriptor(AccumulationType.eGeometric, startValue, endValue);
    const steps = descriptor.steps;

    steps.push(NewStep(startValue, 0, 1));

    steps.push(NewStep(endValue, 1, 2));

    steps.push(NewStep(endValue, 2, 2 + pauseDuration));
    return descriptor;
  },

  GetAccumulationDuration(descriptor: AccumulationDescriptor): int64_t {
    if (descriptor.steps.length === 0) {
      return 0;
    }
    return descriptor.steps[descriptor.steps.length - 1].beginTimeSinceStartMs;
  },

  GetCurrentValue(descriptor: AccumulationDescriptor, ms: int64_t): int64_t {
    const steps = descriptor.steps;
    if (steps.length === 0) return descriptor.targetValue;
    if (ms >= steps[steps.length - 1].endTimeSinceStartMs) return descriptor.targetValue;

    const it = steps.find(step => step.beginTimeSinceStartMs <= ms && ms < step.endTimeSinceStartMs);

    return it !== undefined ? it.value : descriptor.targetValue;
  },
};
