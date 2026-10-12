import { Fragment, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { classes } from '../classes';
import { imageSettings, number, plural, rowMatches, sequenceName, sequenceSummary, splitPath, time } from '../format';
import { useSyncReport } from '../hooks/useSyncReport';
import type { RssCategory, RssResource } from '../types';
import { rescan, useWorkspace } from '../workspace';

const PAGE_SIZE = 200;
const CATEGORIES: { key: RssCategory; label: string; badge: string; hint: string; detail: string }[] = [
  { key: 'identical', label: 'In sync', badge: 'badge-success', hint: 'identical copy in the GDA', detail: 'Matching GDA file' },
  { key: 'missing', label: 'Missing', badge: 'badge-warning', hint: 'no GDA file with this name', detail: 'Declared in' },
  { key: 'different', label: 'Different', badge: 'badge-danger', hint: 'same name, other content', detail: 'GDA files with this name, closest folder first' },
  { key: 'invalid', label: 'Invalid', badge: 'badge-dark', hint: 'declared path not usable', detail: 'Reason' },
  { key: 'supplementary', label: 'Supplementary', badge: 'badge-info', hint: 'in the game, in no descriptor', detail: 'Not compared' },
];
const PHASES = {
  descriptors: 'Reading the *Data.json descriptors', index: 'Indexing the GDA folder', hashing: 'Hashing files', compare: 'Comparing files',
  images: 'Reading images', matches: 'Matching images',
};

// Long paths wrap after a folder separator rather than inside a name.
const segments = (path: string) => path.split(/(?<=\/)/);
function pathParts(path: string) {
  return segments(path).map((part, index) => <Fragment key={index}>{part}<wbr /></Fragment>);
}
const reason = (row: RssResource) => row.status.replace(/^invalid: /, '');
/** The GDA folders of an image sequence's files, with how many of them each holds. */
function gdaFolders(row: RssResource) {
  const folders = new Map<string, { folder: string; tree: string; count: number }>();
  for (const file of row.gdaFiles) {
    const folder = splitPath(file.path).folder;
    const entry = folders.get(`${file.tree}:${folder}`) ?? { folder, tree: file.tree, count: 0 };
    entry.count++;
    folders.set(`${file.tree}:${folder}`, entry);
  }
  return [...folders.values()];
}

export default function SyncInProgressView() {
  const { activeSyncCount, busy, config, rssSync } = useWorkspace();
  const { report, loadError } = useSyncReport();
  const [category, setCategory] = useState<RssCategory>('identical');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  const running = activeSyncCount > 0;
  const progress = rssSync?.progress;
  const progressPercent = progress?.total
    ? Math.min(100, Math.max(0, Math.round(progress.done / progress.total * 100)))
    : undefined;
  const summary = report?.summary;
  // The settings the run used; reports from an earlier version may not have them.
  const settings = report?.workspace;
  // Whether the GPU algorithms ran, when the run asked for them.
  const imageGpu = useMemo(() => {
    const gpu = report?.imageCompare?.gpu;
    if (!gpu?.requested) return '';
    return gpu.available ? ` on ${gpu.device}` : `, not used: ${gpu.reason ?? 'unavailable'}`;
  }, [report]);
  const startedAt = summary?.startedAt ?? report?.startedAt;
  const finishedAt = summary?.finishedAt ?? report?.finishedAt;
  // The report is the last successful run; the run after it may have failed.
  const lastRun = rssSync?.lastRun;
  const current = CATEGORIES.find(item => item.key === category)!;

  const rows = useMemo<RssResource[]>(() => {
    const all = category === 'identical'
      ? report?.identical ?? []
      : (report?.differences ?? []).filter(row => row.category === category);
    const needle = query.trim().toLowerCase();
    return needle ? all.filter(row => rowMatches(row, needle)) : all;
  }, [category, query, report]);
  const visible = useMemo(() => rows.slice(0, shown), [rows, shown]);
  useEffect(() => { setShown(PAGE_SIZE); }, [category, query, report]);

  const duration = useMemo(() => {
    if (!startedAt || !finishedAt) return '';
    const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }, [startedAt, finishedAt]);
  const matching = settings ? imageSettings(settings) : null;

  return (
    <>
      <PageHeader
        title="Sync in progress"
        links={[
          <li key="active"><span>{number(activeSyncCount)} active sync process{activeSyncCount === 1 ? '' : 'es'}</span></li>,
          finishedAt ? <li key="compared"><span>Compared {time(finishedAt)}</span></li> : null,
          duration ? <li key="duration"><span>Took {duration}</span></li> : null,
          report?.workspace?.game_name ? <li key="game"><span>Game {report.workspace.game_name}</span></li> : null,
        ]}
        toolbar={[
          <button key="rescan" type="button" className="btn btn-primary toolbar-item" disabled={!!busy || running} onClick={() => { void rescan(); }}>
            <i aria-hidden="true" className={classes('mdi', running ? 'mdi-loading mdi-spin' : 'mdi-refresh')} />{running ? 'Comparing…' : 'Rescan'}
          </button>,
          <span key="hint" className="toolbar-item rss-hint">Rescan compares the game resources with the GDA folder in the background.</span>,
        ]}
      />

      <section className="grid-margin" aria-label="Active sync processes" aria-live="polite">
        <h4 className="rss-heading">Active sync processes</h4>
        {running ? (
          <article className="card rss-run">
            <div className="card-body">
              <div className="rss-run-row">{[
                <div key="when" className="rss-run-when">
                  <span className="badge badge-primary"><i aria-hidden="true" className="mdi mdi-loading mdi-spin" /> Running</span>
                  <h5 className="rss-run-time">{rssSync?.startedAt ? `Started ${time(rssSync.startedAt)}` : 'Starting…'}</h5>
                  <small className="text-muted">{config.name}</small>
                </div>,
                <div key="progress" className="rss-run-progress">
                  <p className="rss-progress-title">{progress ? PHASES[progress.phase] : 'Starting the background process'}</p>
                  {progress && progress.total ? <p className="rss-progress-step">{number(progress.done)} of {number(progress.total)} · {progressPercent}%</p> : null}
                  <div className="progress">
                    <div className="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-label="GDA sync progress"
                      aria-valuemin={progressPercent !== undefined ? 0 : undefined} aria-valuemax={progressPercent !== undefined ? 100 : undefined} aria-valuenow={progressPercent}
                      style={{ width: `${progressPercent ?? 100}%` }} />
                  </div>
                </div>,
              ]}</div>
              <div className="rss-run-footer"><small className="text-muted">The report and sync history update when this process finishes.</small></div>
            </div>
          </article>
        ) : (
          <div className="card empty-state">
            <div className="card-body">
              <i aria-hidden="true" className="mdi mdi-sync text-muted" />
              <h3>No active sync processes</h3>
              <p className="text-muted">No GDA sync is running for this workspace. Click Rescan to start a comparison.</p>
            </div>
          </div>
        )}
      </section>

      {lastRun && lastRun.state === 'failed' && !running ? (
        <div className="alert alert-danger rss-alert">{[
          <i key="icon" aria-hidden="true" className="mdi mdi-alert-circle-outline" />,
          <span key="text">The last GDA sync failed: {lastRun.error}{summary && finishedAt ? <> Showing the result from {time(finishedAt)}.</> : null}</span>,
        ]}</div>
      ) : null}
      {loadError ? <div className="alert alert-danger rss-alert"><i aria-hidden="true" className="mdi mdi-alert-circle-outline" /><span>{loadError}</span></div> : null}

      {summary ? (
        <>
          <h4 className="rss-heading">Latest completed comparison</h4>
          <div className="card grid-margin">
            <div className="card-body">
              <p className="rss-compared">{number(summary.compared)} resource{plural(summary.compared)} compared</p>
              <div className="rss-tiles" role="group" aria-label="Result categories">{CATEGORIES.map(item => (
                <button key={item.key} type="button" className={classes('rss-tile', item.key, { active: category === item.key })} aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>
                  <span className="rss-tile-label">{item.label}</span>
                  <span className="rss-tile-value">{number(summary[item.key] ?? 0)}</span>
                  <span className="rss-tile-hint">{item.key === 'identical' && summary.identicalMipOnly ? `${number(summary.identicalMipOnly)} differ only in DDS mip levels` : item.hint}</span>
                </button>
              ))}</div>
              {settings?.game_path ? (
                <dl className="rss-meta">{[
                  <dt key="game">Game folder</dt>, <dd key="game-path">{settings.game_path}</dd>,
                  <dt key="gda">GDA folder</dt>, <dd key="gda-path">{settings.gda_path}</dd>,
                  settings.common_gda_path ? <dt key="common">Common GDA</dt> : null,
                  settings.common_gda_path ? <dd key="common-path">{settings.common_gda_path}</dd> : null,
                  <dt key="extensions">Extensions</dt>, <dd key="extensions-value">{settings.extensions.join(', ')}</dd>,
                  <dt key="mips">DDS mip levels</dt>,
                  <dd key="mips-value">{settings.ignore_dds_mips ? 'Ignored: a copy that differs only in mip levels counts as in sync' : 'Compared byte for byte'}</dd>,
                  matching ? <dt key="images">Image matching</dt> : null,
                  matching ? <dd key="images-value">{matching}{imageGpu}</dd> : null,
                ]}</dl>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="rss-results-heading">{[
                <h4 key="title" className="card-title mb-0">{current.label} <span key={current.key} className={classes('badge', 'badge-pill', current.badge)}>{number(rows.length)}</span></h4>,
                <input key="filter" value={query} onChange={event => setQuery(event.target.value)} type="search" className="form-control rss-filter" aria-label="Filter resources" placeholder="Filter by resource or GDA path…" />,
              ]}</div>
              {rows.length ? (
                <div className="table-responsive">
                  <table className="table rss-table" aria-label={`${current.label} resources`}>
                    <thead><tr><th scope="col">Resource</th><th scope="col">{current.detail}</th></tr></thead>
                    <tbody>
                      {visible.map(row => (
                        <tr key={row.id}>
                          <td>{[
                            <span key="path" className="rss-path" title={row.resourcePath}>{pathParts(row.resource)}</span>,
                            row.scope === 'common' ? <span key="common" className="badge badge-light ml-1">common</span> : null,
                            row.directory ? <small key="rtf" className="d-block text-muted">RTF · {number(row.directory.files.filter(file => file.resourcePath).length)} files</small> : null,
                            row.sequence ? <small key="sequence" className="d-block text-muted"><span className={classes({ 'rss-path': !row.sequence.guessed }) || undefined}>{sequenceName(row.sequence)}</span> · {sequenceSummary(row.sequence)}</small> : null,
                          ]}</td>
                          <td>
                            {row.category === 'missing' ? (
                              !row.requiredBy.length
                                ? <span className="text-muted">No JSON descriptor</span>
                                : row.requiredBy.map(use => <span key={`${use.descriptor}:${use.line}`} className="rss-path d-block">{use.descriptor}:{use.line}</span>)
                            ) : row.category === 'invalid' ? (
                              <span>{reason(row)}</span>
                            ) : row.category === 'supplementary' ? (
                              <span className="text-muted">No JSON descriptor declares {row.sequence ? 'these files' : 'this file'}</span>
                            ) : row.sequence ? [
                              ...gdaFolders(row).map(item => (
                                <span key={`${item.tree}:${item.folder}`} className="rss-path d-block">{pathParts(`${item.folder}/`)}<span className="text-muted ml-2">{number(item.count)} file{plural(item.count)}</span>{item.tree === 'common' ? <span className="badge badge-light ml-1">common GDA</span> : null}</span>
                              )),
                              row.mipOnly ? <span key="mips" className="badge badge-info">some files differ only in DDS mip levels</span> : null,
                            ] : [
                              ...row.gdaFiles.map(file => (
                                <span key={file.absolutePath} className="rss-path d-block" title={file.absolutePath}>{pathParts(file.path)}{file.tree === 'common' ? <span className="badge badge-light ml-1">common GDA</span> : null}</span>
                              )),
                              row.mipOnly ? <span key="mips" className="badge badge-info">differs only in DDS mip levels</span> : null,
                            ]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted rss-none">{query ? 'No resources match the filter.' : 'No resources in this category.'}</p>
              )}
              {rows.length > shown ? (
                <div className="rss-more">
                  <span className="text-muted">Showing {number(shown)} of {number(rows.length)}</span><button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShown(value => value + PAGE_SIZE)}>Show {number(Math.min(PAGE_SIZE, rows.length - shown))} more</button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
