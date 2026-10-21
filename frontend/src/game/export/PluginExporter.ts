// Exports the browser game as its whole C++ plugin, by the paths in the games folder (game/..., configs/...), so that
// copying the export over the games folder gives the game the browser plays:
//
// - generated: what the browser game writes from its own definition (CppExporter.ts): the state machine, the math
//   module, the view module, the modules config;
// - copied: the plugin's other C++ sources (its views, visuals, software buttons, info and topper modules...) as they are
//   in the C++ game sources, which the backend copies;
// - updated: C++ that changes of the browser game need (export/cpp, by their paths in games/game), in place of the C++
//   game sources' files, such as a fix of a states library state;
// - translated: states, views, visuals and software buttons whose TypeScript changed in the browser since they were
//   ported, and new ones, which the translator (export/translator) writes as C++ (through the backend); a view
//   translates with the visuals it uses and the other views that use them (TranslationClosure);
// - skeletons: views the browser game made that the translator could not translate (ViewSkeleton.ts).
//
// The TypeScript ports C++ (PortManifest.json): a ported file that changed in the browser since, which the export does
// not generate, update or translate, is listed in the README as C++ to update, with why it was not translated.

import { GameBackend } from '@game/app/GameBackend';
import { type CppExportInput, ExportCpp } from './CppExporter';
import PortManifest from './PortManifest.json';
import { ViewSkeleton } from './ViewSkeleton';

interface PortEntry {
  cpp: string[];
  sha256: string;
}

const MANIFEST = PortManifest as Record<string, PortEntry>;
/** The updated C++, by its path in games/game. */
const UPDATED_CPP = Object.fromEntries(Object.entries(import.meta.glob('./cpp/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
  .map(([path, text]) => [path.slice('./cpp/'.length), text]));
/** The TypeScript of the game, loaded when an export compares it. */
const SOURCES = import.meta.glob(['../alpha_family/**/*.ts', '../plugins/**/*.ts'], { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

/** The TypeScript of a folder of the game, by path. */
async function LoadSources(folder: string) {
  const sources = new Map<string, string>();
  for (const [path, load] of Object.entries(SOURCES)) if (path.startsWith(`../${folder}`)) sources.set(path.slice(3), await load());
  return sources;
}

/** The files a TypeScript file imports, by path. */
function ImportsOf(path: string, text: string) {
  const folder = path.split('/').slice(0, -1);
  return [...text.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(match => {
    const parts = [...folder];
    for (const part of match[1].split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return `${parts.join('/')}.ts`;
  });
}

/** The files to translate: those given, and, as a view translated from TypeScript calls the TypeScript visuals' API,
 * the visuals of the view module they use and the views that use those visuals, so that they compile together. The
 * module's BaseVisual is C++'s (the same API), and the view module itself is generated. */
export function TranslationClosure(files: string[], viewModule: string, sources: Map<string, string>) {
  const result = new Set(files);
  const isVisual = (path: string) => path.startsWith(`${viewModule}Visuals/`) && !path.endsWith('/BaseVisual.ts') && !path.endsWith('.data.ts');
  const isClass = (path: string) => path.startsWith(viewModule) && !path.endsWith('.data.ts') && !path.endsWith('/BaseVisual.ts')
    && /^(Views|Visuals|SwButtons)\//.test(path.slice(viewModule.length)) && /\bexport (abstract )?class\b/.test(sources.get(path) ?? '');
  for (let size = -1; size !== result.size;) {
    size = result.size;
    for (const path of [...result]) for (const imported of ImportsOf(path, sources.get(path) ?? '')) if (isVisual(imported)) result.add(imported);
    const visuals = [...result].filter(isVisual);
    for (const [path, text] of sources) if (isClass(path) && ImportsOf(path, text).some(imported => visuals.includes(imported))) result.add(path);
  }
  return [...result];
}

/** The C++ path, without .h or .cpp, that a TypeScript file ports (translate.mjs's CppPathOf). */
function CppPathOf(tsPath: string) {
  const path = tsPath.replace(/\.ts$/, '');
  const plugin = /^alpha_family\/plugins\/([^/]+)\/(.+)$/.exec(path);
  if (plugin) return `alpha_family/plugins/${plugin[1]}/src/Egt/${plugin[2]}`;
  if (path.startsWith('alpha_family/libs/')) return `alpha_family/libs/src/Egt/${path.slice('alpha_family/libs/'.length)}`;
  if (path.startsWith('plugins/')) return `plugins/src/Egt/${path.slice('plugins/'.length)}`;
  return null;
}

async function Sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface PluginExport {
  files: Record<string, string>;
  /** An export path to its path in the C++ game sources. */
  copies: Record<string, string>;
  report: {
    generated: string[];
    copied: string[];
    updated: string[];
    skeletons: string[];
    /** States translated from the TypeScript: their TypeScript and C++. */
    translated: { ts: string; cpp: string[] }[];
    /** Ported TypeScript that changed in the browser, and the C++ it ports, and why it was not translated. */
    changed: { ts: string; cpp: string[]; reason?: string }[];
    /** The game's TypeScript that ports nothing in C++ (besides the browser game's own, such as the math description). */
    unported: string[];
  };
}

export interface PluginExportOptions {
  /** Translates every view, visual and software button of the game's view module, and the info and topper modules'
   * views, from their TypeScript, not only those changed in the browser: the plugin's C++ views then follow the browser's. */
  translateAllViews?: boolean;
}

export async function ExportPlugin(input: CppExportInput, token: string, options: PluginExportOptions = {}): Promise<PluginExport> {
  const { gameName, plugin } = input;
  const generated = ExportCpp(input);
  const files: Record<string, string> = { ...generated };
  const copies: Record<string, string> = {};
  const pluginFolder = `alpha_family/plugins/${plugin}`;
  const pluginSources = await GameBackend.CppFiles(pluginFolder);
  for (const source of pluginSources.files) if (!(`game/${source}` in files)) copies[`game/${source}`] = source;

  const updated: string[] = [];
  for (const [path, text] of Object.entries(UPDATED_CPP)) {
    files[`game/${path}`] = text;
    delete copies[`game/${path}`];
    updated.push(`game/${path}`);
    // An updated source comes with its header, which it includes as "Name.h", so that the export compiles as it is.
    const header = path.replace(/\.cpp$/, '.h');
    if (header !== path && !(header in UPDATED_CPP)) copies[`game/${header}`] = header;
  }

  // Views the browser game made, which the C++ plugin does not have.
  const viewModuleName = `${gameName}View`;
  const skeletons: string[] = [];
  const existing = new Set(pluginSources.files);
  for (const view of input.viewGroups.flatMap(group => group.views)) {
    const folder = view.endsWith('SwButtonView') ? 'SwButtons' : 'Views';
    if (existing.has(`${pluginFolder}/src/Egt/${viewModuleName}/${folder}/${view}.h`)) continue;
    const tsPath = `alpha_family/plugins/${plugin}/${viewModuleName}/${folder}/${view}.ts`;
    const tsSource = await SOURCES[`../${tsPath}`]?.() ?? '';
    for (const [path, text] of Object.entries(ViewSkeleton({ viewModule: viewModuleName, folder, className: view, tsPath, tsSource }))) {
      files[`game/${pluginFolder}/src/Egt/${path}`] = text;
      skeletons.push(`game/${pluginFolder}/src/Egt/${path}`);
    }
  }

  // Ported TypeScript that changed since it was ported.
  const changed: { ts: string; cpp: string[] }[] = [];
  for (const [ts, entry] of Object.entries(MANIFEST)) {
    const load = SOURCES[`../${ts}`];
    const text = load ? await load() : null;
    if (text !== null && await Sha256(text) === entry.sha256) continue;
    // C++ that the export generates or updates follows the TypeScript already.
    if (entry.cpp.some(cpp => cpp in UPDATED_CPP || `game/${cpp}` in generated)) continue;
    changed.push({ ts, cpp: entry.cpp });
  }
  let unported = Object.keys(SOURCES).map(path => path.slice(3))
    .filter(ts => ts.startsWith(`alpha_family/plugins/${plugin}/`) && !(ts in MANIFEST) && !ts.endsWith('.description.ts'))
    .filter(ts => !skeletons.some(path => path.endsWith(`/${ts.split('/').pop()!.replace(/\.ts$/, '.h')}`)));

  // The changed TypeScript and the new, translated: what is a state comes as C++ (a view or a rule does not yet)
  const newFiles = Object.keys(SOURCES).map(path => path.slice(3)).filter(ts => ts.startsWith('alpha_family/') && !(ts in MANIFEST) && !ts.endsWith('.data.ts')
    && !ts.endsWith('.description.ts') && !ts.endsWith('.bridge.ts'));
  const viewModule = `alpha_family/plugins/${plugin}/${gameName}View/`;
  const viewSources = await LoadSources(viewModule);
  const allViews = options.translateAllViews ? [...viewSources.keys()].filter(path => /^(Views|Visuals|SwButtons)\//.test(path.slice(viewModule.length))
    && !path.endsWith('.data.ts') && !path.endsWith('/BaseVisual.ts') && /\bexport (abstract )?class\b/.test(viewSources.get(path) ?? '')) : [];
  // and the views of the info and topper modules (InfoView, TopperView; their modules are C++'s)
  if (options.translateAllViews) {
    for (const module of [`${gameName}InfoView`, `${gameName}TopperView`]) {
      for (const [path, text] of await LoadSources(`alpha_family/plugins/${plugin}/${module}/`)) if (/\bextends BaseView\b/.test(text)) allViews.push(path);
    }
  }
  const candidates = TranslationClosure([...changed.map(item => item.ts), ...newFiles, ...allViews], viewModule, viewSources);
  const translated: { ts: string; cpp: string[] }[] = [];
  if (candidates.length) {
    // without the translator (a packaged app has no sources or Node.js), what changed is C++ to update by hand
    let result: { files: Record<string, string>; errors: Record<string, string> };
    try {
      result = await GameBackend.Translate(candidates, token);
    } catch (failure) {
      result = { files: {}, errors: Object.fromEntries(candidates.map(ts => [ts, (failure as Error).message])) };
    }
    for (const [path, text] of Object.entries(result.files)) files[`game/${path}`] = text;
    for (const ts of candidates) {
      const cpp = Object.keys(result.files).filter(path => path.startsWith(CppPathOf(ts) ?? '\0'));
      if (cpp.length) translated.push({ ts, cpp });
    }
    changed.splice(0, changed.length, ...changed.filter(item => !translated.some(done => done.ts === item.ts))
      .map(item => ({ ...item, reason: result.errors[item.ts] })));
    unported = unported.filter(ts => !translated.some(done => done.ts === ts));
  }

  // translated C++ is not copied from the C++ game sources, and replaces a new view's skeleton
  for (const item of translated) for (const cpp of item.cpp) delete copies[`game/${cpp}`];
  const translatedPaths = new Set(translated.flatMap(item => item.cpp.map(cpp => `game/${cpp}`)));
  skeletons.splice(0, skeletons.length, ...skeletons.filter(path => !translatedPaths.has(path)));
  const report = {
    generated: Object.keys(generated).sort(), copied: Object.keys(copies).sort(), updated: updated.sort(), skeletons: skeletons.sort(),
    translated, changed, unported,
  };
  files['README.md'] = Readme(gameName, report);
  // what the export left to update by hand, for an agent to port (export-agent.mjs): with the TypeScript as it was ported
  files['export.json'] = `${JSON.stringify({ game: gameName, plugin, changed: changed.map(item => ({ ...item, sha256: MANIFEST[item.ts]?.sha256 ?? null })) }, null, 1)}\n`;
  return { files, copies, report };
}

function Readme(gameName: string, report: PluginExport['report']) {
  const list = (paths: string[]) => (paths.length ? paths.map(path => `- \`${path}\``).join('\n') : '- none');
  return `# ${gameName}, exported from the browser game

The game's whole plugin and modules config, by their paths in the games folder: copy \`game/\` and \`configs/\` over
\`games/game\` and \`games/configs\`.

## Generated from the browser game (${report.generated.length})

The state machine (\`CreateBuilder()\` from the machine's tree), the math module (\`MathRules.cpp\` from the game's math
description, the math file's structs from its JSON), the view module (\`CreateViews()\` from its views) and the modules
config.

${list(report.generated)}

## Updated for changes of the browser game (${report.updated.length})

C++ that the browser game's changes need, in place of the C++ game sources' files (\`frontend/src/game/export/cpp\`).

${list(report.updated)}

## Translated from the browser's TypeScript (${report.translated.length})

States, views, visuals and software buttons changed or made in the browser, translated to C++
(frontend/src/game/export/translator), with the visuals a translated view uses and the views that use those: they
compile against the C++ game sources' headers and each other's; review them as any change.

${report.translated.length ? report.translated.map(item => `- \`frontend/src/game/${item.ts}\`: ${item.cpp.map(cpp => `\`game/${cpp}\``).join(', ')}`).join('\n') : '- none'}

## New views, as skeletons (${report.skeletons.length})

Views the browser game made that the C++ game does not have: each loads its elements list and compiles; port the rest
from its TypeScript.

${list(report.skeletons)}

## To update by hand (${report.changed.length})

TypeScript changed in the browser since it was ported, whose C++ is not updated:

${report.changed.length ? report.changed.map(item => `- \`frontend/src/game/${item.ts}\`: ${item.cpp.map(cpp => `\`game/${cpp}\``).join(', ')}${item.reason ? `\n  (not translated: ${item.reason.split('\n')[0]})` : ''}`).join('\n') : '- none'}

TypeScript of the game that ports no C++ file:

${list(report.unported.map(ts => `frontend/src/game/${ts}`))}

## Copied from the C++ game sources (${report.copied.length})

The plugin's other sources, as they are: the browser game's TypeScript of the same names ports them.

${list(report.copied)}
`;
}
