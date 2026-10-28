// Egt::Game::AlphaFamily::HoldAndSpinBarView (NordicRushView/Views/HoldAndSpinBarView.h/.cpp): the hold and spin round's
// spins remaining (its energy over the bet), which fades in with the first spins, plays a transition at each change, and
// shows "spins completed" and fades out when none remain.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { FadeIn, FadeOut } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { type IHoldAndSpinBarView, IHoldAndSpinBarView as IHoldAndSpinBarViewToken } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
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
];

const FadeInDuration: tweeny.duration_t = 250;
const FadeOutDuration: tweeny.duration_t = 2000;

export class HoldAndSpinBarView extends NumericBarView<IHoldAndSpinBarView, INumericBarViewEvents> implements IHoldAndSpinBarView {
  protected m_remainderVisible = false;
  protected m_shownValue = 0;
  protected m_bet = 0;

  protected m_actionShow = new tweeny.tween_action();
  protected m_actionValueChanged = new tweeny.tween_action();
  protected m_actionHide = new tweeny.tween_action();

  constructor() {
    super(HoldAndSpinBarViewId, IHoldAndSpinBarViewToken, new INumericBarViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(HoldAndSpinBarViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionShow);
    tweeny.stop(this.m_actionValueChanged);
    tweeny.stop(this.m_actionHide);

    this.DeinitElementsList();

    super.Deinit();
  }

  // IWinBarViewWithShow
  ShowRemainder(visible: boolean) {
    this.m_remainderVisible = visible;
  }

  // NumericBarView
  SetValueNow(value: number) {
    super.SetValueNow(value);

    this.AdjustVisibilityAndAnims();
  }

  AddWinResult(summary: PayoutSummary) {
    const holdAndSpinEnergyReward = summary.rewards.Get(Currency.HoldAndSpinEnergy);

    this.SetValueNow(this.m_accumulation.targetValue + holdAndSpinEnergyReward);
  }

  // IHoldAndSpinBarView
  SetBet(bet: number) {
    this.m_bet = bet;
  }

  private GetValue() {
    return Math.trunc(this.m_accumulation.targetValue / (this.m_bet > 0 ? this.m_bet : 1));
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
        FadeIn(this.m_elementsList.Find(TextSpinsId, TextElement), FadeInDuration));
      this.m_actionShow.on_begin.connect(() => {
        const value = this.GetValue();
        this.m_elementsList.Get(AnimFrameId, AnimElement).SetHidden(false);
        this.m_elementsList.Get(AnimValueTransitionId, AnimElement).SetHidden(true);
        this.m_elementsList.Get(ImageSpinsId, ImageElement).SetHidden(value === 1);
        this.m_elementsList.Get(ImageSpinId, ImageElement).SetHidden(value !== 1);
        this.m_elementsList.Get(ImageRemainingId, ImageElement).SetHidden(value !== 1);
        this.m_elementsList.Get(ImageRemainingPluralId, ImageElement).SetHidden(value === 1);
        this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(TextSpinsId, TextElement).SetHidden(false);
        this.m_elementsList.Get(TextSpinsId, TextElement).SetText(String(value));
        this.m_elementsList.Get(AnimCompletedId, AnimElement).SetHidden(true);
      });
    }

    // init tweeny action value changed
    {
      this.m_actionValueChanged =
        tweeny.delay(Math.trunc(this.m_elementsList.Get(AnimValueTransitionId, AnimElement).GetDuration() + 0.5));
      this.m_actionValueChanged.on_begin.connect(() => {
        const animValueTransition = this.m_elementsList.Get(AnimValueTransitionId, AnimElement);
        animValueTransition.Rewind();
        animValueTransition.Play();
        animValueTransition.SetHidden(false);
        const value = this.GetValue();
        this.m_elementsList.Get(TextSpinsId, TextElement).SetText(String(value));
        this.m_elementsList.Get(ImageSpinsId, ImageElement).SetHidden(value === 1);
        this.m_elementsList.Get(ImageSpinId, ImageElement).SetHidden(value !== 1);
        this.m_elementsList.Get(ImageRemainingId, ImageElement).SetHidden(value !== 1);
        this.m_elementsList.Get(ImageRemainingPluralId, ImageElement).SetHidden(value === 1);
      });
      this.m_actionValueChanged.on_end.connect(() => {
        const animValueTransition = this.m_elementsList.Get(AnimValueTransitionId, AnimElement);
        animValueTransition.SetHidden(true);
        animValueTransition.Stop();
      });
    }

    // init tweeny action hide
    {
      const animDuration: tweeny.duration_t = Math.trunc(this.m_elementsList.Get(AnimCompletedId, AnimElement).GetDuration() + 0.5);
      const actions: tweeny.tween_action[] = [];
      actions.push(tweeny.delay(FadeOutDuration)); // wait "0 spins remaining"
      actions.push(tweeny.delay(animDuration)); // play part 1 of completed animation
      actions[actions.length - 1].on_begin.connect(() => {
        const animCompleted = this.m_elementsList.Get(AnimCompletedId, AnimElement);
        animCompleted.Rewind();
        animCompleted.Play();
        animCompleted.SetHidden(false);
      });
      actions[actions.length - 1].on_end.connect(() => {
        this.m_elementsList.Get(ImageRemainingId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageRemainingPluralId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageSpinsId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(TextSpinsId, TextElement).SetHidden(true);
      });
      actions.push(tweeny.delay(1)); // play part 2 of completed animation
      actions[actions.length - 1].on_begin.connect(() => {
        this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(false);
      });
      actions[actions.length - 1].on_end.connect(() => {
        const animCompleted = this.m_elementsList.Get(AnimCompletedId, AnimElement);
        animCompleted.SetHidden(true);
        animCompleted.Stop();
      });
      actions.push(tweeny.together( // wait "spins completed"
        FadeOut(this.m_elementsList.Find(AnimFrameId, AnimElement), FadeOutDuration),
        FadeOut(this.m_elementsList.Find(ImageSpinsId, ImageElement), FadeOutDuration),
        FadeOut(this.m_elementsList.Find(ImageSpinId, ImageElement), FadeOutDuration),
        FadeOut(this.m_elementsList.Find(ImageSpinsCompletedId, ImageElement), FadeOutDuration),
        FadeOut(this.m_elementsList.Find(TextSpinsId, TextElement), FadeOutDuration)));
      actions[actions.length - 1].on_end.connect(() => {
        this.m_elementsList.Get(AnimFrameId, AnimElement).SetHidden(true);
        this.m_elementsList.Get(AnimValueTransitionId, AnimElement).SetHidden(true);
        this.m_elementsList.Get(ImageSpinsId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageSpinId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageRemainingId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageRemainingPluralId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(ImageSpinsCompletedId, ImageElement).SetHidden(true);
        this.m_elementsList.Get(TextSpinsId, TextElement).SetHidden(true);
        this.m_elementsList.Get(AnimCompletedId, AnimElement).SetHidden(true);
      });
      this.m_actionHide = tweeny.sequence(actions);
    }

    // show current values
    this.AdjustVisibilityAndAnims();
  }

  private AdjustVisibilityAndAnims() {
    if (!this.m_elementsList.IsLoaded()) return;

    const value = this.GetValue();
    const prevVisible = this.m_shownValue > 0;
    const currVisible = value > 0;

    if (currVisible && !prevVisible) {
      // show bar
      this.m_visible = true;
      tweeny.stop_and_finish(this.m_actionHide);
      tweeny.start(this.m_actionShow, 'HoldAndSpinBarView:Show');
    } else if (!currVisible && prevVisible) {
      // hide bar
      this.m_visible = false;
      tweeny.stop_and_finish(this.m_actionShow);
      tweeny.start(this.m_actionHide, 'HoldAndSpinBarView:Hide');
    }

    if (value !== this.m_shownValue) {
      // play change
      tweeny.stop_and_finish(this.m_actionValueChanged);
      tweeny.start(this.m_actionValueChanged, 'HoldAndSpinBarView:ValueChanged');
    }

    this.m_shownValue = value;
  }
}
