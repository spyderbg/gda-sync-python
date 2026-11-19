// Egt::Game::AlphaFamily::BetBarView (JokerReelsCoins10View/Views/BetBarView.h/.cpp): the bet, written by its
// currency (money, coins or a number), with the bet change sound.

import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { int64_t } from '@game/engine/GameCore/Common/Types';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { type IBetBarView, IBetBarView as IBetBarViewToken } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { NumericBarView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView';

const BetBarViewId = 'BetBarView';

const TextBetAmountId = 'text_bet_amount';
const SoundBetChangedId = 'SOUND_PANEL_SUPREME_COMMON_CHANGE_BET';

export class BetBarView extends NumericBarView<IBetBarView, INumericBarViewEvents> implements IBetBarView {
  private m_currency: CurrencyType = Currency.Undefined;

  constructor() {
    super(BetBarViewId, IBetBarViewToken, new INumericBarViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(BetBarViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  private OnElementsListLoaded() {
    this.AdjustBetValue();
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (Unless(this.m_control.m_visible)) return;

    if (this.m_elementsList.IsLoaded()) {
      this.AdjustBetValue();
    }

    super.Draw(drawList);
  }

  SetCurrency(type: CurrencyType) {
    if (this.m_currency === type) return;
    this.m_currency = type;
  }

  SetValueNow(value: int64_t) {
    const canPlaySound = (this.m_currentValue !== value) && (this.m_currentValue !== 0);
    super.SetValueNow(value);
    if (canPlaySound) {
      this.PlayBarAudioState('NewValueNow');
    }
  }

  PlayBarAudioState(audioStateName: string) {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    if (audioStateName === 'NewValueNow' && this.m_skin !== 'Silent') {
      this.RuntimeGet(IAudioApi).Play(SoundBetChangedId);
    }
  }

  private AdjustBetValue() {
    let formattedValue: string;

    if (this.m_currency === Currency.Credits) {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_currentValue);
    } else if (this.m_currency === Currency.CoinsSpinEnergy) {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatCoins(this.m_currentValue);
    } else {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatNumber(this.m_currentValue);
    }

    this.m_elementsList.Get(TextBetAmountId, TextElement).SetText(formattedValue);
  }
}
