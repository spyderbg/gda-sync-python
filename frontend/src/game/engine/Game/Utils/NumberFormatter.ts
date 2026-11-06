// Egt::Game::NumberFormatter (Egt/Game/Utils/NumberFormatter.h/.cpp): writes an amount of the smallest unit (cents)
// with a NumberFormatConfig, statement for statement as C++ does, a negative amount included: std::div truncates toward
// zero and leaves the remainder the value's sign, and the integral part's sign is counted among its grouped digits.

import type { NumberFormatConfig } from '@game/engine/Game/Utils/NumberFormatter.data';

export class NumberFormatter {
  static FormatNumber(value: number, config: NumberFormatConfig): string {
    // C++ takes an int64_t
    value = Math.trunc(value);
    const splitValue = { quot: Math.trunc(value / config.denomination), rem: value % config.denomination };
    const currencySymbol = config.currencySymbol;
    // const auto formattedText = fmt::format("{}{},{:02}", currencySymbol, splitValue.quot, splitValue.rem);
    let ss = '';
    if (config.showPlusSign && value > 0) {
      ss += '+';
    }
    ss += currencySymbol;
    if (config.groupingSeparator !== '') {
      const integralPart = String(splitValue.quot);
      let formattedIntegralPart = '';
      let digitCount = 0;
      for (let i = integralPart.length - 1; i >= 0; --i) {
        if (digitCount % 3 === 0 && digitCount !== 0) {
          formattedIntegralPart += config.groupingSeparator;
        }
        formattedIntegralPart += integralPart[i];
        ++digitCount;
      }
      formattedIntegralPart = [...formattedIntegralPart].reverse().join('');
      ss += formattedIntegralPart;
    } else {
      ss += String(splitValue.quot);
    }

    if (config.denomination > 1) {
      const upperLimit = config.denomination - 1;
      const width = String(upperLimit).length;
      // std::setw(width) << std::setfill('0'): filled on the left, a sign included
      ss += config.decimalSeparator + String(splitValue.rem).padStart(width, '0');
    }

    const formattedText = ss;

    return formattedText;
  }
}
