// Egt::Game::AlphaFamily::RngPresetContext (AlphaFamilyMathRngPreset/RngPresetContext.h): what the RNG Presets use of
// the game, the math rules, the kernel's RNG queue and its grid preview.

import type { IRngPreset } from '@game/engine/Game/RuntimeImport/IRngPreset';
import type { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import type { IRngQueueGridPreview } from '@game/integration/Runtime/IRngQueueGridPreview';

export class RngPresetContext {
  m_mathRules: IMathRules | null = null;
  m_kernelRngPresets: IRngPreset | null = null;
  m_rngQueueGridPreview: IRngQueueGridPreview | null = null;
}
