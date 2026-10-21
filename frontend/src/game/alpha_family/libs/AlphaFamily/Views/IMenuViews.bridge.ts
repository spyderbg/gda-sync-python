// Egt::Game::AlphaFamily::ILanguageMenuView and ISoundMenuView (AlphaFamily/Views/ILanguageMenuView.bridge.h,
// ISoundMenuView.bridge.h).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, type IMenuView, IMenuViewEvents } from './BaseInterfaces/IControlView';

export interface ILanguageMenuView extends IControlView, IMenuView {
  SetLanguage(language: string): void;
  SetPossibleLanguages(languages: string[]): void;
}

export class ILanguageMenuViewEvents extends IMenuViewEvents {
  readonly requestLanguageChange = new Event<[string]>();
}

export const ILanguageMenuView = Interface<ILanguageMenuView, ILanguageMenuViewEvents>('ILanguageMenuView');

export interface ISoundMenuView extends IControlView, IMenuView {
  SetCurrentVolume(volume: number): void;
  SetPossibleVolumes(volumes: number[]): void;
}

export class ISoundMenuViewEvents extends IMenuViewEvents {
  readonly requestVolumeChange = new Event<[number]>();
}

export const ISoundMenuView = Interface<ISoundMenuView, ISoundMenuViewEvents>('ISoundMenuView');
