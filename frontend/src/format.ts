import { AudioLines, Box, File, Image, Layers, type LucideIcon } from '@lucide/vue';
import type { Asset, AssetStatus, AssetType } from './types';

export const ASSET_TYPES = ['texture', 'model', 'material', 'audio'] as const;
export const typeIcons: Record<AssetType, LucideIcon> = { texture: Image, model: Box, material: Layers, audio: AudioLines, other: File };
export const typeNames: Record<AssetType, string> = { texture: 'Textures', model: 'Models', material: 'Materials', audio: 'Audio', other: 'Other files' };
export const statusNames: Record<AssetStatus, string> = { new: 'New asset', modified: 'Modified', synced: 'In sync' };

export const plural = (count: number) => (count === 1 ? '' : 's');

export function size(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function time(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export const previewURL = (asset: Asset, revision: string) =>
  `/api/assets/${asset.id}/preview?v=${encodeURIComponent(asset.modifiedAt)}&scan=${encodeURIComponent(revision)}`;
