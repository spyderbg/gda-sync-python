// Egt::Game::IFileWatch (Egt/Game/RuntimeExport/IFileWatch.h): watches files of the game's resources, and posts
// fileChanged when one of them changes (the FileWatch module provides it in debug and QA builds).
//
// In the browser game a file is its path relative to the game folder, as the descriptors name it (IResources).

import { Event } from '../../Core/Event';
import { Interface } from '../../GameCore/RuntimeAccess';

export interface IFileWatch {
  StartWatchFile(filepath: string): void;
  StopWatchFile(filepath: string): void;
}

export class IFileWatchEvents {
  readonly fileChanged = new Event<[string]>();
}

export const IFileWatch = Interface<IFileWatch, IFileWatchEvents>('IFileWatch');
