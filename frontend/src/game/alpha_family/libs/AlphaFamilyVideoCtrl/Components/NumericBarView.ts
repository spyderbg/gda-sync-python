// Egt::Game::AlphaFamily::NumericBarView (AlphaFamilyVideoCtrl/Components/NumericBarView.h): a bar that shows a value
// and counts to new values by an accumulation, timed by its stopwatch on the game Clock: it posts animatingDone with the
// value when it gets there, or at once when it is there already, and animatingInstantDone for an instant one.

import type { int64_t } from '@game/engine/GameCore/Common/Types';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import type { Runtime, InterfaceToken } from '@game/engine/GameCore/RuntimeAccess';
import { Accumulation } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl';
import { type AccumulationDescriptor, AccumulationType } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl.data';
import type { INumericBarView, INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { BaseView } from '../BaseView';

export abstract class NumericBarView<T, E extends INumericBarViewEvents> extends BaseView implements INumericBarView {
  protected m_visible = true;
  protected m_skin = 'default';

  protected m_accumulation: AccumulationDescriptor = { type: AccumulationType.eInstantly, initialValue: 0, targetValue: 0, steps: [] };
  protected readonly m_stopwatch = new Stopwatch();
  protected m_currentValue: int64_t = 0;
  protected m_currentValueChanged = false;

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

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    this.m_visible = visible;
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
    this.m_skin = skin;
  }

  Process() {
    super.Process();

    if (this.m_currentValueChanged) {
      const ms = Math.trunc(this.m_stopwatch.Measure());

      this.m_currentValue = Accumulation.GetCurrentValue(this.m_accumulation, ms);

      const steps = this.m_accumulation.steps;
      const isComplete = steps.length === 0 || ms >= steps[steps.length - 1].endTimeSinceStartMs;

      if (isComplete) {
        this.m_currentValue = this.m_accumulation.targetValue;
        this.m_currentValueChanged = false;

        this.m_events.animatingDone.Post(this.m_accumulation.targetValue);
      }
    }
  }

  // INumericBarView

  SetAccumulation(accumulation: AccumulationDescriptor) {
    this.m_accumulation = accumulation;

    this.m_stopwatch.Reset();

    this.m_currentValueChanged = true;

    if (this.m_accumulation.type === AccumulationType.eInstantly) {
      this.m_currentValue = this.m_accumulation.targetValue;

      this.m_currentValueChanged = false;
      this.m_events.animatingInstantDone.Post(this.m_accumulation.targetValue);
    } else if (this.m_currentValue === this.m_accumulation.targetValue) {
      this.m_currentValueChanged = false;

      this.m_events.animatingDone.Post(this.m_accumulation.targetValue);
    }
  }

  SetValue(value: int64_t) {
    if (value === this.m_currentValue) return;

    const startValue = this.m_currentValue;
    const accumulation = Accumulation.CreateGeometryAccumulationByFactor(startValue, value, 8, 20);
    this.SetAccumulation(accumulation);
  }

  SetValueNow(value: int64_t) {
    const accumulation: AccumulationDescriptor = { type: AccumulationType.eInstantly, initialValue: value, targetValue: value, steps: [] };
    this.SetAccumulation(accumulation);
  }

  FastForward() {
    this.SetValueNow(this.m_accumulation.targetValue);
  }

  AddValue(amount: int64_t) {
    if (amount === 0) return;
    this.SetValue(this.m_accumulation.targetValue + amount);
  }

  PlayBarAudioState(_audioStateName: string) {}

  AddValueWithGeometricAccumulation(value: int64_t) {
    if (value === 0) return;

    const target = this.m_currentValue + value;

    const accumulation = Accumulation.CreateGeometryAccumulationByFactor(this.m_currentValue, target, 8, 220);
    this.SetAccumulation(accumulation);
  }

  AddValueWithSteppedAccumulation(value: int64_t) {
    if (value === 0) return;

    const target = this.m_currentValue + value;

    const accumulation = Accumulation.CreateLinearAccumulationByDuration(this.m_currentValue, target, 4, 480);
    this.SetAccumulation(accumulation);
  }

  IsCurrentlyAccumulating() {
    return this.m_currentValueChanged;
  }
}
