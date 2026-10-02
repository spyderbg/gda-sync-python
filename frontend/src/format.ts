import type { Asset, AssetStatus, AssetType } from './types';

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

export const previewURL = (asset: Asset, revision: string) =>
  `/api/assets/${asset.id}/preview?v=${encodeURIComponent(asset.modifiedAt)}&scan=${encodeURIComponent(revision)}`;
