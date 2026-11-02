// Egt::Game::AlphaFamily::RngToolContext (AlphaFamilyMathRngTool/RngToolContext.h): what the RNG Picker uses of the
// game, the math rules, the kernel's RNG queue, a symbol's name and a resource image; and its queue of the RNG numbers
// of a picked outcome, by round type.

import type { RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { IRngPreset } from '@game/engine/Game/RuntimeImport/IRngPreset';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';
import type { RoundType, SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';

/** The symbol's name, and whether the rules have the symbol (C++'s bool and symbolNameOut). */
export type SymbolNameGetterType = (roundType: RoundType, id: SymbolId) => [boolean, string];
export type ImageGetterType = (rssKey: string) => ImageData | null;

export class RngToolContextCallbacks {
  symbolNameGetter: SymbolNameGetterType | null = null;
  imageGetter: ImageGetterType | null = null;
}

export class RngToolContext {
  m_mathRules: IMathRules | null = null;
  m_kernelRngPresets: IRngPreset | null = null;
  m_callbacks = new RngToolContextCallbacks();
}

export type RngToolEntry = [RoundType, RngSequence];
export type RngToolQueue = RngToolEntry[];
