// Checks of the browser game's ports of C++ that writes amounts and cuts image fonts, against what the C++ does:
// Egt::Game::NumberFormatter with the LocalizationManager's formats, and video_ctrl's create_font_from_cyan_sep_png.

import { NumberFormatter } from '@game/engine/Game/Utils/NumberFormatter';
import { NumberFormatConfig } from '@game/engine/Game/Utils/NumberFormatter.data';
import { CreateFontFromCyanSepPng } from '@game/engine/GameVideoCtrl/Fonts';
import { LocalizationManager } from '@game/integration/LocalizationManager/LocalizationManager';

export function run() {
  let checks = 0;
  const equal = (actual: unknown, expected: unknown, message: string) => {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };

  // The LocalizationManager's defaults (LocalizationManager.data.h), as the C++ game writes amounts.
  const localization = new LocalizationManager();
  equal(localization.FormatCurrency(89750), '€ 897,50', 'an amount of cents, with the euro and a decimal comma');
  equal(localization.FormatCurrency(0), '€ 0,00', 'nothing');
  equal(localization.FormatCurrency(123456789), '€ 1.234.567,89', 'the thousands grouped with points');
  equal(localization.FormatCurrency(5), '€ 0,05', 'cents filled to two digits');
  equal(localization.FormatNumber(100), '1,00', 'a number, without the currency');
  equal(localization.FormatCoins(250), '@ 2,50', 'coins');
  // std::div truncates toward zero and keeps the value's sign in the remainder; the sign is grouped as a digit.
  equal(localization.FormatCurrency(-150), '€ -1,-50', 'a negative amount, as C++ writes it');
  equal(localization.FormatCurrency(-100050), '€ -1.000,-50', 'a negative amount in thousands');
  equal(NumberFormatter.FormatNumber(-123456, new NumberFormatConfig(false, '', 1, ',', '.')), '-.123.456', 'the sign grouped as a digit');
  // The other members of the config.
  equal(NumberFormatter.FormatNumber(1234, new NumberFormatConfig(true, '$', 100, '.', ',')), '+$12.34', 'a plus sign and other separators');
  equal(NumberFormatter.FormatNumber(1234567, new NumberFormatConfig(false, '', 1, ',', '')), '1234567', 'no grouping, no decimals');
  equal(NumberFormatter.FormatNumber(5, new NumberFormatConfig(false, '', 1000, ',', '.')), '0,005', 'decimals as wide as the denomination');
  equal(NumberFormatter.FormatNumber(1234567, new NumberFormatConfig(false, '', 1, ',', ' . ')), '1 . 234 . 567', 'a separator of several characters');
  equal(NumberFormatter.FormatNumber(150.9, new NumberFormatConfig(false, '', 100, ',', '.')), '1,50', 'an int64_t: the fraction cut off');

  // video_ctrl's glyph cut: only a cyan pixel ends a glyph, the next starts at its column, the first at the left edge; a
  // glyph is the font's size tall, a line without one more cyan pixel goes on below.
  const width = 12;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  const set = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * width + x) * 4);
  set(4, 0, [0, 255, 255, 255]);
  set(7, 0, [0, 255, 255, 255]);
  set(2, 0, [255, 0, 0, 255]); // opaque, but not cyan: not a mark
  set(5, 4, [0, 255, 255, 255]);
  const glyphs = CreateFontFromCyanSepPng('font.png', { width, height, data }, 3, ['0', '1', '2']);
  equal(Object.fromEntries(glyphs), { 0: { x: 0, y: 1, w: 4, h: 3 }, 1: { x: 4, y: 1, w: 3, h: 3 }, 2: { x: 0, y: 5, w: 5, h: 3 } },
    'the glyphs of two lines');
  equal(CreateFontFromCyanSepPng('font.png', { width, height, data }, 5, ['0']).get('0'), { x: 0, y: 1, w: 4, h: 5 }, 'the font size tall');
  let error = '';
  try {
    CreateFontFromCyanSepPng('font.png', { width, height, data }, 3, ['0', '1', '2', '3']);
  } catch (caught) {
    error = (caught as Error).message;
  }
  equal(error.startsWith("Could not find codepoint : '3' in PNG font [font.png]"), true, 'a font that runs out of cyan pixels');
  return checks;
}
