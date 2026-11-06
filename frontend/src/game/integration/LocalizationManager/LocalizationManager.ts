// Egt::Integration::LocalizationManager (integration/plugins/src/Egt/LocalizationManager/LocalizationManager.h/.cpp):
// how the kernel integration writes numbers, amounts and coins (its ILocalization's Format methods), which BrowserKernel
// provides. Its languages, recovery and ImGui window are the BrowserKernel's own, so they are not ported here.

import { NumberFormatter } from '@game/engine/Game/Utils/NumberFormatter';
import type { NumberFormatConfig } from '@game/engine/Game/Utils/NumberFormatter.data';
import { LocalizationManagerConfig } from '@game/integration/LocalizationManager/LocalizationManager.data';

export class LocalizationManager {
  constructor(private readonly m_config = new LocalizationManagerConfig()) {}

  FormatNumber(value: number, config?: NumberFormatConfig) {
    if (config) return NumberFormatter.FormatNumber(value, config);

    return NumberFormatter.FormatNumber(value, this.m_config.numberFormat);
  }

  FormatCurrency(credits: number) {
    return NumberFormatter.FormatNumber(credits, this.m_config.currencyFormat);
  }

  FormatCoins(coins: number) {
    return NumberFormatter.FormatNumber(coins, this.m_config.coinsFormat);
  }
}
