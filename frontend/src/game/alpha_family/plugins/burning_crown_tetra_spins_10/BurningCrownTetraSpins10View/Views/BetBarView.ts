// Egt::Game::AlphaFamily::BetBarView (BurningCrownTetraSpins10View/Views/BetBarView.h/.cpp): the bet.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { type IBetBarView, IBetBarView as IBetBarViewToken } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView';
import { PanelLayout } from '../PanelLayout';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';

const BetBarViewId = 'BetBarView';
const TextBetAmountId = 'text_bet_amount';

export class BetBarView extends NumericBarView<IBetBarView, INumericBarViewEvents> implements IBetBarView {
  private m_currency: CurrencyType = 0;
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);

  constructor() {
    super(BetBarViewId, IBetBarViewToken, new INumericBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetBarViewId, () => this.ApplyPanelLayout());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_panelLayout.Update(this.RuntimeTryGetConst(IGameBackgroundView)) && this.m_elementsList.IsLoaded()) {
      this.ApplyPanelLayout();
    }
  }

  Draw(drawList: DrawList) {
    if (!this.m_visible) return;
    this.m_elementsList.TryGet(this.m_panelLayout.ElementId(TextBetAmountId), TextElement)?.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue));
    super.Draw(drawList);
  }

  SetCurrency(type: CurrencyType) {
    this.m_currency = type;
  }

  GetCurrency() {
    return this.m_currency;
  }

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
  }
}
