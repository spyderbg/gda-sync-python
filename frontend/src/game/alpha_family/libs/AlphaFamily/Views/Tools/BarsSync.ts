// Egt::Game::AlphaFamily::ViewTools::BarsSync (AlphaFamily/Views/Tools/BarsSync.h/.cpp): how the win and credit bars
// count together when the win is taken.

import { Accumulation } from './AccumulationControl';
import type { AccumulationDescriptor } from './AccumulationControl.data';

export class BarSyncTakeWinInput {
  currentWin = 0;
  currentCredit = 0;
  targetWin = 0;
  isAutoplayOn = false;
  isAfterGamble = false;
  oneStepTakeWin = false;
}

export interface BarSyncTakeWinOutput {
  winAcc?: AccumulationDescriptor;
  creditAcc?: AccumulationDescriptor;
}

export const BarsSync = {
  CalculateTakeWinAcc(ctx: BarSyncTakeWinInput): BarSyncTakeWinOutput {
    const win = ctx.currentWin;
    const credit = ctx.currentCredit;
    const targetWin = ctx.targetWin ?? 0;
    const targetCredit = credit + win;
    if (ctx.oneStepTakeWin) {
      return { winAcc: Accumulation.CreateInstantAccumulation(win, targetWin), creditAcc: Accumulation.CreateInstantAccumulationWithPauseAtEnd(credit, targetCredit, 480) };
    }
    if (ctx.isAfterGamble) {
      return { winAcc: Accumulation.CreateInstantAccumulation(win, targetWin), creditAcc: Accumulation.CreateInstantAccumulation(credit, targetCredit) };
    }
    return {
      winAcc: Accumulation.CreateLinearAccumulationByDuration(win, targetWin, 4, 480),
      creditAcc: Accumulation.CreateLinearAccumulationByDuration(credit, targetCredit, 4, 480),
    };
  },
};
