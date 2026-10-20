// Egt::Game::AlphaFamily::BetBarView (BurningCrownTetraSpins10View/Views/BetBarView.h/.cpp): the bet.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import type { CurrencyType } from '../../../../../engine/Game/Math/Common.data';
import { ILocalization } from '../../../../../engine/Game/RuntimeImport/ILocalization';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import { TextElement } from '../../../../../engine/GameVideoCtrl/ViewElements/TextElement';
import { INumericBarViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { type IBetBarView, IBetBarView as IBetBarViewToken } from '../../../../libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/NumericBarView';

const BetBarViewId = 'BetBarView';
const TextBetAmountId = 'text_bet_amount';

export class BetBarView extends NumericBarView<IBetBarView, INumericBarViewEvents> implements IBetBarView {
  private m_currency: CurrencyType = 0;

  constructor() {
    super(BetBarViewId, IBetBarViewToken, new INumericBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetBarViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.m_visible) return;
    this.m_elementsList.TryGet(TextBetAmountId, TextElement)?.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue));
    super.Draw(drawList);
  }

  SetCurrency(type: CurrencyType) {
    this.m_currency = type;
  }

  GetCurrency() {
    return this.m_currency;
  }
}
