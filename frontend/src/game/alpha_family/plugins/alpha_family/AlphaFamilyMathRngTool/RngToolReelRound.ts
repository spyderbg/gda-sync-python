// Egt::Game::AlphaFamily::RngToolReelRound (AlphaFamilyMathRngTool/RngToolReelRound.h/.cpp): a reel round's tab of the
// RNG Picker, its screen, or the tetra round's four sub-screens (two a row), each showing what the one before it copies
// and sticks to it. Its RNG numbers are its screens' numbers, one sequence.

import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { RngToolContext, RngToolQueue } from './RngToolContext';
import { RngToolReelRoundSubscreen, type SubscreenClick, type SubscreenView } from './RngToolReelRoundSubscreen';

export interface ReelRoundView {
  subscreens: SubscreenView[];
  /** The screens a row of the tab has: one, or two of the tetra round's four (C++'s ##subscreens table). */
  columns: number;
}

export class RngToolReelRound {
  private m_type = RoundType.Undefined;
  private m_context: RngToolContext | null = null;

  private m_subscreens: RngToolReelRoundSubscreen[] = [];

  Init(newType: RoundType, context: RngToolContext) {
    this.m_type = newType;
    this.m_context = context;

    if (this.m_context === null || this.m_context.m_mathRules === null || !this.m_context.m_mathRules.HasReelRoundRules(this.m_type)) {
      console.assert(false, 'RngToolReelRound: no reel round rules');
      return;
    }
    const rules = this.m_context.m_mathRules.GetReelRoundRules(this.m_type);

    switch (this.m_type) {
      case RoundType.Main:
      case RoundType.Free:
      case RoundType.Extra:
      case RoundType.ExtraFree:
      case RoundType.Coins:
      case RoundType.CoinsFree:
        {
          const subscreen = new RngToolReelRoundSubscreen();
          subscreen.Init(this.m_type, this.m_context, 0, rules.GetConfig());
          this.m_subscreens.push(subscreen);
        }
        break;
      case RoundType.Tetra:
        {
          for (let i = 0; i < rules.GetTetraSpinRules().GetSubScreenCount(); i++) {
            const subscreen = new RngToolReelRoundSubscreen();
            subscreen.Init(this.m_type, this.m_context, i, rules.GetTetraSpinRules().GetSubScreenRules(i).GetConfig());
            this.m_subscreens.push(subscreen);
          }
        }
        break;
      default:
        break;
    }
  }

  Deinit() {
    this.m_type = RoundType.Undefined;
    this.m_context = null;
    this.m_subscreens = [];
  }

  /** ImGuiDraw: a frame of the screens, with a click of one of them. */
  Draw(click: { subscreen: number; click: SubscreenClick } | null = null): ReelRoundView {
    this.Update();

    const subscreens = this.m_subscreens.map((subscreen, index) => subscreen.Draw(click?.subscreen === index ? click.click : null));
    return { subscreens, columns: this.m_subscreens.length === 1 ? 1 : 2 };
  }

  Update() {
    for (let i = 0; i < this.m_subscreens.length; i++) {
      const copyFrom = i > 0 ? this.m_subscreens[i - 1] : null;
      this.m_subscreens[i].Update(copyFrom);
    }
  }

  GetRngOperationsForVisibleOutcome(): RngToolQueue {
    const rngsQueue: RngToolQueue = [];

    for (const subscreen of this.m_subscreens) {
      const subQueue = subscreen.GetRngOperationsForVisibleOutcome();

      if (!rngsQueue.length) {
        rngsQueue.push(...subQueue);
      } else {
        for (const [, q] of subQueue) {
          rngsQueue[rngsQueue.length - 1][1].data.push(...q.data);
        }
      }
    }

    return rngsQueue;
  }

  GetNoWinLikePresetName() {
    let presetName = '';

    for (const subscreen of this.m_subscreens) {
      presetName += subscreen.GetNoWinLikePresetName();
      presetName += '|';
    }

    if (presetName) {
      presetName = presetName.slice(0, -1);
    }

    return presetName;
  }
}
