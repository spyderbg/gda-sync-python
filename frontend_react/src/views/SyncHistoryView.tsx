import { useEffect, useMemo, useRef, useState } from 'react';
import { themeColor } from '../charts/chartjs';
import { syncRunBars } from '../charts/configs';
import { classes } from '../classes';
import AppModal from '../components/AppModal';
import ChartCanvas from '../components/ChartCanvas';
import ChartLegend from '../components/ChartLegend';
import PageHeader from '../components/PageHeader';
import ReportNotice from '../components/ReportNotice';
import { ago, imageSettings, number, plural, size, time } from '../format';
import type { RssSyncCount, RssSyncHistory, RssSyncHistoryEntry, RssSyncSummary, RssSyncWorkspace } from '../types';
import { deleteSyncReport, navigate, rescan, useWorkspace } from '../workspace';

const CHART_RUNS = 20;
// Whether a rise of each count is an improvement decides the color of its change.
const COLUMNS: { key: RssSyncCount; label: string; riseIsBetter: boolean }[] = [
  { key: 'identical', label: 'In sync', riseIsBetter: true },
  { key: 'missing', label: 'Missing', riseIsBetter: false },
  { key: 'different', label: 'Different', riseIsBetter: false },
  { key: 'invalid', label: 'Invalid', riseIsBetter: false },
];
const SETTINGS: (keyof RssSyncWorkspace)[] = ['game_path', 'gda_path', 'common_gda_path', 'extensions', 'resource_paths', 'ignore_dds_mips',
  'multithreading', 'use_gpu', 'image_match_threshold'];
const barColors: Record<string, string> = { identical: 'bg-success', missing: 'bg-warning', different: 'bg-danger', invalid: 'bg-dark' };
const signed = (delta: number) => (delta > 0 ? `+${number(delta)}` : `−${number(-delta)}`);
const changeClass = (delta: number, riseIsBetter: boolean) => ((delta > 0) === riseIsBetter ? 'text-success' : 'text-danger');
/** The share of the compared resources in each result, as the widths of the card's bar. */
const shares = (summary: RssSyncSummary) => COLUMNS.map(column => ({ ...column, width: summary.compared ? summary[column.key] / summary.compared * 100 : 0 }));

function duration(run: RssSyncHistoryEntry) {
  const seconds = (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export default function SyncHistoryView() {
  const { busy, data, rssSync } = useWorkspace();
  const [runs, setRuns] = useState<RssSyncHistoryEntry[]>([]);
  const [workspace, setWorkspace] = useState<RssSyncWorkspace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Load the workspace's runs, and again whenever a run ends or the workspace changes.
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    setLoadError('');
    void (async () => {
      try {
        const response = await fetch('/api/rss-sync/history', { cache: 'no-store' });
        const body = await response.json();
        if (id !== request.current) return;
        if (!response.ok) throw new Error(body.error || 'Request failed');
        setRuns((body as RssSyncHistory).history);
        setWorkspace((body as RssSyncHistory).workspace);
      } catch (e) {
        if (id === request.current) setLoadError((e as Error).message);
      } finally {
        if (id === request.current) setLoaded(true);
      }
    })();
  }, [rssSync?.workspaceId, rssSync?.lastRun?.finishedAt]);

  // A report to delete waits in a dialog for confirmation. The Sync page then shows the newest successful report left.
  const [deleting, setDeleting] = useState<RssSyncHistoryEntry | null>(null);
  const latestResult = useMemo(() => runs.find(run => run.summary)?.file, [runs]);
  async function confirmDelete() {
    const run = deleting;
    if (!run) return;
    const history = await deleteSyncReport(run.file);
    setDeleting(null);
    if (!history) return;
    request.current += 1;
    setRuns(history.history);
    setWorkspace(history.workspace);
  }

  const running = !!rssSync?.running;
  const succeeded = useMemo(() => runs.filter(run => run.summary), [runs]);
  const failed = runs.length - succeeded.length;
  const copies = useMemo(() => data!.activity.filter(entry => entry.action === 'sync'), [data]);

  /** Each run with the counts of the successful run before it, to show what changed. */
  const rows = useMemo(() => {
    let previous: RssSyncSummary | undefined;
    return [...runs].reverse().map(run => {
      const row = { run, previous };
      if (run.summary) previous = run.summary;
      return row;
    }).reverse();
  }, [runs]);

  /** Whether the settings a run used differ from the workspace's settings now. A report from before a setting existed
   * does not have it, which is no change. */
  function settingsChanged(run: RssSyncHistoryEntry) {
    const now = workspace;
    return !!run.workspace && !!now
      && SETTINGS.some(key => key in run.workspace! && JSON.stringify(run.workspace![key]) !== JSON.stringify(now[key]));
  }

  const chart = useMemo(() => syncRunBars(succeeded.slice(0, CHART_RUNS).reverse().map(run => ({ label: time(run.finishedAt), summary: run.summary! }))), [succeeded]);
  const legend = useMemo(() => [
    { label: 'In sync', color: themeColor('success') }, { label: 'Missing', color: themeColor('warning') },
    { label: 'Different', color: themeColor('danger') }, { label: 'Invalid', color: themeColor('dark') },
  ], []);
  const imageMatching = workspace ? imageSettings(workspace) : null;

  return (
    <>
      <PageHeader
        title="Sync history"
        links={(
          <>
            <li><span>{number(runs.length)} GDA sync run{plural(runs.length)}</span></li>
            {failed ? <li><span>{number(failed)} failed</span></li> : null}
            {copies.length ? <li><span>{number(copies.length)} file cop{copies.length === 1 ? 'y' : 'ies'}</span></li> : null}
          </>
        )}
        linksRight={succeeded.length ? <li><a href="#" onClick={event => { event.preventDefault(); navigate('rssSync'); }}>Latest result</a></li> : null}
        toolbar={(
          <button type="button" className="btn btn-primary toolbar-item" disabled={!!busy || running} onClick={() => { void rescan(); }}>
            <i aria-hidden="true" className={classes('mdi', running ? 'mdi-loading mdi-spin' : 'mdi-refresh')} />{running ? 'Comparing…' : 'Rescan'}
          </button>
        )}
      />

      {loadError ? <div className="alert alert-danger history-alert"><i aria-hidden="true" className="mdi mdi-alert-circle-outline" /><span>{loadError}</span></div> : null}

      {workspace ? (
        <div className="row">
          <div className={classes(succeeded.length ? 'col-lg-7' : 'col-12', 'grid-margin', 'stretch-card')}>
            <div className="card">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-baseline">
                  <h4 className="card-title mb-0">Workspace</h4>
                  <p className="mb-0 text-muted history-id">{workspace.id}</p>
                </div>
                <p className="history-workspace-name">{workspace.game_name}</p>
                <dl className="history-info">
                  <dt>Game folder</dt><dd className="history-path">{workspace.game_path}</dd>
                  <dt>GDA folder</dt><dd className="history-path">{workspace.gda_path}</dd>
                  {workspace.common_gda_path ? <><dt>Common GDA folder</dt><dd className="history-path">{workspace.common_gda_path}</dd></> : null}
                  <dt>Extensions</dt>
                  <dd>{workspace.extensions.map(extension => <span key={extension} className="history-extension">{extension}</span>)}</dd>
                  {workspace.resource_paths.length ? (
                    <><dt>Resource paths</dt><dd className="history-path">{workspace.resource_paths.map(path => <span key={path} className="d-block">{path}</span>)}</dd></>
                  ) : null}
                  <dt>DDS mip levels</dt><dd>{workspace.ignore_dds_mips ? 'Ignored when comparing' : 'Compared'}</dd>
                  {imageMatching ? <><dt>Image matching</dt><dd>{imageMatching}</dd></> : null}
                  <dt>Last run</dt><dd>{runs.length ? `${time(runs[0].finishedAt)} (${ago(runs[0].finishedAt)})` : 'Never'}</dd>
                </dl>
              </div>
            </div>
          </div>
          {succeeded.length ? (
            <div className="col-lg-5 grid-margin">
              <div className="card">
                <div className="card-body">
                  <h4 className="card-title mb-2">Results by run</h4>
                  <div className="history-legend"><ChartLegend items={legend} /></div>
                  <ChartCanvas className="mt-3" config={chart} label={`Results of the last ${Math.min(CHART_RUNS, succeeded.length)} successful GDA sync runs`} height={220} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {runs.length || running ? (
        <div className="d-flex flex-wrap justify-content-between align-items-baseline">
          <h4 className="history-heading mr-3">GDA sync runs</h4>
          <p className="mb-3 text-muted">Newest first · changes are counted from the previous successful run</p>
        </div>
      ) : null}
      {runs.length || running ? (
        <div className="history-runs" aria-label="GDA sync runs">
          {running ? (
            <div className="card history-run">
              <div className="card-body history-row">
                <div className="history-when">
                  <span className="badge badge-primary"><i aria-hidden="true" className="mdi mdi-loading mdi-spin" /> Running</span>
                  <h5 className="history-run-time">Started {time(rssSync!.startedAt!)}</h5>
                </div>
                <p className="history-pending text-muted">Results appear here when the run ends.</p>
              </div>
            </div>
          ) : null}
          {rows.map(({ run, previous }) => {
            const summary = run.summary;
            return (
              <article key={run.file} className={classes('card', 'history-run', summary ? 'history-run-ok' : 'history-run-failed')}>
                <div className="card-body">
                  <div className="history-row">
                    <div className="history-when">
                      <span className={classes('badge', summary ? 'badge-success' : 'badge-danger')}>{summary ? 'Succeeded' : 'Failed'}</span>
                      <h5 className="history-run-time">{time(run.finishedAt)}</h5>
                      <small className="text-muted d-block">{ago(run.finishedAt)} · took {duration(run)}</small>
                    </div>

                    {summary ? (
                      <>
                        <div className="history-result">
                          <p className="history-compared">{number(summary.compared)}<small>resource{plural(summary.compared)} compared</small></p>
                          <div className="progress history-bar" role="img" aria-label={COLUMNS.map(column => `${number(summary[column.key])} ${column.label.toLowerCase()}`).join(', ')}>
                            {shares(summary).map(share => (
                              <div key={share.key} className={classes('progress-bar', barColors[share.key])} style={{ width: `${share.width}%` }} />
                            ))}
                          </div>
                          {summary.identicalMipOnly ? <p className="history-note">{number(summary.identicalMipOnly)} in sync except for DDS mip levels</p> : null}
                        </div>
                        <div className="history-stats">
                          {COLUMNS.map(column => (
                            <div key={column.key} className="history-stat">
                              <span className="history-stat-label"><i aria-hidden="true" className={classes('mdi', 'mdi-circle', barColors[column.key].replace('bg-', 'text-'))} />{column.label}</span>
                              <span className="history-stat-value">{number(summary[column.key])}</span>
                              {previous && summary[column.key] !== previous[column.key] ? (
                                <small className={changeClass(summary[column.key] - previous[column.key], column.riseIsBetter)}>{signed(summary[column.key] - previous[column.key])}</small>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="history-error">{run.error}</p>
                    )}
                  </div>

                  <div className="history-run-footer">
                    <small className="text-muted history-file" title={run.file}>{run.file}</small>
                    {run.descriptors !== undefined ? <small className="text-muted">{number(run.descriptors)} descriptor{plural(run.descriptors)} parsed</small> : null}
                    {summary?.supplementary ? <small className="text-muted">{number(summary.supplementary)} supplementary, in no descriptor</small> : null}
                    {settingsChanged(run) ? <small className="text-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" /> Workspace settings have changed since this run</small> : null}
                    <button type="button" className="btn btn-link btn-sm history-delete" disabled={!!busy} aria-label={`Delete the report of the run of ${time(run.finishedAt)}`}
                      title={`Delete ${run.file}`} onClick={() => setDeleting(run)}>
                      <i aria-hidden="true" className="mdi mdi-delete-outline" />Delete report
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {loaded && !runs.length && !running ? <ReportNotice /> : null}

      {deleting ? (
        <AppModal title="Delete this GDA sync report?" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>The report of the run of {time(deleting.finishedAt)} is deleted: <code className="history-delete-file">{deleting.file}</code>. It cannot be restored.</p>
            {deleting.file === latestResult ? (
              <p className="text-warning mb-0">
                <i aria-hidden="true" className="mdi mdi-alert-outline" /> It is the latest successful run: the Sync page will show {succeeded.length > 1 ? 'the one before it' : 'no report until the next Rescan'}.
              </p>
            ) : null}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className="btn btn-danger" disabled={busy === 'delete-report'} onClick={() => { void confirmDelete(); }}>
              <i aria-hidden="true" className={classes('mdi', busy === 'delete-report' ? 'mdi-loading mdi-spin' : 'mdi-delete-outline')} />Delete report
            </button>
          </div>
        </AppModal>
      ) : null}

      {copies.length ? (
        <div className="card grid-margin">
          <div className="card-body">
            <h4 className="card-title mb-0">Copies to the Game folder</h4>
            <p className="text-muted history-intro">Files copied with Sync selected or Sync all pending, in every workspace. Replaced Game files are backed up in <code>{data!.backupPath}</code>.</p>
            <div className="table-responsive">
              <table className="table table-striped activity-table" aria-label="Copies to the Game folder">
                <thead><tr><th scope="col">Operation</th><th scope="col">Date</th><th scope="col" className="text-right">Copied</th></tr></thead>
                <tbody>
                  {copies.map(entry => (
                    <tr key={entry.id}>
                      <td>
                        <div className="d-flex align-items-start">
                          <span className="activity-icon bg-success"><i aria-hidden="true" className="mdi mdi-sync" /></span>
                          <div className="min-w-0">
                            <p className="mb-1 font-weight-medium text-dark">{entry.message}</p>
                            {entry.files.length ? (
                              <details>
                                <summary>View {entry.files.length} files</summary>
                                {entry.files.map(file => <span key={file} className="activity-file"><i aria-hidden="true" className="mdi mdi-file-outline" />{file}</span>)}
                              </details>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="text-nowrap">{time(entry.date)}</td>
                      <td className="text-right text-nowrap">{entry.bytes !== undefined ? size(entry.bytes) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
