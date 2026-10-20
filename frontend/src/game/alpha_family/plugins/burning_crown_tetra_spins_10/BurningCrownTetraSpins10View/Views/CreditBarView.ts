// Egt::Game::AlphaFamily::CreditBarView (BurningCrownTetraSpins10View/Views/CreditBarView.h/.cpp): the player's
// credit, which moves between its minimized and maximized places (its _min and _max placeholders) in 132 ms, and which a
// cabinet's hide and show credit buttons hide and show.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { ILocalization } from '../../../../../engine/Game/RuntimeImport/ILocalization';
import { Together, type TweenAction } from '../../../../../engine/GameCore/Tools/Tweeny';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import { BaseElement } from '../../../../../engine/GameVideoCtrl/ViewElements/BaseElement';
import { ButtonElement } from '../../../../../engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ImageElement } from '../../../../../engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '../../../../../engine/GameVideoCtrl/ViewElements/TextElement';
import { PlaceholderFromTo } from '../../../../../engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { type ICreditBarView, ICreditBarView as ICreditBarViewToken, ICreditBarViewEvents } from '../../../../libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/NumericBarView';

const AnimDurationSeconds = 132; // 4s * 0.033f;
const CreditBarViewId = 'CreditBarView';
const TextAmountId = 'text_amount';
const TextAmountMinId = 'text_amount_min';
const TextAmountMaxId = 'text_amount_max';
const ImageLabelId = 'image_label';
const ImageLabelMinId = 'image_label_min';
const ImageLabelMaxId = 'image_label_max';
const ButtonHideCreditsId = 'button_hide_credits';
const ButtonShowCreditsId = 'button_show_credits';

enum EAnimationState {
  Undefined,
  Minimizing,
  Minimized,
  Maximizing,
  Maximized,
}

export class CreditBarView extends NumericBarView<ICreditBarView, ICreditBarViewEvents> implements ICreditBarView {
  private m_animState = EAnimationState.Undefined;
  private m_actionMinimize: TweenAction | null = null;
  private m_actionMaximize: TweenAction | null = null;
  private m_showingCredits = true;

  constructor() {
    super(CreditBarViewId, ICreditBarViewToken, new ICreditBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(CreditBarViewId, () => this.OnElementsListLoaded());
    return true;
  }

  Deinit() {
    this.m_actionMinimize?.Stop();
    this.m_actionMaximize?.Stop();
    this.DeinitElementsList();
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
    this.m_actionMinimize?.Process();
    this.m_actionMaximize?.Process();
  }

  Minimize(instant: boolean) {
    if (this.m_animState === EAnimationState.Minimized) return;
    if (this.m_animState === EAnimationState.Minimizing && !instant) return;
    this.m_actionMinimize?.StopAndFinish();
    this.m_actionMaximize?.StopAndFinish();
    if (instant) {
      this.m_elementsList.Find(TextAmountId, TextElement)?.SetFromDummy(this.m_elementsList.Find(TextAmountMinId, TextElement));
      this.m_elementsList.Find(ImageLabelId, ImageElement)?.SetFromDummy(this.m_elementsList.Find(ImageLabelMinId, ImageElement));
      this.m_animState = EAnimationState.Minimized;
      this.m_events.minimized.Post();
    } else {
      this.m_animState = EAnimationState.Minimizing;
      this.m_actionMinimize?.Start();
    }
  }

  Maximize(instant: boolean) {
    if (this.m_animState === EAnimationState.Maximized) return;
    if (this.m_animState === EAnimationState.Maximizing && !instant) return;
    this.m_actionMinimize?.StopAndFinish();
    this.m_actionMaximize?.StopAndFinish();
    if (instant) {
      this.m_elementsList.Find(TextAmountId, TextElement)?.SetFromDummy(this.m_elementsList.Find(TextAmountMaxId, TextElement));
      this.m_elementsList.Find(ImageLabelId, ImageElement)?.SetFromDummy(this.m_elementsList.Find(ImageLabelMaxId, ImageElement));
      this.m_animState = EAnimationState.Maximized;
      this.m_events.maximized.Post();
    } else {
      this.m_animState = EAnimationState.Maximizing;
      this.m_actionMaximize?.Start();
    }
  }

  private OnElementsListLoaded() {
    this.InitAnimations();
    this.AdjustButtons();
  }

  private InitAnimations() {
    const list = this.m_elementsList;
    const textAmount = list.Find(TextAmountId, TextElement);
    const amountTextMin = list.Find(TextAmountMinId, TextElement);
    const amountTextMax = list.Find(TextAmountMaxId, TextElement);
    const labelImage = list.Find(ImageLabelId, ImageElement);
    const labelImageMin = list.Find(ImageLabelMinId, ImageElement);
    const labelImageMax = list.Find(ImageLabelMaxId, ImageElement);
    if (!textAmount || !amountTextMin || !amountTextMax || !labelImage || !labelImageMin || !labelImageMax) return;

    this.m_actionMinimize = Together(
      PlaceholderFromTo(textAmount, amountTextMax, amountTextMin, AnimDurationSeconds),
      PlaceholderFromTo(labelImage, labelImageMax, labelImageMin, AnimDurationSeconds),
    );
    this.m_actionMinimize.OnEnd(() => {
      this.m_animState = EAnimationState.Minimized;
      this.m_events.minimized.Post();
    });
    this.m_actionMaximize = Together(
      PlaceholderFromTo(textAmount, amountTextMin, amountTextMax, AnimDurationSeconds),
      PlaceholderFromTo(labelImage, labelImageMin, labelImageMax, AnimDurationSeconds),
    );
    this.m_actionMaximize.OnEnd(() => {
      this.m_animState = EAnimationState.Maximized;
      this.m_events.maximized.Post();
    });

    switch (this.m_animState) {
      case EAnimationState.Undefined:
        break;
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

  private AdjustTextAmount() {
    const textAmount = this.m_elementsList.Find(TextAmountId, TextElement);
    if (!textAmount) return;
    textAmount.SetHidden(!this.m_showingCredits);
    textAmount.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue));
  }

  private AdjustButtons() {
    const hideCreditButton = this.m_elementsList.TryGet(ButtonHideCreditsId, ButtonElement);
    hideCreditButton?.SetHidden(!this.m_showingCredits);
    hideCreditButton?.SetEnabled(this.m_showingCredits);
    const showCreditButton = this.m_elementsList.TryGet(ButtonShowCreditsId, ButtonElement);
    showCreditButton?.SetHidden(this.m_showingCredits);
    showCreditButton?.SetEnabled(!this.m_showingCredits);
  }

  HandleTouchDown(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    const currentButton = this.m_elementsList.TryGet(this.m_showingCredits ? ButtonHideCreditsId : ButtonShowCreditsId, BaseElement);
    if (!currentButton) return false;
    const captured = currentButton.HandleTouchDown({ x, y });
    if (captured) {
      this.m_showingCredits = !this.m_showingCredits;
      this.AdjustTextAmount();
      this.AdjustButtons();
    }
    return captured;
  }
}
