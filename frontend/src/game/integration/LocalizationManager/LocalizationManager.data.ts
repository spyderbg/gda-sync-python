// Egt::Integration::LocalizationManagerConfig (integration/plugins/src/Egt/LocalizationManager/LocalizationManager.data.h):
// the kernel integration's languages and number formats. The modules configs (configs/alpha_family/modules/*) set none
// of them, so the C++ game writes amounts with these defaults: "€ 1.234,56", coins "@ 1.234,56".

import { NumberFormatConfig } from '@game/engine/Game/Utils/NumberFormatter.data';

export class LocalizationManagerConfig {
  supportedLanguages: string[] = [];
  defaultLanguage = '';

  numberFormat = new NumberFormatConfig(false, '', 100, ',', '.');
  // "\xe2\x82\xac " in C++: the euro sign, in UTF-8
  currencyFormat = new NumberFormatConfig(false, '€ ', 100, ',', '.');
  coinsFormat = new NumberFormatConfig(false, '\x40 ', 100, ',', '.');
}
