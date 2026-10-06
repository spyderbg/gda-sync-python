import type { Asset, AssetStatus, AssetType, RssResource, RssSequence } from './types';

export const ASSET_TYPES = ['texture', 'model', 'material', 'audio'] as const;
export const typeIcons: Record<AssetType, string> = {
  texture: 'mdi-image-outline', model: 'mdi-cube-outline', material: 'mdi-layers-outline', audio: 'mdi-waveform', other: 'mdi-file-outline',
};
export const typeNames: Record<AssetType, string> = { texture: 'Textures', model: 'Models', material: 'Materials', audio: 'Audio', other: 'Other files' };
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

/** Whether a row of the GDA sync report matches a lowercase search: its path, a GDA path, or an image sequence's id or
 * frame paths. */
export function rowMatches(row: RssResource, needle: string) {
  return !needle || row.resource.toLowerCase().includes(needle) || row.gdaFiles.some(file => file.path.toLowerCase().includes(needle)) ||
    !!row.sequence && (!!row.sequence.id?.toLowerCase().includes(needle) || row.sequence.paths.some(path => path.toLowerCase().includes(needle)));
}

/** A sequence's id, or what a guessed one is. */
export const sequenceName = (sequence: RssSequence) => sequence.id ?? 'Guessed sequence';

/** How an image sequence plays, for example "71 frames · 42 ms · loops forever". */
export function sequenceSummary(sequence: RssSequence) {
  const count = sequence.frames.length;
  const loops = sequence.loopCount === 0 ? 'loops forever' : sequence.loopCount === 1 ? 'plays once' : `plays ${sequence.loopCount} times`;
  return `${number(count)} frame${plural(count)} · ${sequence.frameTime} ms · ${loops}`;
}

/** The preview of a file the GDA sync report names, by its absolute path; revision is the report it came from. */
export const reportPreviewURL = (file: string, revision: string) =>
  `/api/rss-sync/preview?file=${encodeURIComponent(file)}&v=${encodeURIComponent(revision)}`;

export const previewURL = (asset: Asset, revision: string) =>
  `/api/assets/${asset.id}/preview?v=${encodeURIComponent(asset.modifiedAt)}&scan=${encodeURIComponent(revision)}`;
