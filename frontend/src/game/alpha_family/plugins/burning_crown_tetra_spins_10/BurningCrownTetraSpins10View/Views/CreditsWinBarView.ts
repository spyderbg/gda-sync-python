// Egt::Game::AlphaFamily::CreditsWinBarView (BurningCrownTetraSpins10View/Views/CreditsWinBarView.h/.cpp): the win of
// the match, labelled WIN, or WINNER PAID once it is paid.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
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
import { PanelLayout } from '../PanelLayout';
import { GameBackgroundViewToken } from './GameBackgroundView';

const CreditsWinBarViewId = 'CreditsWinBarView';
const ImageWinLabelId = 'image_win_label';
const TextWinAmountId = 'text_win_amount';
const AudioEventTakeWinId = 'SOUND_TAKE_WIN';

export class CreditsWinBarView extends NumericBarView<ICreditsWinBarView, INumericBarViewEvents> implements ICreditsWinBarView {
  private m_labelState = EWinBarState.Win;
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);

  constructor() {
    super(CreditsWinBarViewId, ICreditsWinBarViewToken, new INumericBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(CreditsWinBarViewId, () => this.ApplyPanelLayout());
    this.SetLabelState(EWinBarState.Win);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_panelLayout.Update(this.RuntimeTryGetConst(GameBackgroundViewToken)) && this.m_elementsList.IsLoaded()) {
      this.ApplyPanelLayout();
    }
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

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
    this.AdjustWinState();
  }

  private AdjustWinValueChanged() {
    this.m_elementsList.TryGet(this.m_panelLayout.ElementId(TextWinAmountId), TextElement)?.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue));
  }

  private AdjustWinState() {
    this.m_elementsList.TryGet(this.m_panelLayout.ElementId(ImageWinLabelId), ImageElement)?.SetSelectedImage(this.m_labelState);
  }
}
