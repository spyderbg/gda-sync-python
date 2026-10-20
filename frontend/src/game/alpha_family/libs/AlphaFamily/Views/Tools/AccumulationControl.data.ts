// Egt::Game::AlphaFamily::ViewTools accumulation (AlphaFamily/Views/Tools/AccumulationControl.data.h): how a numeric
// bar counts from one value to another, as steps in time.

export interface AccumulationStep {
  value: number;
  beginTimeSinceStartMs: number;
  endTimeSinceStartMs: number;
}

export enum AccumulationType {
  eInstantly,
  eLinear,
  eGeometric,
}

export interface AccumulationDescriptor {
  type: AccumulationType;
  initialValue: number;
  targetValue: number;
  steps: AccumulationStep[];
}
