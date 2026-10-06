// Workspace summaries for the dashboard charts. Everything is derived from the library scan and sync history.
import { ASSET_TYPES, time, typeNames } from './format';
import type { Activity, Asset, AssetStatus, AssetType } from './types';

export type Period = 'day' | 'week' | 'month' | 'all';
export const PERIODS: { id: Period; label: string; description: string }[] = [
  { id: 'day', label: '1D', description: 'last 24 hours' },
  { id: 'week', label: '1W', description: 'last 7 days' },
  { id: 'month', label: '1M', description: 'last 30 days' },
  { id: 'all', label: 'All', description: 'all recorded changes' },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MB = 1_048_576;

interface Buckets { start: number; size: number; count: number; label: (start: number) => string }

const hourLabel = (value: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value);
const dayLabel = (value: number) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
const modified = (asset: Asset) => Date.parse(asset.modifiedAt);

function buckets(period: Period, times: number[], now: number, count = 12): Buckets {
  if (period === 'day') {
    const hour = new Date(now).setMinutes(0, 0, 0);
    return { start: hour - 23 * HOUR, size: HOUR, count: 24, label: hourLabel };
  }
  if (period === 'week' || period === 'month') {
    const days = period === 'week' ? 7 : 30;
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    return { start: midnight - (days - 1) * DAY, size: DAY, count: days, label: dayLabel };
  }
  const start = Math.min(now, ...times);
  const span = Math.max(now - start, HOUR);
  return { start, size: span / count, count, label: span <= 2 * DAY ? hourLabel : dayLabel };
}

function index(range: Buckets, value: number) {
  const position = Math.floor((value - range.start) / range.size);
  if (position === range.count && value <= range.start + range.size * range.count) return range.count - 1;
  return position >= 0 && position < range.count ? position : -1;
}

const labels = (range: Buckets) => Array.from({ length: range.count }, (_, i) => range.label(range.start + i * range.size));

export interface Timeline { labels: string[]; changed: number[]; synced: number[] }

/** GDA files changed and files synced to the game, per time bucket of the period. */
export function timeline(assets: Asset[], activity: Activity[], period: Period, now = Date.now()): Timeline {
  const syncs = activity.filter(entry => entry.action === 'sync');
  const range = buckets(period, [...assets.map(modified), ...syncs.map(entry => Date.parse(entry.date))], now);
  const changed = new Array<number>(range.count).fill(0);
  const synced = new Array<number>(range.count).fill(0);
  for (const asset of assets) {
    const position = index(range, modified(asset));
    if (position >= 0) changed[position]++;
  }
  for (const entry of syncs) {
    const position = index(range, Date.parse(entry.date));
    if (position >= 0) synced[position] += entry.files.length;
  }
  return { labels: labels(range), changed, synced };
}

/** A sparkline over the whole modification history: each asset adds weight(asset) to its bucket. */
export function trend(assets: Asset[], weight: (asset: Asset) => number, cumulative = false, now = Date.now()): number[] {
  const range = buckets('all', assets.map(modified), now, 13);
  const values = new Array<number>(range.count).fill(0);
  for (const asset of assets) {
    const position = index(range, modified(asset));
    if (position >= 0) values[position] += weight(asset);
  }
  if (cumulative) for (let i = 1; i < values.length; i++) values[i] += values[i - 1];
  return values;
}

export interface Mix { labels: string[]; synced: number[]; pending: number[] }

/** Assets in sync and waiting for sync, per file format (the most common formats). */
export function formatMix(assets: Asset[], limit = 8): Mix {
  const groups = new Map<string, { synced: number; pending: number }>();
  for (const asset of assets) {
    const key = asset.extension.toUpperCase() || 'NONE';
    const group = groups.get(key) ?? { synced: 0, pending: 0 };
    if (asset.status === 'synced') group.synced++; else group.pending++;
    groups.set(key, group);
  }
  const sorted = [...groups].sort((a, b) => (b[1].synced + b[1].pending) - (a[1].synced + a[1].pending));
  const shown = sorted.slice(0, sorted.length > limit ? limit - 1 : limit);
  const rest = sorted.slice(shown.length);
  if (rest.length) {
    shown.push(['OTHER', rest.reduce((sum, [, group]) => ({ synced: sum.synced + group.synced, pending: sum.pending + group.pending }), { synced: 0, pending: 0 })]);
  }
  return { labels: shown.map(([key]) => key), synced: shown.map(([, group]) => group.synced), pending: shown.map(([, group]) => group.pending) };
}

export type StorageMetric = 'size' | 'files';
export interface Storage { labels: string[]; byStatus: Record<AssetStatus, number[]> }

export const topFolder = (asset: Asset) => (asset.path.includes('/') ? asset.path.split('/')[0] : 'Root');

/** Size (MB) or file count per top-level folder, split by sync status. */
export function folderStorage(assets: Asset[], metric: StorageMetric, limit = 8): Storage {
  const folders = new Map<string, Record<AssetStatus, number>>();
  for (const asset of assets) {
    const key = topFolder(asset);
    const totals = folders.get(key) ?? { synced: 0, modified: 0, new: 0 };
    totals[asset.status] += metric === 'size' ? asset.size / MB : 1;
    folders.set(key, totals);
  }
  const sum = (totals: Record<AssetStatus, number>) => totals.synced + totals.modified + totals.new;
  const sorted = [...folders].sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, limit);
  const series = (status: AssetStatus) => sorted.map(([, totals]) => Number(totals[status].toFixed(2)));
  return { labels: sorted.map(([key]) => key), byStatus: { synced: series('synced'), modified: series('modified'), new: series('new') } };
}

export interface FolderSummary { name: string; files: number; size: number; pending: number }

export function folderSummaries(assets: Asset[], limit = 5): FolderSummary[] {
  const folders = new Map<string, FolderSummary>();
  for (const asset of assets) {
    const name = topFolder(asset);
    const summary = folders.get(name) ?? { name, files: 0, size: 0, pending: 0 };
    summary.files++;
    summary.size += asset.size;
    if (asset.status !== 'synced') summary.pending++;
    folders.set(name, summary);
  }
  return [...folders.values()].sort((a, b) => b.size - a.size).slice(0, limit);
}

export interface Coverage { labels: string[]; synced: number[]; total: number[] }

/** Per asset type: files in sync against all files of that type. */
export function typeCoverage(assets: Asset[]): Coverage {
  const types: AssetType[] = [...ASSET_TYPES, ...(assets.some(asset => asset.type === 'other') ? ['other' as const] : [])];
  return {
    labels: types.map(type => typeNames[type]),
    synced: types.map(type => assets.filter(asset => asset.type === type && asset.status === 'synced').length),
    total: types.map(type => assets.filter(asset => asset.type === type).length),
  };
}

export interface FormatShare { format: string; files: number; share: number }

export function formatShares(assets: Asset[], limit = 4): FormatShare[] {
  const mix = formatMix(assets, limit);
  return mix.labels.map((format, i) => {
    const files = mix.synced[i] + mix.pending[i];
    return { format, files, share: assets.length ? Math.round(files / assets.length * 100) : 0 };
  });
}

export interface Series { labels: string[]; values: number[] }

/** Cumulative library size (MB) in modification order, reduced to at most `points` points. */
export function growth(assets: Asset[], points = 40): Series {
  const ordered = [...assets].sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
  let total = 0;
  const all = ordered.map(asset => ({ label: time(asset.modifiedAt), value: (total += asset.size) / MB }));
  const step = Math.max(1, Math.ceil(all.length / points));
  const kept = all.filter((_, i) => i % step === 0 || i === all.length - 1);
  return { labels: kept.map(point => point.label), values: kept.map(point => Number(point.value.toFixed(2))) };
}

/** Data copied by the most recent syncs, oldest first. */
export function syncHistory(activity: Activity[], limit = 7): Series & { files: number[] } {
  const syncs = activity.filter(entry => entry.action === 'sync').slice(0, limit).reverse();
  return {
    labels: syncs.map(entry => time(entry.date)),
    values: syncs.map(entry => Number(((entry.bytes ?? 0) / MB).toFixed(2))),
    files: syncs.map(entry => entry.files.length),
  };
}
