// The ResourceManager module (plugins/src/Egt/ResourceManager): provides IResources from the game's descriptors.
//
// The game loads the same resources the asset library lists: the descriptors' entries (GET /api/game/project) whose
// files the active workspace's asset report lists as available. Before the game starts, it loads every IData and view
// of the game (GET /api/game/data), as the C++ resource manager does on its first access; images, image sequences,
// audio and fonts load on first use through the preview endpoint.
//
// While the game plays, it watches the descriptor files (IFileWatch): when one changes (an image's file renamed or
// moved), it reads the descriptors again, and the elements draw the files they now name (the browser game's: C++ reads
// its descriptors once).

import type { GameAssetReport, GameProject } from '../../app/GameBackend';
import { GameBackend } from '../../app/GameBackend';
import { Runtime } from '../GameCore/RuntimeAccess';
import { type ElementsListData, IResources, type RssAudioEvent, type RssDescriptors, type RssElement, type RssFont, type RssIData, type RssImage, type RssImageSequence, type RssMovie, type RssRtf, type RssTextStyle } from '../Game/RuntimeExport/IResources';
import { IFileWatch } from '../Game/RuntimeExport/IFileWatch';
import { IVideo } from '../GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '../ModuleManager/BaseModule';

const RESOLUTION = '1920x1080';

type Entry = { id: string; resolution?: string; language?: string; integration?: string };

export interface ResourceProblem {
  kind: string;
  id: string;
  message: string;
}

export class ResourceManager extends BaseModule implements IResources {
  private descriptors: RssDescriptors;
  private descriptorFiles: string[];
  private watchedDescriptorFiles: string[] = [];
  private available: Set<string> | null;
  private idatas = new Map<string, unknown>();
  private views = new Map<string, ElementsListData>();
  private language = 'en-GB';
  readonly problems: ResourceProblem[] = [];

  constructor(project: GameProject, report: GameAssetReport | null, private readonly integration: string | null = null) {
    super();
    this.descriptors = project.descriptors;
    this.descriptorFiles = project.descriptorFiles ?? [];
    this.available = report ? ResourceManager.AvailableFiles(report) : null;
    for (const error of project.errors) this.problems.push({ kind: 'descriptor', id: '', message: error });
  }

  /** The files of the asset report that exist: every available asset's file and the frames of its sequences. */
  static AvailableFiles(report: GameAssetReport) {
    const files = new Set<string>();
    for (const asset of report.assets) {
      if (asset.status === 'available') files.add(asset.resourcePath);
      for (const frame of asset.sequence?.frames ?? []) if (frame.status === 'available') files.add(frame.resourcePath);
    }
    return files;
  }

  async Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.RuntimeAdd(IResources, this);
    await Promise.all([this.LoadIDatas(), this.LoadViews()]);
    return true;
  }

  PostInit() {
    this.WatchDescriptorFiles(this.descriptorFiles);
    return super.PostInit();
  }

  Deinit() {
    this.WatchDescriptorFiles([]);
    this.RuntimeRemove(IResources);
    super.Deinit();
  }

  /** Watches these descriptor files, and no others (FileWatch is made after this module: it watches from PostInit). */
  private WatchDescriptorFiles(files: string[]) {
    const fileWatch = this.RuntimeTryGet(IFileWatch);
    if (!fileWatch) return;
    for (const file of this.watchedDescriptorFiles) if (!files.includes(file)) fileWatch.StopWatchFile(file);
    for (const file of files) if (!this.watchedDescriptorFiles.includes(file)) fileWatch.StartWatchFile(file);
    this.watchedDescriptorFiles = [...files];
  }

  /** Reads the descriptors again, and the asset report, and the IData and views a changed entry names another file of. */
  private async ReloadDescriptors() {
    let project: GameProject;
    try {
      project = await GameBackend.Project();
    } catch (error) {
      console.warn(`The descriptors: ${(error as Error).message}`);
      return false;
    }
    const report = await GameBackend.AssetReport().catch(() => null);
    const pathOf = (entries: Entry[], id: string) => (this.Choose(entries, id) as { path?: string } | null)?.path;
    const idataPaths = new Map([...this.idatas.keys()].map(id => [id, pathOf(this.descriptors.idatas, id)]));
    const viewPaths = new Map([...this.views.keys()].map(id => [id, pathOf(this.descriptors.elements, id)]));
    this.descriptors = project.descriptors;
    this.descriptorFiles = project.descriptorFiles ?? [];
    if (report) this.available = ResourceManager.AvailableFiles(report);
    // what is missing is reported again as it is drawn
    this.problems.splice(0, this.problems.length, ...project.errors.map(error => ({ kind: 'descriptor', id: '', message: error })));
    this.WatchDescriptorFiles(this.descriptorFiles);
    this.RuntimeTryGet(IVideo)?.GetImages().ForgetFailed();
    await Promise.all([
      ...[...new Set(this.descriptors.idatas.map(entry => entry.id))].filter(id => !this.idatas.has(id) || idataPaths.get(id) !== pathOf(this.descriptors.idatas, id))
        .map(id => this.LoadIData(id)),
      ...[...new Set(this.descriptors.elements.map(entry => entry.id))].filter(id => !this.views.has(id) || viewPaths.get(id) !== pathOf(this.descriptors.elements, id))
        .map(id => this.LoadView(id)),
    ]);
    return true;
  }

  private async LoadIDatas() {
    const ids = [...new Set(this.descriptors.idatas.map(entry => entry.id))];
    await Promise.all(ids.map(id => this.LoadIData(id)));
  }

  private async LoadIData(id: string) {
    const entry = this.Choose(this.descriptors.idatas, id) as RssIData;
    try {
      this.idatas.set(id, await GameBackend.Data(entry.path));
    } catch (error) {
      this.problems.push({ kind: 'IData', id, message: (error as Error).message });
    }
  }

  private async LoadViews() {
    const ids = [...new Set(this.descriptors.elements.map(entry => entry.id))];
    await Promise.all(ids.map(id => this.LoadView(id)));
  }

  private async LoadView(id: string) {
    const entry = this.Choose(this.descriptors.elements, id) as RssElement;
    try {
      this.views.set(id, await GameBackend.Data<ElementsListData>(entry.path));
    } catch (error) {
      this.problems.push({ kind: 'ElementsList', id, message: (error as Error).message });
    }
  }

  /** The entry of an id for the game's resolution, integration and language: of several entries, the one that names
   * them, else the one that names none, else the first declared. */
  private Choose<T extends Entry>(entries: T[], id: string): T | null {
    const candidates = entries.filter(entry => entry.id === id);
    if (!candidates.length) return null;
    const score = (entry: T) =>
      (entry.resolution === undefined || entry.resolution === RESOLUTION ? 8 : 0) +
      (entry.integration === (this.integration ?? undefined) ? 4 : entry.integration === undefined ? 2 : 0) +
      (entry.language === this.language ? 1 : entry.language === undefined ? 1 : 0);
    return candidates.reduce((best, entry) => (score(entry) > score(best) ? entry : best));
  }

  private Exists(file: string) {
    return !this.available || this.available.has(file);
  }

  private Report(kind: string, id: string, message: string) {
    if (!this.problems.some(problem => problem.kind === kind && problem.id === id)) this.problems.push({ kind, id, message });
  }

  // IResources

  HasIData(id: string) {
    return this.idatas.has(id);
  }

  GetIData<T>(id: string): T {
    if (!this.idatas.has(id)) throw new Error(`IData ${id} is not loaded`);
    return this.idatas.get(id) as T;
  }

  GetElementsList(id: string) {
    return this.views.get(id) ?? null;
  }

  GetElementsListFile(id: string) {
    return this.Choose(this.descriptors.elements, id)?.path ?? null;
  }

  async ReloadFile(file: string) {
    if (this.descriptorFiles.includes(file)) return this.ReloadDescriptors();
    const views = [...new Set(this.descriptors.elements.map(entry => entry.id))].filter(id => this.Choose(this.descriptors.elements, id)?.path === file);
    const idatas = [...new Set(this.descriptors.idatas.map(entry => entry.id))].filter(id => this.Choose(this.descriptors.idatas, id)?.path === file);
    if (!views.length && !idatas.length) return false;
    try {
      const data = await GameBackend.Data<unknown>(file);
      for (const id of views) this.views.set(id, data as ElementsListData);
      for (const id of idatas) this.idatas.set(id, data);
      return true;
    } catch (error) {
      console.warn(`${file}: ${(error as Error).message}`);
      return false;
    }
  }

  GetImage(id: string): RssImage | null {
    const entry = this.Choose(this.descriptors.images, id);
    if (!entry) this.Report('Image', id, 'no image has this id');
    else if (!this.Exists(entry.file)) this.Report('Image', id, `missing from the asset report: ${entry.path}`);
    return entry;
  }

  GetImageSequence(id: string): RssImageSequence | null {
    const entry = this.Choose(this.descriptors.imagesSeq, id);
    if (entry && entry.frames.some(frame => !this.Exists(frame.file))) this.Report('ImageSequence', id, 'frames missing from the asset report');
    return entry;
  }

  GetMovie(id: string): RssMovie | null {
    return this.Choose(this.descriptors.movies, id);
  }

  GetFont(id: string): RssFont | null {
    const entry = this.Choose(this.descriptors.fonts, id);
    if (!entry) this.Report('Font', id, 'no font has this id');
    return entry;
  }

  GetTextStyle(id: string): RssTextStyle | null {
    const entry = this.Choose(this.descriptors.styles, id);
    if (!entry) this.Report('TextStyle', id, 'no text style has this id');
    return entry;
  }

  GetAudioEvent(id: string): RssAudioEvent | null {
    return this.Choose(this.descriptors.audioEvents, id);
  }

  GetRtf(id: string): RssRtf | null {
    const entry = this.Choose(this.descriptors.rtfs ?? [], id);
    if (!entry) this.Report('Rtf', id, 'no RTF has this id');
    return entry;
  }

  LoadRtfLayout(file: string) {
    return GameBackend.RtfLayout(file);
  }

  FileUrl(file: string) {
    return GameBackend.FileUrl(file);
  }

  SetLanguage(language: string) {
    this.language = language;
  }
}
