// Egt::Game::IVideoManager (GameVideoCtrl/RuntimeExport/IVideoManager.h): render layers over the game's screen, drawn
// in the order of their ids after the game, and given the input first, the topmost first. The browser game has only the
// main screen: the info and topper screens' layers are not here.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '../DrawList';
import type { TouchEventData } from './IVideo';

export type EventHandler = (event: TouchEventData) => boolean;
export type DrawHandler = (drawList: DrawList) => void;
/** Whether the layer covers the whole screen, so that nothing under it needs to be drawn. */
export type IsOpaqueFullScreenHandler = (() => boolean) | null;

export interface IVideoManager {
  RegisterRenderLayerMain(layer: number, handleEvent: EventHandler, draw: DrawHandler, isOpaqueFullScreen: IsOpaqueFullScreenHandler): void;
  UnregisterRenderLayerMain(layer: number): void;
}

export const IVideoManager = Interface<IVideoManager>('IVideoManager');
