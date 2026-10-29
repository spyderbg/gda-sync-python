// Egt::Game::AlphaFamily::CreditsWinBarView (JokerReelsCoins10View/Views/CreditsWinBarView.h/.cpp): the win of
// the match, labelled WIN, or WINNER PAID once it is paid.

import { type Runtime, RuntimeToken } from '@game/engine/GameCore/RuntimeAccess';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
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
    this.InitElementsList(CreditsWinBarViewId, () => this.AdjustWinState());

    this.RuntimeAdd(CreditsWinBarViewToken, this);
    this.SetLabelState(EWinBarState.Win);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(CreditsWinBarViewToken);
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.m_visible) return;
    this.AdjustWinValueChanged();
    super.Draw(drawList);
  }

  AddWinResult(summary: PayoutSummary) {
    this.AddValueWithGeometricAccumulation(summary.rewards.Get(Currency.Credits));
  }

  AddWinResultFast(summary: PayoutSummary) {
    this.AddValueWithSteppedAccumulation(summary.rewards.Get(Currency.Credits));
  }

  SetLabelState(state: EWinBarState) {
    if (this.m_labelState === state) return;
    this.m_labelState = state;
    this.AdjustWinState();
  }

  SetAccumulation(accumulation: AccumulationDescriptor) {
    const playTakeWin = accumulation.targetValue < this.m_currentValue && accumulation.type !== AccumulationType.eInstantly;
    super.SetAccumulation(accumulation);
    if (playTakeWin) this.RuntimeGet(IAudioApi).Play(AudioEventTakeWinId);
  }

  private AdjustWinValueChanged() {
    this.m_elementsList.TryGet(TextWinAmountId, TextElement)?.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue));
  }

  private AdjustWinState() {
    this.m_elementsList.TryGet(ImageWinLabelId, ImageElement)?.SetSelectedImage(this.m_labelState);
  }
}

/** The view itself, which the lines view asks whether it is accumulating (C++'s RuntimeAdd<CreditsWinBarView>(this)).
 * @cppName CreditsWinBarView */
export const CreditsWinBarViewToken = new RuntimeToken<CreditsWinBarView>('CreditsWinBarView');
