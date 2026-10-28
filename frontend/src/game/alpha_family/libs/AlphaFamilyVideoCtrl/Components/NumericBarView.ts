// Egt::Game::AlphaFamily::NumericBarView (AlphaFamilyVideoCtrl/Components/NumericBarView.h): a bar that shows a value
// and counts to new values by an accumulation, posting animatingDone with the value when it gets there.

import type { Runtime, InterfaceToken } from '@game/engine/GameCore/RuntimeAccess';
import { Accumulation } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl';
import { type AccumulationDescriptor, AccumulationType } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl.data';
import type { INumericBarView, INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { BaseView } from '../BaseView';

export abstract class NumericBarView<T, E extends INumericBarViewEvents> extends BaseView implements INumericBarView {
  protected m_currentValue = 0;
  protected m_visible = true;
  private m_runningAccumulation: AccumulationDescriptor | null = null;
  private m_accumulationStart = 0;

  constructor(name: string, protected readonly m_token: InterfaceToken<T, E>, protected readonly m_events: E) {
    super(name);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(this.m_token, this as unknown as T);
    this.RuntimeAdd(this.m_token.Events, this.m_events);
    return true;
  }

  Deinit() {
    this.RuntimeRemove(this.m_token);
    this.RuntimeRemove(this.m_token.Events);
    super.Deinit();
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    this.m_visible = visible;
  }

  SetAccumulation(accumulation: AccumulationDescriptor) {
    this.m_runningAccumulation = accumulation;
    this.m_accumulationStart = performance.now();
    this.m_currentValue = accumulation.initialValue;
    if (accumulation.type === AccumulationType.eInstantly) this.FinishAccumulation(true);
  }

  SetValue(value: number) {
    this.SetAccumulation(Accumulation.CreateGeometryAccumulationByFactor(this.m_currentValue, value, 8, 200));
  }

  SetValueNow(value: number) {
    this.m_runningAccumulation = null;
    this.m_currentValue = value;
  }

  /** C++'s m_accumulation, the last accumulation. C++ keeps it once it ends; here it is dropped once the value shown
   * reaches its target, and this is then an instant one to the value shown. */
  protected get m_accumulation(): AccumulationDescriptor {
    return this.m_runningAccumulation
      ?? { type: AccumulationType.eInstantly, initialValue: this.m_currentValue, targetValue: this.m_currentValue, steps: [] };
  }

  /** Counts a win up from the value shown, as AddValueWithGeometricAccumulation does. */
  protected AddValueWithGeometricAccumulation(value: number) {
    const start = this.m_accumulation.targetValue;
    const descriptor = Accumulation.CreateGeometryAccumulationByFactor(this.m_currentValue, start + value, 8, 220);
    this.SetAccumulation(descriptor);
  }

  protected AddValueWithSteppedAccumulation(value: number) {
    const start = this.m_accumulation.targetValue;
    this.SetAccumulation(Accumulation.CreateLinearAccumulationBySpeed(this.m_currentValue, start + value, 4, 60));
  }

  IsCurrentlyAccumulating() {
    return this.m_runningAccumulation !== null;
  }

  FastForward() {
    if (this.m_runningAccumulation) this.FinishAccumulation(false);
  }

  IsAccumulating() {
    return this.m_runningAccumulation !== null;
  }

  PlayBarAudioState(_audioStateName: string) {}

  private FinishAccumulation(instant: boolean) {
    const accumulation = this.m_runningAccumulation!;
    this.m_runningAccumulation = null;
    this.m_currentValue = accumulation.targetValue;
    if (instant) this.m_events.animatingInstantDone.Post(this.m_currentValue);
    this.m_events.animatingDone.Post(this.m_currentValue);
  }

  Process() {
    super.Process();
    const accumulation = this.m_runningAccumulation;
    if (!accumulation) return;
    const elapsed = performance.now() - this.m_accumulationStart;
    const steps = accumulation.steps;
    const last = steps[steps.length - 1];
    if (!last || elapsed >= last.endTimeSinceStartMs) {
      this.FinishAccumulation(false);
      return;
    }
    const step = steps.find(item => elapsed >= item.beginTimeSinceStartMs && elapsed < item.endTimeSinceStartMs);
    if (step) this.m_currentValue = step.value;
  }
}
