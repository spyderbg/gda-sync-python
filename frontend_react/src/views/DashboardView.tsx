import { useEffect, useMemo, useState } from 'react';
import { themeColor } from '../charts/chartjs';
import { STORAGE_COLORS, copiedArea, coverageBars, formatRadar, gauge, growthArea, overview, sparkline, storageBars } from '../charts/configs';
import { classes } from '../classes';
import BaseDropdown from '../components/BaseDropdown';
import ChartCanvas from '../components/ChartCanvas';
import ChartLegend from '../components/ChartLegend';
import StatusBadge from '../components/StatusBadge';
import { ago, number, percent, plural, size, time } from '../format';
import {
  PERIODS, folderStorage, folderSummaries, formatMix, formatShares, growth, syncHistory, timeline, trend, typeCoverage, type Period, type StorageMetric,
} from '../insights';
import type { AssetStatus, DashboardAsset, DashboardResponse } from '../types';
import { inspect, navigate, selectWorkspace, store, useWorkspace } from '../workspace';

const radarLegend = [{ label: 'In sync', color: 'rgba(88, 208, 222, 0.8)' }, { label: 'Needs sync', color: 'rgba(150, 77, 247, 1)' }];
const storageLegend = [
  { label: 'In sync', color: STORAGE_COLORS.synced }, { label: 'Modified', color: STORAGE_COLORS.modified }, { label: 'New', color: STORAGE_COLORS.new },
];
const avatarColors = ['bg-warning', 'bg-success', 'bg-info', 'bg-primary'];
const byModified = (a: { modifiedAt: string }, b: { modifiedAt: string }) => b.modifiedAt.localeCompare(a.modifiedAt);
const assetKey = (asset: DashboardAsset) => `${asset.workspaceId}:${asset.id}`;

export default function DashboardView() {
  const { busy, config, data } = useWorkspace();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<StorageMetric>('size');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    void (async () => {
      try {
        const response = await fetch('/api/dashboard', { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Request failed');
        if (!controller.signal.aborted) setDashboard(body);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [data, reload]);

  const assets = useMemo(() => dashboard?.assets ?? [], [dashboard]);
  const pending = useMemo(() => assets.filter(asset => asset.status !== 'synced'), [assets]);
  const syncedCount = assets.length - pending.length;
  const totalSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.size, 0), [assets]);
  const formats = useMemo(() => new Set(assets.map(asset => asset.extension)), [assets]);
  const countStatus = (status: AssetStatus) => assets.filter(asset => asset.status === status).length;

  async function inspectAsset(asset: DashboardAsset) {
    if (busy) return;
    const active = () => store.data?.config.defaultWorkspace || 'current';
    if (asset.workspaceId !== (config.defaultWorkspace || 'current')) await selectWorkspace(asset.workspaceId);
    if (asset.workspaceId === active()) inspect(asset);
  }

  const activity = useMemo(() => dashboard?.activity ?? [], [dashboard]);
  const syncs = useMemo(() => activity.filter(entry => entry.action === 'sync'), [activity]);
  const lastSync = syncs[0];
  const inSyncPercent = percent(syncedCount, assets.length);
  const sizeOf = (status: 'synced' | 'pending') => assets
    .filter(asset => (asset.status === 'synced') === (status === 'synced'))
    .reduce((sum, asset) => sum + asset.size, 0);

  const stats = useMemo(() => [
    {
      value: number(assets.length), label: 'Total assets', values: trend(assets, () => 1, true),
      detail: `${formats.size} format${plural(formats.size)}`,
    },
    {
      value: number(pending.length), label: 'Needs sync', values: trend(assets, asset => Number(asset.status !== 'synced'), true),
      detail: `${number(countStatus('new'))} new · ${number(countStatus('modified'))} modified`,
    },
    {
      value: number(syncedCount), label: 'In sync', values: trend(assets, asset => Number(asset.status === 'synced'), true),
      detail: `${inSyncPercent}% of library`,
    },
    {
      value: size(totalSize), label: 'Library size', values: trend(assets, asset => asset.size, true),
      detail: `${size(sizeOf('pending'))} to copy`,
    },
  ].map(stat => ({ ...stat, chart: sparkline(stat.values) })), [assets, formats, pending, syncedCount, totalSize, inSyncPercent]);

  const series = useMemo(() => timeline(assets, activity, period), [assets, activity, period]);
  const changedInPeriod = useMemo(() => series.changed.reduce((sum, value) => sum + value, 0), [series]);
  const syncedInPeriod = useMemo(() => series.synced.reduce((sum, value) => sum + value, 0), [series]);
  const overviewChart = useMemo(() => overview(series), [series]);
  const overviewLegend = useMemo(() => [{ label: 'Changed in GDA', color: themeColor('info') }, { label: 'Synced to Game', color: themeColor('success') }], []);

  const radarChart = useMemo(() => formatRadar(formatMix(assets)), [assets]);
  const growthChart = useMemo(() => growthArea(growth(assets)), [assets]);
  const copiedBytes = useMemo(() => syncs.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0), [syncs]);
  const copiedChart = useMemo(() => {
    const history = syncHistory(activity);
    // A single sync still draws an area, rising from zero.
    return history.values.length === 1 ? copiedArea({ labels: ['', ...history.labels], values: [0, ...history.values] }) : copiedArea(history);
  }, [activity]);

  const storageChart = useMemo(() => storageBars(folderStorage(assets, metric), metric), [assets, metric]);
  const coverageChart = useMemo(() => coverageBars(typeCoverage(assets)), [assets]);
  const gaugeChart = useMemo(() => gauge(inSyncPercent), [inSyncPercent]);
  const waiting = useMemo(() => [...pending].sort(byModified).slice(0, 5), [pending]);
  const largest = useMemo(() => [...assets].sort((a, b) => b.size - a.size).slice(0, 4), [assets]);
  const recent = useMemo(() => [...assets].sort(byModified).slice(0, 4), [assets]);
  const formatRows = useMemo(() => formatShares(assets), [assets]);
  const folderRows = useMemo(() => folderSummaries(assets), [assets]);

  return (
    <>
      <section className="card grid-margin dashboard-guide" aria-labelledby="dashboard-guide-title">
        <div className="card-body">
          <h2 id="dashboard-guide-title">Keep game resources in sync with the GDA</h2>
          <p className="text-muted">EGT GDA Sync compares game resources with their GDA folders and helps you copy updated GDA files into each game's folder. This dashboard combines the asset libraries of all configured workspaces.</p>
          <ol className="dashboard-guide-steps">
            <li><h3>Select a workspace</h3><p>Choose a game from the sidebar to open its Sync page and review its GDA and Game folders.</p></li>
            <li><h3>Compare resources</h3><p>Click Rescan in the workspace to compare its game resources with the GDA. Follow the comparison on Sync in progress.</p></li>
            <li><h3>Review and sync</h3><p>Review different, missing, and invalid resources. Select available GDA versions to copy, confirm the changes, and check saved results in Sync history.</p></li>
          </ol>
        </div>
      </section>

      {loading ? (
        <div className="card grid-margin" role="status"><div className="card-body text-muted">Loading statistics from all configured workspaces…</div></div>
      ) : loadError ? (
        <div className="alert alert-danger" role="alert">
          Could not load workspace statistics: {loadError}{' '}
          <button type="button" className="btn btn-outline-danger btn-sm ml-2" onClick={() => setReload(value => value + 1)}>Retry</button>
        </div>
      ) : dashboard ? (
        <>
          {dashboard.warnings.length ? (
            <div className="alert alert-warning" role="status">
              <p className="mb-1">Some workspace folders or files are unavailable. Totals include the files that could be scanned.</p>
              <ul className="mb-0">{dashboard.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
            </div>
          ) : null}

          <div className="row">
            <div className="col-md-12 grid-margin">
              <div className="card">
                <div className="card-body">
                  <h4 className="card-title mb-1">All workspaces</h4>
                  <p className="text-muted mb-4">Combined statistics for {number(dashboard.workspaces.length)} configured workspace{plural(dashboard.workspaces.length)}.</p>
                  <div className="row dashboard-stats">
                    {stats.map((stat, i) => (
                      <div key={stat.label} className={classes('col-lg-3 col-md-6', { 'mt-md-0 mt-4': i > 0 })}>
                        <div className="d-flex">
                          <div className="wrapper">
                            <h3 className="mb-0 font-weight-semibold">{stat.value}</h3>
                            <h5 className="mb-0 font-weight-medium text-primary">{stat.label}</h5>
                            <p className="mb-0 text-muted">{stat.detail}</p>
                          </div>
                          <div className="wrapper my-auto ml-auto ml-lg-4">
                            <ChartCanvas config={stat.chart} label={`${stat.label} over time`} height={50} width={100} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-8 grid-margin stretch-card">
              <div className="card">
                <div className="card-body">
                  <h4 className="card-title mb-0">Library Statistics Overview</h4>
                  <div className="d-flex flex-column flex-lg-row">
                    <p>GDA changes and files synced to the game, {PERIODS.find(item => item.id === period)!.description}</p>
                    <ul className="nav nav-tabs sales-mini-tabs ml-lg-auto mb-4 mb-md-0" role="tablist" aria-label="Period">
                      {PERIODS.map(item => (
                        <li key={item.id} className="nav-item">
                          <button type="button" role="tab" aria-selected={period === item.id} className={classes('nav-link', { active: period === item.id })} onClick={() => setPeriod(item.id)}>{item.label}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="d-flex flex-column flex-lg-row">
                    <div className="data-wrapper d-flex mt-2 mt-lg-0">
                      <div className="wrapper pr-5">
                        <h5 className="mb-0">Changed in GDA</h5>
                        <div className="d-flex align-items-center">
                          <h4 className="font-weight-semibold mb-0">{number(changedInPeriod)}</h4>
                          <small className="ml-2 text-gray d-none d-lg-block"><b>{percent(changedInPeriod, assets.length)}%</b> of {number(assets.length)} assets</small>
                        </div>
                      </div>
                      <div className="wrapper">
                        <h5 className="mb-0">Synced to Game</h5>
                        <div className="d-flex align-items-center">
                          <h4 className="font-weight-semibold mb-0">{number(syncedInPeriod)}</h4>
                          <small className="ml-2 text-gray d-none d-lg-block"><b>{inSyncPercent}%</b> of the library in sync</small>
                        </div>
                      </div>
                    </div>
                    <div id="sales-statistics-legend" className="ml-lg-auto"><ChartLegend items={overviewLegend} /></div>
                  </div>
                  <ChartCanvas className="mt-5" config={overviewChart} label="GDA changes and synced files over time" height={280} />
                </div>
              </div>
            </div>
            <div className="col-md-4 grid-margin stretch-card">
              <div className="card">
                <div className="card-body d-flex flex-column">
                  <div className="wrapper">
                    <h4 className="card-title mb-0">Asset Mix</h4>
                    <p>Files per format, in sync and waiting</p>
                    <div id="net-profit-legend" className="mb-4"><ChartLegend items={radarLegend} /></div>
                  </div>
                  <ChartCanvas className="my-auto" config={radarChart} label="Files per format in sync and waiting for sync" height={260} />
                </div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-8">
              <div className="row">
                <div className="col-md-6 grid-margin stretch-card">
                  <div className="card">
                    <div className="card-body pb-0">
                      <div className="d-flex justify-content-between">
                        <h4 className="card-title mb-0">Library Size</h4>
                        <p className="font-weight-semibold mb-0">{number(assets.length)} files</p>
                      </div>
                      <h3 className="font-weight-medium mb-4">{size(totalSize)}</h3>
                    </div>
                    <ChartCanvas className="mt-n4" config={growthChart} label="Library size as files were added" height={90} />
                  </div>
                </div>
                <div className="col-md-6 grid-margin stretch-card">
                  <div className="card">
                    <div className="card-body pb-0">
                      <div className="d-flex justify-content-between">
                        <h4 className="card-title mb-0">Copied to Game</h4>
                        <p className="font-weight-semibold mb-0">{syncs.length} sync{plural(syncs.length)}</p>
                      </div>
                      <h3 className="font-weight-medium">{size(copiedBytes)}</h3>
                    </div>
                    {syncs.length ? (
                      <ChartCanvas className="mt-n3" config={copiedChart} label="Data copied by recent syncs" height={90} />
                    ) : (
                      <p className="chart-placeholder text-muted">No syncs yet. Data copied to the game appears here.</p>
                    )}
                  </div>
                </div>
                <div className="col-md-12 grid-margin">
                  <div className="card">
                    <div className="card-body">
                      <h4 className="card-title mb-0">Storage Overview</h4>
                      <div className="d-flex align-items-center justify-content-between w-100">
                        <p className="mb-0">{metric === 'size' ? 'Data' : 'Files'} per top-level folder, by sync status.</p>
                        <BaseDropdown menuClass="dropdown-menu-right" toggle={({ open, toggle }) => (
                          <button type="button" className="btn btn-outline-secondary dropdown-toggle" aria-haspopup="true" aria-expanded={open} aria-label={`Measure: ${metric === 'size' ? 'by size' : 'by files'}`} onClick={toggle}>{metric === 'size' ? 'By size' : 'By files'}</button>
                        )}>
                          <button type="button" className="dropdown-item" onClick={() => setMetric('size')}>By size</button>
                          <button type="button" className="dropdown-item" onClick={() => setMetric('files')}>By files</button>
                        </BaseDropdown>
                      </div>
                      <div className="d-flex align-items-end">
                        <h3 className="mb-0 font-weight-semibold">{metric === 'size' ? (totalSize / 1048576).toFixed(1) : number(assets.length)}</h3>
                        <p className="mb-0 font-weight-medium mr-2 ml-2 mb-1">{metric === 'size' ? 'MB' : 'files'}</p>
                        <p className="mb-0 text-success font-weight-semibold mb-1">({inSyncPercent}% in sync)</p>
                      </div>
                      <ChartLegend className="mt-3" items={storageLegend} />
                      <ChartCanvas className="mt-3" config={storageChart} label="Storage per folder by sync status" height={230} />
                    </div>
                  </div>
                </div>
                <div className="col-md-12 grid-margin">
                  <div className="card">
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <h4 className="card-title mb-0">Waiting for Sync</h4>
                      </div>
                      <p>The most recently changed assets that are not in the game yet.</p>
                      <div className="table-responsive">
                        <table className="table table-striped table-hover">
                          <thead><tr><th>Asset</th><th>Folder</th><th>Status</th><th>Modified</th><th className="text-right">Size</th></tr></thead>
                          <tbody>
                            {waiting.map(asset => (
                              <tr key={assetKey(asset)} className="clickable-row" onClick={() => { void inspectAsset(asset); }}>
                                <td className="font-weight-medium">{asset.name}</td>
                                <td>{asset.workspaceName} / {asset.folder}</td>
                                <td><StatusBadge status={asset.status} /></td>
                                <td>{time(asset.modifiedAt)}</td>
                                <td className="text-right">{size(asset.size)}</td>
                              </tr>
                            ))}
                            {!waiting.length ? <tr><td colSpan={5} className="text-center text-muted">No available assets are waiting for sync across the configured workspaces.</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 grid-margin stretch-card">
                  <div className="card">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-6">
                          <div className="d-flex align-items-center pb-2"><div className="dot-indicator bg-success mr-2" /><p className="mb-0">In sync</p></div>
                          <h4 className="font-weight-semibold">{size(sizeOf('synced'))}</h4>
                          <div className="progress progress-md">
                            <div className="progress-bar bg-success" role="progressbar" aria-label="Data in sync" style={{ width: `${percent(sizeOf('synced'), totalSize)}%` }} aria-valuenow={percent(sizeOf('synced'), totalSize)} aria-valuemin={0} aria-valuemax={100} />
                          </div>
                        </div>
                        <div className="col-md-6 mt-4 mt-md-0">
                          <div className="d-flex align-items-center pb-2"><div className="dot-indicator bg-danger mr-2" /><p className="mb-0">Needs sync</p></div>
                          <h4 className="font-weight-semibold">{size(sizeOf('pending'))}</h4>
                          <div className="progress progress-md">
                            <div className="progress-bar bg-danger" role="progressbar" aria-label="Data waiting for sync" style={{ width: `${percent(sizeOf('pending'), totalSize)}%` }} aria-valuenow={percent(sizeOf('pending'), totalSize)} aria-valuemin={0} aria-valuemax={100} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 grid-margin stretch-card average-price-card">
                  <div className="card text-white">
                    <div className="card-body">
                      <div className="d-flex justify-content-between pb-2 align-items-center">
                        <h2 className="font-weight-semibold mb-0">{size(assets.length ? Math.round(totalSize / assets.length) : 0)}</h2>
                        <div className="icon-holder"><i aria-hidden="true" className="mdi mdi-file-outline" /></div>
                      </div>
                      <div className="d-flex justify-content-between">
                        <h5 className="font-weight-semibold mb-0">Average Asset Size</h5>
                        <p className="text-white mb-0">Across {number(assets.length)} assets</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="row">
                <div className="col-md-12 grid-margin">
                  <div className="card">
                    <div className="card-body">
                      <h4 className="card-title mb-4">Combined Workspace Metrics</h4>
                      <div className="row">
                        <div className="col-5 col-md-5">
                          <div className="wrapper border-bottom mb-2 pb-2">
                            <h4 className="font-weight-semibold mb-0">{number(assets.length)}</h4>
                            <div className="d-flex align-items-center"><p className="mb-0">GDA files</p><div className="dot-indicator bg-secondary ml-auto" /></div>
                          </div>
                          <div className="wrapper">
                            <h4 className="font-weight-semibold mb-0">{number(syncedCount)}</h4>
                            <div className="d-flex align-items-center"><p className="mb-0">In Game</p><div className="dot-indicator bg-primary ml-auto" /></div>
                          </div>
                        </div>
                        <div className="col-7 col-md-7 d-flex pl-4">
                          <ChartCanvas className="ml-auto w-100" config={coverageChart} label="Files in sync per asset type" height={100} />
                        </div>
                      </div>
                      <div className="row mt-5">
                        <div className="col-6">
                          <div className="d-flex align-items-center mb-2">
                            <div className="icon-holder bg-primary text-white py-1 px-3 rounded mr-2"><i aria-hidden="true" className="mdi mdi-sync icon-sm" /></div>
                            <h2 className="font-weight-semibold mb-0">{lastSync ? number(lastSync.files.length) : 0}</h2>
                          </div>
                          <p>{lastSync ? 'Files in the last sync' : 'No syncs yet'}</p>
                          <p><span className="font-weight-medium">{lastSync ? ago(lastSync.date) : 'Sync to start'}</span></p>
                        </div>
                        <div className="col-6">
                          <div className="gauge">
                            <ChartCanvas config={gaugeChart} label={`${inSyncPercent}% of files in sync`} height={90} />
                            <div className="gauge-value"><span className="font-weight-semibold">{inSyncPercent}%</span><small>in sync</small></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-12 grid-margin">
                  <div className="card">
                    <div className="card-body">
                      <h4 className="card-title mb-4">File Formats</h4>
                      {formatRows.map((row, i) => (
                        <div key={row.format} className={classes('wrapper', { 'mt-3': i > 0 })}>
                          <div className="d-flex w-100 pb-2">
                            <p className="mb-0 font-weight-semibold">{row.format}</p>
                            <div className="wrapper ml-auto d-flex align-items-center">
                              <p className="font-weight-semibold mb-0">{number(row.files)}</p>
                              <p className="ml-1 mb-0">{row.share}%</p>
                            </div>
                          </div>
                          <div className="progress progress-sm">
                            <div className={classes('progress-bar', ['bg-primary', 'bg-info', 'bg-success', 'bg-warning'][i % 4])} role="progressbar" aria-label={`${row.format} share`} style={{ width: `${row.share}%` }} aria-valuenow={row.share} aria-valuemin={0} aria-valuemax={100} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="col-md-12 grid-margin">
                  <div className="card">
                    <div className="card-body">
                      <h4 className="card-title mb-0">Largest Assets</h4>
                      {largest.map((asset, i) => (
                        <div key={assetKey(asset)} className={classes('d-flex py-2', { 'mt-3': i === 0, 'border-bottom': i < largest.length - 1 })}>
                          <span className={classes('img-sm rounded-circle text-white text-avatar', avatarColors[i % avatarColors.length])}>{asset.extension.slice(0, 3).toUpperCase()}</span>
                          <div className="wrapper ml-2 min-w-0">
                            <a href="#" className="d-block mb-n1 font-weight-semibold text-dark text-truncate" onClick={event => { event.preventDefault(); void inspectAsset(asset); }}>{asset.name}</a>
                            <small>{asset.workspaceName} · {size(asset.size)}</small>
                          </div>
                          <small className="text-muted ml-auto text-nowrap pl-2">{ago(asset.modifiedAt)}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-4 grid-margin stretch-card">
              <div className="card">
                <div className="card-body">
                  <h4 className="card-title mb-0">Recent Changes</h4>
                  {recent.map((asset, i) => (
                    <div key={assetKey(asset)} className={classes('d-flex py-2', { 'border-bottom': i < recent.length - 1 })}>
                      <div className="wrapper min-w-0">
                        <small className="text-muted">{time(asset.modifiedAt)}</small>
                        <p className="font-weight-semibold text-gray mb-0 text-truncate">{asset.name}</p>
                        <small className="text-muted">{asset.workspaceName}</small>
                      </div>
                      <a href="#" className="ml-auto pl-2" onClick={event => { event.preventDefault(); void inspectAsset(asset); }}><small className="text-muted">Inspect</small></a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-md-4 grid-margin stretch-card">
              <div className="card">
                <div className="card-body">
                  <div className="d-flex justify-content-between pb-3">
                    <h4 className="card-title mb-0">Activities</h4>
                    <p className="mb-0 text-muted">{syncs.length} synced, {pending.length} remaining</p>
                  </div>
                  {activity.length ? (
                    <ul className="timeline">
                      {activity.slice(0, 5).map(entry => (
                        <li key={entry.id} className="timeline-item">
                          <p className="timeline-content"><a href="#" onClick={event => { event.preventDefault(); navigate('history'); }}>{entry.message}</a></p>
                          <p className="event-time">{ago(entry.date)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No activity yet. Syncs and rescans appear here.</p>
                  )}
                  <a className="d-block mt-3" href="#" onClick={event => { event.preventDefault(); navigate('history'); }}>Show all</a>
                </div>
              </div>
            </div>
            <div className="col-md-4 grid-margin stretch-card">
              <div className="card">
                <div className="card-body">
                  <h4 className="card-title mb-0">Folders</h4>
                  <div className="table-responsive">
                    <table className="table table-stretched">
                      <thead><tr><th>Folder</th><th>Size</th><th>Status</th></tr></thead>
                      <tbody>
                        {folderRows.map(row => (
                          <tr key={row.name}>
                            <td><p className="mb-1 text-dark font-weight-medium">{row.name}</p><small className="font-weight-medium">{row.files} file{plural(row.files)}</small></td>
                            <td className="font-weight-medium">{size(row.size)}</td>
                            <td className={classes('font-weight-medium', row.pending ? 'text-danger' : 'text-success')}>{row.pending ? `${row.pending} to sync` : 'In sync'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
