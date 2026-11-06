// Egt::Game::NumberFormatConfig (Egt/Game/Utils/NumberFormatter.data.h): how NumberFormatter writes a number: a plus
// sign, the currency symbol before it, how many of its smallest unit make one (100 cents), and the separators.

export class NumberFormatConfig {
  constructor(
    public showPlusSign = false,
    public currencySymbol = '',
    public denomination = 1,
    public decimalSeparator = ',',
    public groupingSeparator = '.',
  ) {}
}
