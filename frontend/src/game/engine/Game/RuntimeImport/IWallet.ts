// Egt::Game::IWallet: the player's credit, which the kernel keeps outside the game's matches.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum TransactionType {
  Undefined,
  Bet,
  Win,
  CashIn,
  Cashout,
  BetCanceled,
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
