// Egt::Game::ILocalization: the language and how money is written.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface ILocalization {
  GetLanguage(): string;
  SetLanguage(language: string): void;
  GetSupportedLanguages(): string[];
  FormatCurrency(value: number): string;
  /** An amount of cents as a number, without the currency. */
  FormatNumber(value: number): string;
}

export class ILocalizationEvents {
  readonly languageChanged = new Event<[string]>();
}

export const ILocalization = Interface<ILocalization, ILocalizationEvents>('ILocalization');
