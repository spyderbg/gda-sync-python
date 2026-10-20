// Egt::Game::IWallet: the player's credit, which the kernel keeps outside the game's matches.

import { Event } from '../../Core/Event';
import { Interface } from '../../GameCore/RuntimeAccess';

export enum TransactionType {
  CashIn,
  CashOut,
  MatchStart,
  MatchEnd,
}

export interface TransactionInfo {
  transactionType: TransactionType;
  amount: number;
  newCreditTotal: number;
}

export interface IWallet {
  GetCredit(): number;
  StartCashout(): void;
}

export class IWalletEvents {
  readonly onCreditChanged = new Event<[TransactionInfo]>();
  readonly onCashoutStart = new Event();
  readonly onCashoutEnd = new Event<[boolean]>();
}

export const IWallet = Interface<IWallet, IWalletEvents>('IWallet');
