// The backend endpoints the browser game uses for every file operation: the game project (modules config and
// descriptors), its JSON data (math, view configs, views), its images, audio and fonts (the asset library's preview),
// the asset report the asset library lists, and the export of generated files.

import type { RtfLayout } from '@game/engine/GameVideoCtrl/Rtf/RtfLayout';
import type { RssDescriptors } from '@game/engine/Game/RuntimeExport/IResources';

export interface GameProjectModule {
  name: string;
  space?: string;
  header?: string;
  config?: Record<string, unknown>;
  initAfter?: string[];
}

export interface GameModulesConfig {
  file: string;
  config: { plugins?: string[]; modules: GameProjectModule[] };
}

export interface GameProject {
  workspace: { id: string; name: string };
  gamePath: string;
  resourcesPath: string;
  modules: GameModulesConfig | null;
  /** The modules config of the game's family (configs/alpha_family/modules/AlphaGameModules.json). */
  familyModules: GameModulesConfig | null;
  /** The C++ game sources (games/game), which an export copies the plugin's sources from. */
  cppPath: string;
  descriptors: RssDescriptors;
  /** The descriptor files (AllRssData.json, RssImagesData.json...), by their paths relative to the game folder. */
  descriptorFiles?: string[];
  errors: string[];
}

/** The assets of the asset report that matter to the game: the files that exist. */
export interface GameAssetReport {
  assets: { status: string; resourcePath: string; type: string; sequence?: { frames: { resourcePath: string; status: string }[] } | null }[];
}

async function getJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${url}: not JSON (${response.status})`);
  }
  if (!response.ok) throw new Error((body as { error?: string }).error || `${url}: ${response.status}`);
  return body as T;
}

export const GameBackend = {
  Project: () => getJSON<GameProject>('/api/game/project'),
  AssetReport: () => getJSON<GameAssetReport>('/api/asset-report'),
  /** A JSON file of the game, by its path relative to the game folder. */
  Data: <T>(path: string) => getJSON<T>(`/api/game/data?file=${encodeURIComponent(path)}`),
  /** When each file of the game's resources last changed (null: missing), by its path relative to the game folder. */
  FileStamps: (files: string[]) =>
    getJSON<{ stamps: Record<string, string | null> }>(`/api/game/file-stamps?${files.map(file => `file=${encodeURIComponent(file)}`).join('&')}`),
  /** The URL of a resource file: images (DDS decoded to PNG), audio and fonts. */
  FileUrl: (file: string) => `/api/rss-sync/preview?file=${encodeURIComponent(file)}`,
  /** The pages of an RTF, laid out (the asset library's RTF preview). */
  RtfLayout: (file: string) => getJSON<RtfLayout>(`/api/rss-sync/preview?file=${encodeURIComponent(file)}`),

  /** The C++ sources in a folder of the C++ game sources (games/game), by their paths in them. */
  CppFiles: (folder: string) => getJSON<{ root: string; folder: string; exists: boolean; files: string[] }>(`/api/game/cpp?folder=${encodeURIComponent(folder)}`),

  /** The C++ of TypeScript states (the translator): {files: {C++ path in games/game: text}, errors: {TypeScript path: why}}. */
  async Translate(files: string[], token: string): Promise<{ files: Record<string, string>; errors: Record<string, string> }> {
    const response = await fetch('/api/game/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gda-token': token }, body: JSON.stringify({ files }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Translation failed');
    return body;
  },

  /** Writes an export: the files, and copies of C++ sources (an export path to its path in the C++ game sources). */
  async Export(name: string, files: Record<string, string>, token: string, copies: Record<string, string> = {}): Promise<{ folder: string; files: string[] }> {
    const response = await fetch('/api/game/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gda-token': token }, body: JSON.stringify({ name, files, copies }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Export failed');
    return body;
  },
};
