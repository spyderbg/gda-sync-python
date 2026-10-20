// The rules of Burning Crown Tetra Spins 10 as data (authoring/MathRulesDescription.ts): what MathRules::CreateRules()
// in BurningCrownTetraSpins10Math/MathRules.cpp fills by hand. The browser game builds its rules from it, and the C++
// export writes MathRules.cpp from it.

import type { MathRulesDescription, ScreenDescription } from '../../../../authoring/MathRulesDescription';

const tetraSubScreen = (screen: number): ScreenDescription => ({
  reels: `tetraRound.reelsScreen${screen}`,
  additionalRowsToInclude: 1,
  lines: { lines: 'tetraRound.lines', paytable: 'tetraRound.linePaytable', wildIds: ['symbolsData.wildId'] },
  copySymbols: { symbolIds: ['symbolsData.wildId'] },
  stickSymbols: { symbolId: 'symbolsData.wildId', distrPerReel: `tetraRound.wildsScreen${screen}` },
});

export const MATH_RULES: MathRulesDescription = {
  simulatorName: 'BurningCrown',
  rowsCount: 'rowsCount',
  symbolNames: 'symbolsData.symbolNames',
  rounds: [
    {
      roundType: 'Main',
      allowedBetLines: [10],
      allowedBets: 'mainRound.allowedBets',
      rtpReducer: 'mainRound.rtpReducer',
      winTypeThresholds: [[25, 'BigWin'], [35, 'SuperWin'], [50, 'EpicWin'], [100, 'MegaWin']],
      screen: {
        reels: 'mainRound.reels',
        additionalRowsToInclude: 1,
        lines: { lines: 'mainRound.lines', paytable: 'mainRound.linePaytable', wildIds: ['symbolsData.wildId'] },
      },
    },
    {
      roundType: 'Tetra',
      allowedBetLines: [10],
      allowedBets: 'tetraRound.allowedBets',
      rtpReducer: 'tetraRound.rtpReducer',
      // min tetra bet is 4x main bet
      minBetMultiplier: 'tetraTrigger',
      winTypeThresholds: [[60, 'BigWin'], [80, 'SuperWin'], [120, 'EpicWin'], [200, 'MegaWin']],
      tetraSpin: { triggerTimesBet: 'tetraTrigger', maxRounds: 'tetraMaxRounds', subScreens: [0, 1, 2, 3].map(tetraSubScreen) },
    },
  ],
  consecutiveRoundTypePriorities: [['Tetra', 2], ['Main', 1]],
};
