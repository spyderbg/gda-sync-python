// Egt::Game::AlphaFamily::CreditsWinBarView (NordicTaleView/Views/CreditsWinBarView.h/.cpp): the win of
// the match, labelled WIN, or WINNER PAID once it is paid; a changed win plays the take win sound.

import { type Runtime, RuntimeToken } from '@game/engine/GameCore/RuntimeAccess';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import { type int, type int64_t, static_cast } from '@game/engine/GameCore/Common/Types';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EWinBarState, type ICreditsWinBarView, ICreditsWinBarView as ICreditsWinBarViewToken } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { AccumulationType, type AccumulationDescriptor } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl.data';
import { NumericBarView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView';

const CreditsWinBarViewId = 'CreditsWinBarView';

const ImageWinLabelId = 'image_win_label';
const TextWinAmountId = 'text_win_amount';

const AudioEventTakeWinId = 'SOUND_TAKE_WIN';

export class CreditsWinBarView extends NumericBarView<ICreditsWinBarView, INumericBarViewEvents> implements ICreditsWinBarView {
  private m_labelState = EWinBarState.Win;

  constructor() {
    super(CreditsWinBarViewId, ICreditsWinBarViewToken, new INumericBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(CreditsWinBarViewId, () => {
      this.OnElementsListLoaded();
    });

    this.RuntimeAdd(CreditsWinBarViewToken, this);
    this.SetLabelState(EWinBarState.Win);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.m_visible) return;

    this.AdjustWinValueChanged();
    super.Draw(drawList);
  }

  AddWinResult(summary: PayoutSummary) {
    const value = summary.rewards.Get(Currency.Credits);
    this.AddValueWithGeometricAccumulation(value);
  }

  SetLabelState(state: EWinBarState) {
    if (this.m_labelState === state) return;
    this.m_labelState = state;
    this.AdjustWinState();
  }

  SetAccumulation(accumulation: AccumulationDescriptor) {
    const playTakeWin =
      accumulation.targetValue < this.m_currentValue && accumulation.type !== AccumulationType.eInstantly;

    super.SetAccumulation(accumulation);

    if (playTakeWin) {
      this.PlayBarAudioState('AccumulateTakeWin');
    }
  }

  SetValue(value: int64_t) {
    const newNonZeroVal = (this.m_currentValue !== value) && (this.m_currentValue !== 0);
    super.SetValue(value);
    this.PlayBarAudioState(newNonZeroVal ? 'SetNewValue' : 'SetValue');
  }

  SetValueNow(value: int64_t) {
    const newNonZeroVal = (this.m_currentValue !== value) && (this.m_currentValue !== 0);
    super.SetValueNow(value);
    this.PlayBarAudioState(newNonZeroVal ? 'SetNewValueNow' : 'SetValueNow');
  }

  PlayBarAudioState(audioStateName: string) {
    super.PlayBarAudioState(audioStateName);

    if (audioStateName === 'AccumulateTakeWin' || audioStateName === 'SetNewValue') {
      this.RuntimeGet(IAudioApi).Play(AudioEventTakeWinId);
    }
  }

  private OnElementsListLoaded() { // delayed init of the elements' list
    this.AdjustWinState();
    this.AdjustWinValueChanged();
  }

  private AdjustWinValueChanged() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const formattedValue = this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue);

    const textAmount = this.m_elementsList.Get(TextWinAmountId, TextElement);

    textAmount.SetText(formattedValue);
  }

  private AdjustWinState() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const imageWinLabel = this.m_elementsList.Get(ImageWinLabelId, ImageElement);
    imageWinLabel.SetSelectedImage(static_cast<int>(this.m_labelState));
  }

  AddWinResultFast(summary: PayoutSummary) {
    const value = summary.rewards.Get(Currency.Credits);
    this.SetValueFast(value);
  }

  private SetValueFast(value: int64_t) {
    const newNonZeroVal = (this.m_currentValue !== value) && (this.m_currentValue !== 0);
    this.AddValueWithSteppedAccumulation(value);
    this.PlayBarAudioState(newNonZeroVal ? 'SetNewValue' : 'SetValue');
  }
}

/** The view itself, which the lines view asks whether it is accumulating (C++'s RuntimeAdd<CreditsWinBarView>(this)).
 * @cppName CreditsWinBarView */
export const CreditsWinBarViewToken = new RuntimeToken<CreditsWinBarView>('CreditsWinBarView');
