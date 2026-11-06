// Egt::Game::AlphaFamily::HoldAndSpinBarView (NordicRushView/Views/HoldAndSpinBarView.h/.cpp): the hold and spin round's
// spins remaining (its energy over the bet). It fades in when the feature starts, plays a transition when the count
// goes up (valueAnimDone when it ends), shows "Spins Completed" (animated or not) until the feature ends, and hides.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, assert, Unless } from '@game/engine/GameCore/Common/Defensive';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { FadeIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import {
  type IHoldAndSpinBarView, IHoldAndSpinBarView as IHoldAndSpinBarViewToken, IHoldAndSpinBarViewEvents,
} from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView';

const HoldAndSpinBarViewId = 'HoldAndSpinBarView';

const AnimFrameId = 'anim_frame';
const AnimValueTransitionId = 'anim_value_transition';
const ImageSpinsId = 'image_spins';
const ImageSpinId = 'image_spin';
const ImageRemainingId = 'image_remaining';
const ImageRemainingPluralId = 'image_remaining_plural';
const ImageSpinsCompletedId = 'image_spins_completed';
const TextSpinsId = 'text_spins';
const AnimCompletedId = 'anim_completed';
const AnimWinId = 'anim_win';

const ElementsAllIds = [
  AnimFrameId,
  AnimValueTransitionId,
  ImageSpinsId,
  ImageSpinId,
  ImageRemainingId,
  ImageRemainingPluralId,
  ImageSpinsCompletedId,
  TextSpinsId,
  AnimCompletedId,
  AnimWinId,
];

const ElementsRemainingIds = [
  ImageSpinsId,
  ImageSpinId,
  ImageRemainingId,
  ImageRemainingPluralId,
  TextSpinsId,
];

const FadeInDuration: tweeny.duration_t = 250;
const ValueIncreasedPause: tweeny.duration_t = 300;
// ANIM_HS_COMPLETED_ANIM covers the whole label on frame Spins_Remaining_Spins_Complete_Saber_114,
// index 6 of frames 108-116 at 42 ms per frame
const CompletedTextSwapDelay: tweeny.duration_t = 6 * 42;
// ANIM_HS_VALUE_TRANSITION_ANIM swaps the counter on frame anim_value_transition_157,
// index 6 of frames 151-161 at 42 ms per frame
const ValueTextSwapDelay: tweeny.duration_t = 6 * 42;

enum ESubstate {
  Invisible,
  IntroShowingBackground,
  IncreasingValue,
  ValueVisible,
  ShowingCompleted,
  CompletedVisible,
  OutroHidingBackground,
}

export class HoldAndSpinBarView extends NumericBarView<IHoldAndSpinBarView, IHoldAndSpinBarViewEvents> implements IHoldAndSpinBarView {
  private m_oldState = ESubstate.Invisible;
  private m_state = ESubstate.Invisible;
  private m_shownValue = 0;
  private m_bet = 0;

  private m_actionShow = new tweeny.tween_action();
  private m_actionValueIncreased = new tweeny.tween_action();
  private m_actionCompleted = new tweeny.tween_action();

  constructor() {
    super(HoldAndSpinBarViewId, IHoldAndSpinBarViewToken, new IHoldAndSpinBarViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.InitElementsList(HoldAndSpinBarViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionShow);
    tweeny.stop(this.m_actionValueIncreased);
    tweeny.stop(this.m_actionCompleted);

    this.DeinitElementsList();

    super.Deinit();
  }

  // IWinBarViewWithShow
  ShowRemainder(visible: boolean) {
    if (!visible) return;
    if (Unless(this.m_elementsList.IsLoaded())) return;
    if (Unless(this.m_state === ESubstate.ValueVisible || this.m_state === ESubstate.IncreasingValue)) return;

    this.m_shownValue = this.GetValue();
    this.AdjustValueText();
  }

  // NumericBarView
  SetValueNow(value: number) {
    super.SetValueNow(value);
    this.AdjustValue();
  }

  AddWinResult(summary: PayoutSummary) {
    const holdAndSpinEnergyReward = summary.rewards.Get(Currency.HoldAndSpinEnergy);

    this.SetValueNow(this.m_accumulation.targetValue + holdAndSpinEnergyReward);
  }

  // IHoldAndSpinBarView
  SetBet(bet: number) {
    this.m_bet = bet;
  }

  SetFeatureStarted(featureStarted: boolean) {
    if (!featureStarted) {
      if (this.m_state === ESubstate.Invisible) return;
      this.SetSubstate(ESubstate.Invisible);
      return;
    }

    if (this.m_state === ESubstate.Invisible) {
      this.m_shownValue = this.GetValue();
      this.SetSubstate(ESubstate.IntroShowingBackground);
      return;
    }

    if (!this.IsInSubstateCompleted()) return;

    this.SetSubstate(ESubstate.ValueVisible);
  }

  IsValueAnimating() {
    return this.m_state === ESubstate.IncreasingValue && tweeny.is_running(this.m_actionValueIncreased);
  }

  ShowCompleted(animate: boolean) {
    if (this.IsInSubstateCompleted()) return;

    if (!this.m_elementsList.IsLoaded()) return;
    if (this.m_state === ESubstate.Invisible) return;

    this.StopValueIncreasedAnim(false);

    if (animate) {
      this.SetSubstate(ESubstate.ShowingCompleted);
    } else {
      this.SetSubstate(ESubstate.CompletedVisible);
    }
  }

  private GetValue() {
    return Math.trunc(this.m_accumulation.targetValue / (this.m_bet > 0 ? this.m_bet : 1));
  }

  private IsInSubstateCompleted() {
    return this.m_state === ESubstate.ShowingCompleted || this.m_state === ESubstate.CompletedVisible;
  }

  private SetSubstate(substate: ESubstate) {
    const same: boolean = this.m_state === substate;
    if (same && substate !== ESubstate.IncreasingValue) return;

    if (!same) {
      this.m_oldState = this.m_state;
      this.m_state = substate;
    }
    this.AdjustSubstate();
  }

  private AdjustSubstate() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    switch (this.m_state) {
      case ESubstate.Invisible:
        {
          this.m_visible = false;

          tweeny.stop(this.m_actionShow);
          this.StopValueIncreasedAnim(false);
          tweeny.stop(this.m_actionCompleted);

          this.m_elementsList.Get(AnimCompletedId, AnimElement).Stop();
          this.m_elementsList.SetHidden(true, ElementsAllIds);
        }
        break;
      case ESubstate.IntroShowingBackground:
        {
          this.m_visible = true;
          tweeny.start(this.m_actionShow, 'HoldAndSpinBarView:Show');
        }
        break;
      case ESubstate.ValueVisible:
        {
          this.m_visible = true;
          this.m_elementsList.Get(AnimValueTransitionId, AnimElement).SetHidden(true);
          this.m_elementsList.Get(AnimCompletedId, AnimElement).SetHidden(true);
          this.m_elementsList.SetHidden(false, ElementsRemainingIds);
          this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(true);
          this.AdjustValueText();
        }
        break;
      case ESubstate.IncreasingValue:
        {
          this.m_visible = true;
          this.StopValueIncreasedAnim(false);
          tweeny.start(this.m_actionValueIncreased, 'HoldAndSpinBarView:ValueIncreased');
        }
        break;
      case ESubstate.ShowingCompleted:
        {
          this.m_visible = true;
          tweeny.start(this.m_actionCompleted, 'HoldAndSpinBarView:Completed');
        }
        break;
      case ESubstate.CompletedVisible:
        {
          this.m_visible = true;
          this.AdjustCompletedText();
        }
        break;
      case ESubstate.OutroHidingBackground:
        {
          this.SetSubstate(ESubstate.Invisible);
        }
        break;
      default: assert(false); break;
    }
  }

  private OnElementsListLoaded() {
    // hide all by default
    this.m_elementsList.SetHidden(true, ElementsAllIds);

    // init tweeny action show
    {
      this.m_actionShow = tweeny.together(
        FadeIn(this.m_elementsList.Find(AnimFrameId, AnimElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(ImageSpinsId, ImageElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(ImageSpinId, ImageElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(ImageRemainingId, ImageElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(ImageRemainingPluralId, ImageElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(ImageSpinsCompletedId, ImageElement), FadeInDuration),
        FadeIn(this.m_elementsList.Find(TextSpinsId, TextElement), FadeInDuration));
      this.m_actionShow.on_begin.connect(() => {
        this.m_elementsList.Get(AnimFrameId, AnimElement).SetHidden(false);
        this.m_elementsList.Get(AnimValueTransitionId, AnimElement).SetHidden(true);
        this.m_elementsList.Get(AnimCompletedId, AnimElement).SetHidden(true);
        if (this.IsInSubstateCompleted()) {
          this.AdjustCompletedText();
        } else {
          this.m_elementsList.SetHidden(false, ElementsRemainingIds);
          this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(true);

          this.m_shownValue = this.GetValue();
          this.AdjustValueText();
        }
      });
      this.m_actionShow.on_end.connect(() => {
        if (this.m_state !== ESubstate.IntroShowingBackground) return;

        if (this.IsInSubstateCompleted()) {
          this.SetSubstate(ESubstate.CompletedVisible);
        } else {
          this.SetSubstate(ESubstate.ValueVisible);
        }
      });
    }

    // init tweeny action value increased
    {
      const animTransitionDuration: tweeny.duration_t =
        Math.trunc(this.m_elementsList.Get(AnimValueTransitionId, AnimElement).GetDuration() + 0.5);
      const animDuration = animTransitionDuration + ValueIncreasedPause;

      const actionSwapValues = tweeny.delay(ValueTextSwapDelay);
      actionSwapValues.on_end.connect(() => {
        this.m_shownValue = this.GetValue();
        this.AdjustValueText();
      });

      const actionAnimTransition = tweeny.delay(animTransitionDuration);
      actionAnimTransition.on_begin.connect(() => {
        const animValueTransition = this.m_elementsList.Get(AnimValueTransitionId, AnimElement);
        animValueTransition.Rewind();
        animValueTransition.Play();
        animValueTransition.SetHidden(false);
      });
      actionAnimTransition.on_end.connect(() => {
        const animValueTransition = this.m_elementsList.Get(AnimValueTransitionId, AnimElement);
        animValueTransition.SetHidden(true);
        animValueTransition.Stop();
        animValueTransition.Rewind();
      });

      const actionFullAnimationWait = tweeny.delay(animDuration);
      actionFullAnimationWait.on_end.connect(() => {
        if (this.m_state === ESubstate.IncreasingValue) {
          this.SetSubstate(ESubstate.ValueVisible);
        }
        this.m_events.valueAnimDone.Post();
      });

      this.m_actionValueIncreased = tweeny.together(actionSwapValues, actionAnimTransition, actionFullAnimationWait);
    }

    // init tweeny action completed
    {
      const animDuration: tweeny.duration_t = Math.trunc(this.m_elementsList.Get(AnimCompletedId, AnimElement).GetDuration() + 0.5);
      const afterSwapDuration = Math.max(animDuration - CompletedTextSwapDelay, 0);

      const actionUntilSwap = tweeny.delay(CompletedTextSwapDelay);
      actionUntilSwap.on_begin.connect(() => {
        const animCompleted = this.m_elementsList.Get(AnimCompletedId, AnimElement);
        animCompleted.Rewind();
        animCompleted.Play();
        animCompleted.SetHidden(false);
      });
      actionUntilSwap.on_end.connect(() => {
        this.AdjustCompletedText();
      });

      const actionAfterSwap = tweeny.delay(afterSwapDuration);
      actionAfterSwap.on_end.connect(() => {
        const animCompleted = this.m_elementsList.Get(AnimCompletedId, AnimElement);
        animCompleted.SetHidden(true);
        animCompleted.Stop();

        if (this.m_state === ESubstate.ShowingCompleted) {
          this.SetSubstate(ESubstate.CompletedVisible);
        }
      });

      this.m_actionCompleted = tweeny.sequence([actionUntilSwap, actionAfterSwap]);
    }

    this.AdjustValue();
    this.AdjustSubstate();
  }

  private AdjustValue() {
    if (!this.m_elementsList.IsLoaded()) return;

    const value = this.GetValue();

    if (this.m_state === ESubstate.Invisible || this.IsInSubstateCompleted()) {
      this.m_shownValue = value;
      return;
    }

    if (this.m_state === ESubstate.IntroShowingBackground || this.m_state === ESubstate.ShowingCompleted) {
      this.m_shownValue = value;
      return;
    }

    if (value > this.m_shownValue) {
      this.SetSubstate(ESubstate.IncreasingValue);
      return;
    }

    this.StopValueIncreasedAnim(false);

    if (value !== this.m_shownValue) {
      this.m_shownValue = value;
    }

    if (this.m_state === ESubstate.IncreasingValue) {
      this.SetSubstate(ESubstate.ValueVisible);
    } else {
      this.AdjustValueText();
    }
  }

  private StopValueIncreasedAnim(notifyDoneIfInterrupted: boolean) {
    const wasAnimating = tweeny.is_running(this.m_actionValueIncreased);

    tweeny.stop(this.m_actionValueIncreased);

    if (!this.m_elementsList.IsLoaded()) return;

    const animValueTransition = this.m_elementsList.Get(AnimValueTransitionId, AnimElement);
    animValueTransition.SetHidden(true);
    animValueTransition.Stop();
    animValueTransition.Rewind();

    if (notifyDoneIfInterrupted && wasAnimating) {
      this.m_events.valueAnimDone.Post();
    }
  }

  private AdjustValueText() {
    this.m_elementsList.Get(TextSpinsId, TextElement).SetText(String(this.m_shownValue));
    this.m_elementsList.Get(ImageSpinsId, ImageElement).SetHidden(this.m_shownValue === 1);
    this.m_elementsList.Get(ImageSpinId, ImageElement).SetHidden(this.m_shownValue !== 1);
    this.m_elementsList.Get(ImageRemainingId, ImageElement).SetHidden(this.m_shownValue !== 1);
    this.m_elementsList.Get(ImageRemainingPluralId, ImageElement).SetHidden(this.m_shownValue === 1);
  }

  private AdjustCompletedText() {
    this.m_elementsList.SetHidden(true, ElementsRemainingIds);
    this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(false);
  }
}
