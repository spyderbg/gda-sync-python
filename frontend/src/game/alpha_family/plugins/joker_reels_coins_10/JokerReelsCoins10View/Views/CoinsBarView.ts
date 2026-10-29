// Egt::Game::AlphaFamily::CoinsBarView (JokerReelsCoins10View/Views/CoinsBarView.h/.cpp): the match's coins, which move
// between their minimized and maximized places (their _min and _max placeholders) in 132 ms, and grow with the coins a
// round wins.

import { type Runtime, RuntimeToken } from '@game/engine/GameCore/RuntimeAccess';
import { RuntimeCategory } from '@game/engine/Game/RuntimeCategory';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { PlaceholderFromTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import {
  ICoinsBarView, ICoinsBarViewEvents, type ICoinsWinBarView, ICoinsWinBarView as ICoinsWinBarViewToken,
} from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';

const AnimDurationSeconds = 132; // 4s * 0.033f;

const CoinsBarViewId = 'CoinsBarView';

const TextAmountId = 'text_amount';
const TextAmountMinId = 'text_amount_min';
const TextAmountMaxId = 'text_amount_max';

const ImageLabelId = 'image_label';
const ImageLabelMinId = 'image_label_min';
const ImageLabelMaxId = 'image_label_max';

enum EAnimationState {
  Undefined = 0,
  Minimized,
  Minimizing,
  Maximized,
  Maximizing,
}

export class CoinsBarView extends NumericBarView<ICoinsWinBarView, INumericBarViewEvents> implements ICoinsBarView, ICoinsWinBarView {
  static readonly RuntimeCategory = RuntimeCategory.GameView;

  private readonly m_eventsBar = new ICoinsBarViewEvents();

  private m_animState = EAnimationState.Undefined;

  private m_actionMinimize = new tweeny.tween_action();
  private m_actionMaximize = new tweeny.tween_action();

  constructor() {
    super(CoinsBarViewId, ICoinsWinBarViewToken, new INumericBarViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(CoinsBarViewToken, this);

    this.RuntimeAdd(ICoinsBarView, this);
    this.RuntimeAdd(ICoinsBarView.Events, this.m_eventsBar);

    this.InitElementsList(CoinsBarViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    this.DeinitAnimations();
    this.DeinitElementsList();

    this.RuntimeRemove(CoinsBarViewToken);
    this.RuntimeRemove(ICoinsBarView);
    this.RuntimeRemove(ICoinsBarView.Events);

    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.m_visible) return;

    this.AdjustTextAmount();

    super.Draw(drawList);
  }

  Process() {
    if (!this.m_control.m_enabled) return;

    super.Process();
  }

  // ICoinsBarView
  Minimize(instant: boolean) {
    if (this.m_animState === EAnimationState.Minimized) return;
    if (this.m_animState === EAnimationState.Minimizing && instant === false) return;

    tweeny.stop_and_finish(this.m_actionMinimize);
    tweeny.stop_and_finish(this.m_actionMaximize);

    if (instant) {
      const textAmount = this.m_elementsList.Find(TextAmountId, TextElement);
      if (textAmount !== null) {
        const amountTextMin = this.m_elementsList.Find(TextAmountMinId, TextElement);
        textAmount.SetFromDummy(amountTextMin);
      }
      const labelImage = this.m_elementsList.Find(ImageLabelId, ImageElement);
      if (labelImage !== null) {
        const labelImageMin = this.m_elementsList.Find(ImageLabelMinId, ImageElement);
        labelImage.SetFromDummy(labelImageMin);
      }

      this.m_animState = EAnimationState.Minimized;
      this.m_eventsBar.minimized.Post();
    } else {
      this.m_animState = EAnimationState.Minimizing;
      tweeny.start(this.m_actionMinimize, 'CoinsBarView:Minimize');
    }
  }

  Maximize(instant: boolean) {
    if (this.m_animState === EAnimationState.Maximized) return;
    if (this.m_animState === EAnimationState.Maximizing && instant === false) return;

    tweeny.stop_and_finish(this.m_actionMinimize);
    tweeny.stop_and_finish(this.m_actionMaximize);

    if (instant) {
      const textAmount = this.m_elementsList.Find(TextAmountId, TextElement);
      if (textAmount !== null) {
        const amountTextMax = this.m_elementsList.Find(TextAmountMaxId, TextElement);
        textAmount.SetFromDummy(amountTextMax);
      }
      const labelImage = this.m_elementsList.Find(ImageLabelId, ImageElement);
      if (labelImage !== null) {
        const labelImageMax = this.m_elementsList.Find(ImageLabelMaxId, ImageElement);
        labelImage.SetFromDummy(labelImageMax);
      }

      this.m_animState = EAnimationState.Maximized;
      this.m_eventsBar.maximized.Post();
    } else {
      this.m_animState = EAnimationState.Maximizing;
      tweeny.start(this.m_actionMaximize, 'CoinsBarView:Maximize');
    }
  }

  // ICoinsWinBarView
  AddWinResult(summary: PayoutSummary) {
    const value = summary.rewards.Get(Currency.CoinsSpinEnergy);
    this.AddValueWithGeometricAccumulation(value);

    if (value === 0) return;
    this.Maximize(false);
  }

  SetValueNow(value: number) {
    super.SetValueNow(value);
  }

  SetValue(value: number) {
    super.SetValue(value);
  }

  ////////////////////////////////////////////////////////////////////////////////

  private OnElementsListLoaded() {
    this.InitAnimations();
  }

  private InitAnimations() {
    const textAmount = this.m_elementsList.Find(TextAmountId, TextElement);
    const amountTextMin = this.m_elementsList.Find(TextAmountMinId, TextElement);
    const amountTextMax = this.m_elementsList.Find(TextAmountMaxId, TextElement);
    if (AssertUnless(textAmount !== null && amountTextMin !== null && amountTextMax !== null)) return;

    const labelImage = this.m_elementsList.Find(ImageLabelId, ImageElement);
    const labelImageMin = this.m_elementsList.Find(ImageLabelMinId, ImageElement);
    const labelImageMax = this.m_elementsList.Find(ImageLabelMaxId, ImageElement);
    if (AssertUnless(labelImage !== null && labelImageMin !== null && labelImageMax !== null)) return;

    this.m_actionMinimize = tweeny.together(
      PlaceholderFromTo(textAmount!, amountTextMax!, amountTextMin!, AnimDurationSeconds),
      PlaceholderFromTo(labelImage!, labelImageMax!, labelImageMin!, AnimDurationSeconds));

    this.m_actionMinimize.on_end.connect(() => {
      this.m_animState = EAnimationState.Minimized;
      this.m_eventsBar.minimized.Post();
    });

    this.m_actionMaximize = tweeny.together(
      PlaceholderFromTo(textAmount!, amountTextMin!, amountTextMax!, AnimDurationSeconds),
      PlaceholderFromTo(labelImage!, labelImageMin!, labelImageMax!, AnimDurationSeconds));

    this.m_actionMaximize.on_end.connect(() => {
      this.m_animState = EAnimationState.Maximized;
      this.m_eventsBar.maximized.Post();
    });

    switch (this.m_animState) {
      case EAnimationState.Undefined: break;
      case EAnimationState.Minimized:
      case EAnimationState.Minimizing:
        this.m_animState = EAnimationState.Undefined;
        this.Minimize(true);
        break;
      case EAnimationState.Maximized:
      case EAnimationState.Maximizing:
        this.m_animState = EAnimationState.Undefined;
        this.Maximize(true);
        break;
    }
  }

  private DeinitAnimations() {
    tweeny.stop_and_finish(this.m_actionMinimize);
    tweeny.stop_and_finish(this.m_actionMaximize);
  }

  private AdjustTextAmount() {
    const textAmount = this.m_elementsList.Find(TextAmountId, TextElement);
    if (Unless(textAmount)) return;

    const formattedValue = this.RuntimeGetConst(ILocalization).FormatCoins(this.m_currentValue);

    textAmount!.SetText(formattedValue);
  }
}

/** The view itself, which the lines view asks whether it is accumulating (C++'s RuntimeAdd<CoinsBarView>(this)).
 * @cppName CoinsBarView */
export const CoinsBarViewToken = new RuntimeToken<CoinsBarView>('CoinsBarView');
