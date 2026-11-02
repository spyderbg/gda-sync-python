// Egt::Game::AlphaFamily::AlphaFamilyAutomationViewConfig (AlphaFamilyAutomationView/AlphaFamilyAutomationView.data.h):
// what the automation's view module stubs: the views' animations (skipAnims), the player's input (autoInput), and
// which buttons the input presses (wheelStrategy: take the coins to the wheel).

export class AlphaFamilyAutomationViewConfig {
  autoInput = true;
  skipAnims = true;
  wheelStrategy = false;

  DeserializeFrom(config: Record<string, unknown>) {
    if (typeof config.autoInput === 'boolean') this.autoInput = config.autoInput;
    if (typeof config.skipAnims === 'boolean') this.skipAnims = config.skipAnims;
    if (typeof config.wheelStrategy === 'boolean') this.wheelStrategy = config.wheelStrategy;
  }
}
