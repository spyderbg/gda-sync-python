// Chart configurations with the colors, gradients and axes of the StarAdmin dashboard charts.
import type { ChartConfiguration, ScriptableContext } from 'chart.js';
import type { Coverage, Mix, Series, Storage, StorageMetric, Timeline } from '../insights';
import type { RssSyncCount, RssSyncSummary } from '../types';
import { type ThemeColor, themeColor } from './chartjs';

type Stops = [number, string][];

function vertical(stops: Stops) {
  return (context: ScriptableContext<'line'>) => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return 'transparent';
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  };
}

function diagonal(stops: Stops) {
  return (context: ScriptableContext<'line'>) => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return 'transparent';
    const gradient = ctx.createLinearGradient(chartArea.left, chartArea.bottom, chartArea.right, chartArea.top);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  };
}

const hidden = { x: { display: false }, y: { display: false } };
const megabytes = (value: number) => `${value.toFixed(value < 10 ? 2 : 1)} MB`;

/** The small trend lines of the statistics card. */
export function sparkline(values: number[]): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{
        data: values, borderColor: '#6d7cfc', borderWidth: 3, fill: true, pointRadius: 0, tension: 0,
        backgroundColor: vertical([[0, 'rgba(131, 144, 255, 0.5)'], [1, '#fff']]),
      }],
    },
    options: { animation: false, events: [], scales: hidden, plugins: { tooltip: { enabled: false } } },
  };
}

/** GDA changes and synced files over time ("Sales Statistics Overview"). */
export function overview(series: Timeline): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Changed in GDA', data: series.changed, borderColor: themeColor('info'), borderWidth: 2, fill: true,
        backgroundColor: vertical([[0, 'rgba(102, 78, 235, 0.2)'], [1, 'rgba(255, 255, 255, 0)']]),
      }, {
        label: 'Synced to Game', data: series.synced, borderColor: themeColor('success'), borderWidth: 2, fill: true,
        backgroundColor: vertical([[0, '#14c671'], [1, 'rgba(255, 255, 255, 0.01)']]),
      }],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 3, backgroundColor: '#fff' }, line: { tension: 0 } },
      scales: {
        x: { display: false },
        y: { beginAtZero: true, grace: '15%', ticks: { precision: 0, maxTicksLimit: 5 }, grid: { color: '#e2e6ec' }, border: { display: false } },
      },
    },
  };
}

/** Assets in sync and waiting, per file format ("Net Profit Margin"). */
export function formatRadar(mix: Mix): ChartConfiguration<'radar'> {
  const area = (label: string, data: number[], color: string) => ({
    label, data, backgroundColor: color, borderColor: color, borderWidth: 0, fill: true,
    pointRadius: 0, pointBorderWidth: 0, pointBackgroundColor: color, pointHoverRadius: 6, pointHitRadius: 5,
  });
  return {
    type: 'radar',
    data: { labels: mix.labels, datasets: [area('In sync', mix.synced, 'rgba(88, 208, 222, 0.8)'), area('Needs sync', mix.pending, 'rgba(150, 77, 247, 1)')] },
    options: {
      scales: {
        r: {
          beginAtZero: true, ticks: { display: false, precision: 0 }, pointLabels: { font: { size: 14 } },
          angleLines: { color: '#e9ebf1' }, grid: { color: '#e9ebf1' },
        },
      },
    },
  };
}

/** Cumulative library size ("Total Revenue"). */
export function growthArea(series: Series): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{ label: 'Library size', data: series.values, borderColor: '#9b86f1', backgroundColor: '#f2f2ff', borderWidth: 3, fill: 'origin', pointRadius: 0, tension: 0 }],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: hidden,
      plugins: { tooltip: { callbacks: { label: context => megabytes(context.parsed.y ?? 0) } } },
    },
  };
}

/** Data copied by recent syncs ("Transaction"). */
export function copiedArea(series: Series): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Copied', data: series.values, backgroundColor: diagonal([[0, '#fa5539'], [1, '#fa3252']]), borderColor: '#fa394e',
        borderWidth: 0, fill: true, tension: 0.4, pointBackgroundColor: '#fa394e', pointRadius: 7, pointBorderWidth: 3,
        pointBorderColor: '#fff', pointHoverRadius: 7, pointHitRadius: 7,
      }],
    },
    options: {
      layout: { padding: { top: 10 } },
      scales: { x: { display: false, offset: false }, y: { display: false, beginAtZero: true } },
      plugins: { tooltip: { callbacks: { label: context => megabytes(context.parsed.y ?? 0) } } },
    },
  };
}

export const STORAGE_COLORS = { synced: '#826af9', modified: '#9e86ff', new: '#d0aeff' };

/** Stacked size or file count per folder and status ("Market Overview"). */
export function storageBars(storage: Storage, metric: StorageMetric): ChartConfiguration<'bar'> {
  const bar = (label: string, data: number[], color: string) => ({ label, data, backgroundColor: color, borderWidth: 0, maxBarThickness: 36 });
  return {
    type: 'bar',
    data: {
      labels: storage.labels,
      datasets: [
        bar('In sync', storage.byStatus.synced, STORAGE_COLORS.synced),
        bar('Modified', storage.byStatus.modified, STORAGE_COLORS.modified),
        bar('New', storage.byStatus.new, STORAGE_COLORS.new),
      ],
    },
    options: {
      layout: { padding: { top: 20 } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, ticks: { color: '#212529' }, grid: { color: '#e9ebf1' } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#212529', maxTicksLimit: 5, precision: metric === 'files' ? 0 : undefined }, grid: { display: false } },
      },
      plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ${metric === 'size' ? megabytes(context.parsed.y ?? 0) : context.parsed.y}` } } },
    },
  };
}

/** Files in sync drawn over all files of each type ("Website Audience Metrics"). */
export function coverageBars(coverage: Coverage): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: coverage.labels,
      datasets: [
        { label: 'In sync', data: coverage.synced, backgroundColor: '#0f5bff', borderWidth: 0, barPercentage: 0.5 },
        { label: 'All files', data: coverage.total, backgroundColor: '#e5e9f2', borderWidth: 0, barPercentage: 0.5 },
      ],
    },
    options: {
      layout: { padding: { right: 10 } },
      interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: true, display: false }, y: { display: false, beginAtZero: true } },
    },
  };
}

/** A half-circle gauge of the share of files in sync. */
export function gauge(percentInSync: number): ChartConfiguration<'doughnut'> {
  return {
    type: 'doughnut',
    data: { labels: ['In sync', 'Needs sync'], datasets: [{ data: [percentInSync, 100 - percentInSync], backgroundColor: [themeColor('success'), '#e5e9f2'], borderWidth: 0 }] },
    options: { rotation: -90, circumference: 180, cutout: '78%', events: [], plugins: { tooltip: { enabled: false } } },
  };
}

/** The results of recent GDA sync runs, oldest first, stacked by category, for the sync history page. */
export function syncRunBars(runs: { label: string; summary: RssSyncSummary }[]): ChartConfiguration<'bar'> {
  const results: [string, RssSyncCount, ThemeColor][] = [
    ['In sync', 'identical', 'success'], ['Missing', 'missing', 'warning'], ['Different', 'different', 'danger'], ['Invalid', 'invalid', 'dark'],
  ];
  return {
    type: 'bar',
    data: {
      labels: runs.map(run => run.label),
      datasets: results.map(([label, key, color]) => ({
        label, data: runs.map(run => run.summary[key]), backgroundColor: themeColor(color), borderWidth: 0, maxBarThickness: 28,
      })),
    },
    options: {
      scales: {
        x: { stacked: true, ticks: { display: false }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { maxTicksLimit: 4 }, grid: { color: '#e9ebf1' }, border: { display: false } },
      },
    },
  };
}
