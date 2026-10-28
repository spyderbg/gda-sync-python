// Egt::GameCore's Lerp, InverseLerp, Remap and RemapClamped (GameCore/Common/Interpolation.h), of numbers: a value of
// one range, as a value of another.

export function Lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

export function InverseLerp(a: number, b: number, value: number) {
  return (value - a) / (b - a);
}

export function Remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const ratio = InverseLerp(inMin, inMax, value);
  return Lerp(outMin, outMax, ratio);
}

export function RemapClamped(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMin < inMax) {
    if (value >= inMax) return outMax;
    if (value <= inMin) return outMin;
  } else {
    if (value <= inMax) return outMax;
    if (value >= inMin) return outMin;
  }
  return Remap(value, inMin, inMax, outMin, outMax);
}
