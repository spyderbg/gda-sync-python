// Egt::Game::IResources: the game's resources by id (RssKey), as its descriptors declare them.

import type { RtfLayout } from '@game/engine/GameVideoCtrl/Rtf/RtfLayout';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface RssRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RssEntry {
  id: string;
  descriptor: string;
  resolution?: string;
  language?: string;
  integration?: string;
}

export interface RssImage extends RssEntry {
  path: string;
  file: string;
  source?: RssRect;
}

export interface RssImageSequence extends RssEntry {
  frameTime: number;
  loopCount: number;
  loopTo?: number;
  frames: { file: string; source?: RssRect }[];
}

export interface RssMovie extends RssEntry {
  path: string;
  file: string;
  movieFormat?: string;
}

export interface RssFont extends RssEntry {
  path: string;
  file: string;
  chars: string;
  size: number;
}

export interface RssTextStyle extends RssEntry {
  font_id: string;
  size: number;
}

export interface RssAudioEvent extends RssEntry {
  samples: string[];
  files: string[];
  polyphonyGroup?: string;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface RssIData extends RssEntry {
  dataType: string;
  path: string;
  file: string;
}

export interface RssRtf extends RssEntry {
  path: string;
  file: string;
}

export interface RssElement extends RssEntry {
  path: string;
  file: string;
}

export interface RssDescriptors {
  images: RssImage[];
  imagesSeq: RssImageSequence[];
  fonts: RssFont[];
  styles: RssTextStyle[];
  audioEvents: RssAudioEvent[];
  idatas: RssIData[];
  elements: RssElement[];
  movies: RssMovie[];
  rtfs: RssRtf[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** An element of a view (v/<resolution>/<View>.json), as ElementsList loads it. */
export interface ViewElementData {
  id?: string;
  type: string;
  rssKey?: string;
  rssKeys?: string[];
  rssStyleId?: string;
  position?: Point;
  alignment?: string;
  scale?: Point;
  pivot?: Point;
  rotation?: number;
  color?: Partial<Color>;
  hidden?: boolean;
  fitBox?: Size;
  touchArea?: RssRect;
  /** The sound a button plays when pressed. */
  rssKeySound?: string;
  loopCount?: number;
  orientation?: string;
}

export interface ElementsListData {
  name: string;
  elements: ViewElementData[];
}

export interface IResources {
  HasIData(id: string): boolean;
  /** The JSON of an IData, as the C++ rss::convert reads it. */
  GetIData<T>(id: string): T;
  /** The file of an IData entry, which a view that watches its config watches (the browser game's: C++ reads an IData
   * once). */
  GetIDataFile(id: string): string | null;
  GetElementsList(id: string): ElementsListData | null;
  /** The file of an ElementsList entry, which the elements list watches (rss::convertFilepath). */
  GetElementsListFile(id: string): string | null;
  GetImage(id: string): RssImage | null;
  GetImageSequence(id: string): RssImageSequence | null;
  GetMovie(id: string): RssMovie | null;
  GetFont(id: string): RssFont | null;
  GetTextStyle(id: string): RssTextStyle | null;
  GetAudioEvent(id: string): RssAudioEvent | null;
  GetRtf(id: string): RssRtf | null;
  /** The pages of an RTF file, laid out by the backend. */
  LoadRtfLayout(file: string): Promise<RtfLayout>;
  /** The URL the browser loads a resource file from. */
  FileUrl(file: string): string;
  /** Reads a changed IData, view or descriptor file again (the browser's: C++ reads the file when it converts it, and
   * its descriptors once); false when it cannot be read, such as while it is half written. */
  ReloadFile(file: string): Promise<boolean>;
  /** Selects the entries of the language among those declared per language. */
  SetLanguage(language: string): void;
}

export const IResources = Interface<IResources>('IResources');
