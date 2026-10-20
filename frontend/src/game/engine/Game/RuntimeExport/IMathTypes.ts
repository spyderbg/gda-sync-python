// Egt::Game::IMathTypes (Egt/Game/RuntimeExport/IMathTypes.h): the game's round types and currencies by name.

import type { CurrencyType, GameRoundType } from '../Math/Common.data';
import { Interface } from '../../GameCore/RuntimeAccess';

export interface IMathTypes {
  GetAvailableRoundTypes(): GameRoundType[];
  GetMainRoundType(): GameRoundType;
  GetRoundTypeName(roundType: GameRoundType): string;
  GetCreditsCurrencyType(): CurrencyType;
  GetCurrencyName(currencyType: CurrencyType): string;
}

export const IMathTypes = Interface<IMathTypes>('IMathTypes');
