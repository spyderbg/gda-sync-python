// The FileWatch module (plugins/src/Egt/FileWatch): provides IFileWatch, so that a view reloads its elements list when
// its file changes while the game plays (and, the browser game's, the resources their descriptors and IData).
//
// C++ watches the files with inotify. The browser game's files are on the backend: it asks for their stamps (GET
// /api/game/file-stamps) once a second while the game runs, and, when one changes, has IResources read it again before
// it posts fileChanged, as the C++ resources read the file when a view reloads.

import { GameBackend } from '@game/app/GameBackend';
import { IFileWatch, IFileWatchEvents } from '@game/engine/Game/RuntimeExport/IFileWatch';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

const PollIntervalMs = 1000;

interface WatchedFile {
  refCount: number;
  /** The file's stamp when it was last read; undefined until the first poll. */
  stamp?: string | null;
}

export class FileWatch extends BaseModule implements IFileWatch {
  private readonly m_events = new IFileWatchEvents();
  private readonly m_files = new Map<string, WatchedFile>();
  private m_changedFiles: string[] = [];
  private m_nextPoll = 0;
  private m_polling = false;
  private m_running = false;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.RuntimeAdd(IFileWatch, this);
    this.RuntimeAdd(IFileWatch.Events, this.m_events);
    this.m_running = true;
    return true;
  }

  Deinit() {
    this.m_running = false;
    this.RuntimeRemove(IFileWatch);
    this.RuntimeRemove(IFileWatch.Events);
    this.m_files.clear();
    super.Deinit();
  }

  Process() {
    for (const filepath of this.TakeChangedFiles()) {
      console.info(`FileWatch: ${filepath} changed`);
      this.m_events.fileChanged.Post(filepath);
    }
    const now = performance.now();
    if (!this.m_polling && now >= this.m_nextPoll && this.m_files.size) {
      this.m_nextPoll = now + PollIntervalMs;
      void this.Poll();
    }
  }

  StartWatchFile(filepath: string) {
    const file = this.m_files.get(filepath) ?? { refCount: 0 };
    file.refCount++;
    this.m_files.set(filepath, file);
  }

  StopWatchFile(filepath: string) {
    const file = this.m_files.get(filepath);
    if (!file) return;
    if (--file.refCount > 0) return;
    this.m_files.delete(filepath);
  }

  private TakeChangedFiles() {
    const changed = this.m_changedFiles;
    this.m_changedFiles = [];
    return changed;
  }

  /** Compares the watched files' stamps with the backend's, and reads again those that changed. */
  private async Poll() {
    this.m_polling = true;
    try {
      const { stamps } = await GameBackend.FileStamps([...this.m_files.keys()]);
      for (const [filepath, stamp] of Object.entries(stamps)) {
        const file = this.m_files.get(filepath);
        if (!file || !this.m_running) continue;
        const known = file.stamp;
        file.stamp = stamp;
        if (known === undefined || known === stamp || stamp === null) continue;
        // a file saved while it is half written is read at its next stamp
        if (await this.RuntimeTryGet(IResources)?.ReloadFile(filepath)) this.m_changedFiles.push(filepath);
      }
    } catch (error) {
      console.warn(`FileWatch: ${(error as Error).message}`);
    } finally {
      this.m_polling = false;
    }
  }
}
