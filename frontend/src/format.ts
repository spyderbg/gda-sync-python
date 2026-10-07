import type { AssetCategory, AssetDeclaration, AssetSequence, AssetStatus, AssetType, PreviewFrame, ReportAsset, RssCategory, RssResource, RssRtfDirectory, RssSequence, RtfChange, RtfFacts } from './types';

export const ASSET_TYPES = ['texture', 'model', 'material', 'audio', 'font', 'rtf'] as const;
export const typeIcons: Record<AssetType, string> = {
  texture: 'mdi-image-outline', model: 'mdi-cube-outline', material: 'mdi-layers-outline', audio: 'mdi-waveform', font: 'mdi-format-font',
  rtf: 'mdi-book-open-page-variant-outline', other: 'mdi-file-outline',
};
export const typeNames: Record<AssetType, string> = {
  texture: 'Textures', model: 'Models', material: 'Materials', audio: 'Audio', font: 'Fonts', rtf: 'RTFs', other: 'Other files',
};
export const statusNames: Record<AssetStatus, string> = { new: 'New asset', modified: 'Modified', synced: 'In sync' };
export const statusBadges: Record<AssetStatus, string> = { new: 'badge-info', modified: 'badge-warning', synced: 'badge-success' };

export const plural = (count: number) => (count === 1 ? '' : 's');
export const number = (value: number) => value.toLocaleString();
export const percent = (part: number, whole: number) => (whole ? Math.round(part / whole * 100) : 0);

export function size(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function time(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];

export function ago(value: string, now = Date.now()) {
  const elapsed = new Date(value).getTime() - now;
  for (const [unit, length] of UNITS) {
    if (Math.abs(elapsed) >= length) return relative.format(Math.round(elapsed / length), unit);
  }
  return relative.format(0, 'minute');
}

// The asset types of the GDA sync report's files, grouped like ASSET_TYPES in egt_gda_sync/library.py.
const TYPE_EXTENSIONS: [AssetType, string[]][] = [
  ['texture', ['png', 'jpg', 'jpeg', 'webp', 'svg', 'dds', 'tga', 'bmp', 'exr', 'tif', 'tiff']],
  ['model', ['obj', 'fbx', 'glb', 'gltf', 'blend']],
  ['material', ['mat', 'mtl', 'material']],
  ['audio', ['wav', 'ogg', 'mp3', 'flac']],
  ['font', ['ttf', 'otf']],
  ['rtf', ['rtf']],
];
/** The image files the backend previews: DDS textures, which it decodes, and the formats a browser shows as they are. */
export const PREVIEW_EXTENSIONS = ['dds', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'bmp'];

export const extensionOf = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');
export const fileType = (extension: string): AssetType => TYPE_EXTENSIONS.find(([, extensions]) => extensions.includes(extension))?.[0] ?? 'other';
/** A path's file name and its folder, which is "Root" for a file at the top. */
export function splitPath(path: string) {
  const index = path.lastIndexOf('/');
  return { name: path.slice(index + 1), folder: index < 0 ? 'Root' : path.slice(0, index) };
}

/** Whether a row of the GDA sync report matches a lowercase search: its path, a GDA path, an image sequence's id or
 * frame paths, or the path of a file in an RTF's folder. */
export function rowMatches(row: RssResource, needle: string) {
  return !needle || row.resource.toLowerCase().includes(needle) || row.gdaFiles.some(file => file.path.toLowerCase().includes(needle)) ||
    !!row.sequence && (!!row.sequence.id?.toLowerCase().includes(needle) || row.sequence.paths.some(path => path.toLowerCase().includes(needle))) ||
    !!row.directory && row.directory.files.some(file => file.path.toLowerCase().includes(needle));
}

/** What syncing an RTF does to each of its files, by name and badge. */
export const rtfChangeNames: Record<RtfChange, string> = { identical: 'identical', changed: 'changed', added: 'only in the GDA', removed: 'only in the game' };
export const rtfChangeBadges: Record<RtfChange, string> = { identical: 'badge-success', changed: 'badge-danger', added: 'badge-info', removed: 'badge-warning' };
/** How many of an RTF's files syncing copies because they changed or only the GDA has them, and deletes because only the
 * game has them, for example "1 changed, 76 added, 12 deleted". */
export function rtfChangeSummary(directory: RssRtfDirectory) {
  const count = (change: RtfChange) => directory.files.filter(file => file.change === change).length;
  return [[count('changed'), 'changed'], [count('added'), 'added'], [count('removed'), 'deleted']]
    .filter(([value]) => value).map(([value, label]) => `${number(value as number)} ${label}`).join(', ');
}

/** What sequenceName and sequenceSummary read of a sequence of the GDA sync report or of the asset report. */
type SequenceTiming = Pick<RssSequence, 'id' | 'frameTime' | 'loopCount'> & { frames: unknown[] };

/** A sequence's id, or what a guessed one is. */
export const sequenceName = (sequence: Pick<RssSequence, 'id'>) => sequence.id ?? 'Guessed sequence';

/** How an image sequence plays, for example "71 frames · 42 ms · loops forever". */
export function sequenceSummary(sequence: SequenceTiming) {
  const count = sequence.frames.length;
  const loops = sequence.loopCount === 0 ? 'loops forever' : sequence.loopCount === 1 ? 'plays once' : `plays ${sequence.loopCount} times`;
  return `${number(count)} frame${plural(count)} · ${sequence.frameTime} ms · ${loops}`;
}

export const rssBadges: Record<RssCategory, string> = {
  identical: 'badge-success', different: 'badge-danger', missing: 'badge-warning', invalid: 'badge-dark', supplementary: 'badge-info',
};
export const assetBadges: Record<AssetCategory, string> = {
  available: 'badge-success', missing: 'badge-warning', invalid: 'badge-dark', supplementary: 'badge-info',
};

/** An asset report sequence's frames as SequencePreview plays them: each frame's file, when it exists. */
export const assetFrames = (sequence: AssetSequence): PreviewFrame[] => sequence.frames.map(frame => ({
  file: frame.category === 'available' || frame.category === 'supplementary' ? frame.resourcePath : null, source: frame.source,
}));

/** A descriptor entry that loads a file, for example "Image LOGO · RssImagesData.json:12", or "Font FONT_MAIN 25 px · …";
 * a GDA sync report from an earlier version knows only its descriptor and line. */
export const declarationLabel = (use: AssetDeclaration) => (use.type
  ? `${use.type}${use.id ? ` ${use.id}` : ''}${use.size ? ` ${use.size} px` : ''} · ${use.descriptor}:${use.line}`
  : `${use.descriptor}:${use.line}`);

/** Whether an asset matches a lowercase search: by its path, the sequence's id and paths, a declaring entry's id, or
 * the path of a file in an RTF's folder. */
export function assetMatches(row: ReportAsset, needle: string) {
  return !needle || row.resource.toLowerCase().includes(needle) || row.requiredBy.some(use => !!use.id?.toLowerCase().includes(needle)) ||
    !!row.sequence && row.sequence.paths.some(path => path.toLowerCase().includes(needle)) ||
    !!row.directory && row.directory.files.some(file => file.path.toLowerCase().includes(needle));
}

/** What applying a resource of the GDA sync report does: copy its GDA file over the game file, remove the descriptor
 * entries that declare it, or delete its game files. A missing resource, and an invalid one that only the workspace's
 * resource_paths declare, has none. */
export type ResourceAction = 'sync' | 'remove' | 'delete';
export function resourceAction(row: RssResource): ResourceAction | null {
  if (row.category === 'different') return row.gdaFiles.length ? 'sync' : null;
  if (row.category === 'invalid') return row.requiredBy.length ? 'remove' : null;
  return row.category === 'supplementary' ? 'delete' : null;
}
/** The one action of the given resources, "mixed" when they have several, or null when there are none. */
export function commonAction(rows: RssResource[]): ResourceAction | 'mixed' | null {
  const actions = new Set(rows.map(resourceAction));
  return actions.size > 1 ? 'mixed' : (rows.length ? resourceAction(rows[0]) : null);
}
export const resourceActionIcons: Record<ResourceAction | 'mixed', string> = {
  sync: 'mdi-sync', remove: 'mdi-playlist-remove', delete: 'mdi-delete-outline', mixed: 'mdi-playlist-check',
};

/** The folder of an absolute path the backend reported, keeping its native separators and a POSIX or Windows drive root. */
export function directoryOf(path: string) {
  const end = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return path.slice(0, end + (end === 0 || path[end - 1] === ':' ? 1 : 0));
}
/** The file name of an absolute path the backend reported, whatever its separators. */
export const baseName = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);

/** A sequence's frames as SequencePreview plays them: the game files, or each frame's matching or closest GDA file. */
export function previewFrames(sequence: RssSequence, side: 'game' | 'gda'): PreviewFrame[] {
  return sequence.frames.map(frame => ({
    file: side === 'gda' ? frame.gdaFiles[0]?.absolutePath ?? null : frame.category === 'invalid' ? null : frame.resourcePath,
    source: frame.source,
  }));
}

/** The preview of a file the GDA sync report names, by its absolute path; revision is the report it came from. */
export const reportPreviewURL = (file: string, revision: string) =>
  `/api/rss-sync/preview?file=${encodeURIComponent(file)}&v=${encodeURIComponent(revision)}`;


/** The page of an RTF that its preview shows first: the first page that has a background. */
export const firstRtfPage = (facts: RtfFacts) => Math.max(0, facts.pages.findIndex(page => page.found));

/** A code point as Unicode writes it, for example "U+20AC". */
export const codePoint = (point: number) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;

/** Whether a character is drawn: not a control character, a surrogate or an unassigned code point, as the backend checks
 * a Font entry's characters. */
const drawn = (point: number) => !/[\p{Cc}\p{Cs}\p{Cn}]/u.test(String.fromCodePoint(point));

/** The characters a Font entry declares, such as "[U+0020-U+00FF][U+20AC]", by range: a label, its first characters
 * that are drawn, up to limit, and how many it has in all. */
export function characterRanges(chars: string, limit = 96) {
  const ranges = [...chars.matchAll(/\[U\+([0-9A-Fa-f]{1,6})(?:-U\+([0-9A-Fa-f]{1,6}))?\]/g)].map(([, start, end]) => {
    const first = parseInt(start, 16);
    const last = parseInt(end ?? start, 16);
    return [Math.min(first, last), Math.min(Math.max(first, last), 0x10ffff)];
  });
  return ranges.map(([first, last]) => {
    const points: number[] = [];
    let count = 0;
    for (let point = first; point <= last; point++) {
      // Spaces are drawn, but show nothing.
      if (!drawn(point) || /\s/u.test(String.fromCodePoint(point))) continue;
      count++;
      if (points.length < limit) points.push(point);
    }
    return { label: first === last ? codePoint(first) : `${codePoint(first)}–${codePoint(last)}`, points, count };
  }).filter(range => range.count);
}
