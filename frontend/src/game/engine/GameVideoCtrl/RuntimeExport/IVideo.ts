// Egt::Game::IVideo: the screen the game draws on, its images and fonts, and the input it receives.

import { Interface } from '../../GameCore/RuntimeAccess';
import type { DrawList } from '../DrawList';
import type { FontCache } from '../Fonts';
import type { ImageCache } from '../ImageCache';

export interface TouchEventData {
  type: 'down' | 'up';
  x: number;
  y: number;
}

export interface IVideo {
  RegisterDrawMain(handleEvent: (event: TouchEventData) => boolean, draw: (drawList: DrawList) => void): void;
  UnregisterDrawMain(): void;
  /** The info screen (a cabinet's second screen, with the help pages). */
  RegisterDrawInfo(handleEvent: ((event: TouchEventData) => boolean) | null, draw: (drawList: DrawList) => void): void;
  UnregisterDrawInfo(): void;
  GetInfoResolution(): { width: number; height: number };
  /** The topper screen (a cabinet's screen above the others). */
  RegisterDrawTopper(handleEvent: ((event: TouchEventData) => boolean) | null, draw: (drawList: DrawList) => void): void;
  UnregisterDrawTopper(): void;
  GetImages(): ImageCache;
  GetFonts(): FontCache;
  GetResolution(): { width: number; height: number };
}

export const IVideo = Interface<IVideo>('IVideo');
