import { useEffect, useMemo, useState } from 'react';
import ButtonTooltip from '../components/ButtonTooltip';
import CheckBox from '../components/CheckBox';
import ReportNotice from '../components/ReportNotice';
import ResourceCard from '../components/ResourceCard';
import ResourceDetails from '../components/ResourceDetails';
import { classes } from '../classes';
import { commonAction, defaultCandidate, imageCandidates, number, plural, resourceAction, resourceActionIcons, rowMatches, time, type GdaCandidate } from '../format';
import { useSyncReport } from '../hooks/useSyncReport';
import type { RssCategory, RssResource } from '../types';
import { copy, navigate, openFolder, requestResourceActions, requestResourceSync, rescan, useWorkspace } from '../workspace';

// Apart from the workspace's folders, everything on this page comes from the workspace's GDA sync report:
// the counts of its comparison and the resources that differ from the GDA folder, then the supplementary files, which
// no descriptor declares. A resource with an action can be selected: a "different" one is synced, an "invalid" one has
// its declarations removed from the descriptors, and a "supplementary" one is deleted. A "missing" one has none.
// A different or missing image's card shows the GDA images that may show the same picture, and one can be chosen on it:
// its copy button syncs the chosen image, and a missing image can be synced this way too. Its details show the chosen
// image, or else the most likely one; Sync all pending and Sync selected also copy the chosen image, or else the most
// likely one.
type Category = Exclude<RssCategory, 'identical'>;
type Filter = 'all' | Category;
// Each filter's tooltip says what its status means and why the GDA sync gives a resource that status.
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  {
    key: 'all', label: 'All',
    hint: 'Every resource the report lists apart from the ones in sync: the Different, Missing, Invalid and Supplementary '
      + 'resources together, in the report\'s order, by status and then path.\n\n'
      + 'Select resources to act on them with the button at the top: a Different resource is synced, an Invalid one has '
      + 'its declarations removed from the descriptors, and a Supplementary one is deleted. A Missing resource has no '
      + 'action, but a missing image can be synced from a GDA image chosen on its card. Without a selection, the button '
      + 'syncs every Different resource. The In sync page lists the resources that are in sync.',
  },
  {
    key: 'different', label: 'Different',
    hint: 'The GDA folder has a file with the same name as the game file, but with other content: the GDA has another '
      + 'version of the resource.\n\n'
      + 'The GDA sync looks up each file that a descriptor declares by its file name, in any folder of the GDA folder (a '
      + 'common file also in the common GDA folder), and compares the contents by SHA-256. When none of the same-named GDA '
      + 'files is identical, the resource is different. By default, a DDS file that differs only in its mip levels counts '
      + 'as in sync. An image sequence is different when any of its files is.\n\n'
      + 'Sync updates them, and keeps each replaced file in your backups. An image\'s card shows the GDA images that may show '
      + 'the same picture, most likely first: Sync copies the one chosen by clicking it, or else the most likely one. Any '
      + 'other file is copied from the GDA file in the closest folder.\n\n'
      + 'An RTF is one resource, its folder. It is compared file by file with each GDA folder that holds a .rtf file of '
      + 'the same name, the closest by path and folder name first, and is different when none is identical. Sync makes '
      + 'the game\'s folder a copy of the closest: it copies the changed files and the ones only the GDA has, and deletes '
      + 'the ones only the game has.',
  },
  {
    key: 'missing', label: 'Missing',
    hint: 'No file in the GDA folder has the name of the game file, so there is nothing to compare it with or to copy.\n\n'
      + 'The GDA sync looks up each file that a descriptor declares by its file name, in any folder of the GDA folder. A '
      + 'file in the game folder without a same-named GDA file is missing. A shared file outside the game folder, such as '
      + 'one in common, that has no GDA file is left out of the report instead, since its GDA files can be kept elsewhere. '
      + 'An image sequence is '
      + 'missing when some of its files are missing and none is different or invalid.\n\n'
      + 'There is nothing to apply, so it cannot be selected: add the file to the GDA folder, or correct its name, then '
      + 'rescan. A missing image whose card shows GDA images that may show the same picture, such as a renamed copy, can '
      + 'be synced from the one chosen on its card with its copy arrow.',
  },
  {
    key: 'invalid', label: 'Invalid',
    hint: 'A descriptor declares a path that cannot be used: its file does not exist, or the path leads outside the '
      + 'resources folder that holds the game folder.\n\n'
      + 'The GDA sync resolves each path that a descriptor declares, with a {N-M} range expanded to one path per file, '
      + 'before it looks for the file in the GDA folder. A path whose file does not exist, or that leads outside the '
      + 'resources folder, is invalid and is not compared. An image sequence is invalid when any of its files is invalid '
      + 'and none is different.\n\n'
      + 'Correct the path in the descriptor, or add the file to the game, then rescan. Or select it and remove its '
      + 'declarations: each entry, image sequence or audio sample that names it leaves the descriptors, and each changed '
      + 'descriptor is saved in your backups first. One that only the workspace\'s resource_paths declare cannot be '
      + 'selected.',
  },
  {
    key: 'supplementary', label: 'Supplementary',
    hint: 'A file in the game folder that no *Data.json descriptor declares, so the game does not load it.\n\n'
      + 'The GDA sync lists every file in the game folder with a compared extension that no descriptor, and no '
      + 'resource_paths entry of the workspace, declares. It is not compared with the GDA folder and does not count as '
      + 'not in sync. Numbered images in one folder with the same name and extension, at least five numbers in a row, '
      + 'such as name00.dds to name70.dds, are guessed to be one image sequence.\n\n'
      + 'An RTF whose .rtf file no descriptor declares is one supplementary resource, its folder.\n\n'
      + 'It can be a leftover to remove, or a resource whose declaration is missing. Select it to delete it from the game '
      + 'folder, a guessed sequence with all its files and an RTF with its whole folder; each file is saved in your '
      + 'backups first.',
  },
];
const PAGE_SIZE = 200;
const ACTION_LABELS = {
  sync: { idle: 'Sync selected', busy: 'Syncing…' }, remove: { idle: 'Remove declarations', busy: 'Removing…' },
  delete: { idle: 'Delete selected', busy: 'Deleting…' }, mixed: { idle: 'Apply to selected', busy: 'Applying…' },
};

const selectable = (row: RssResource) => !!resourceAction(row);

export default function SyncView() {
  const { applying, busy, config, rssSync } = useWorkspace();
  const { report, loadError } = useSyncReport();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [chosen, setChosen] = useState<Map<string, string>>(() => new Map());
  // Clicking a card shows its details; a new report that no longer lists the resource closes them.
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const running = !!rssSync?.running;
  // The newest report file can belong to a failed run; the result shown is then the last successful one before it.
  const reportPath = rssSync?.reportPath ?? null;
  const lastRun = rssSync?.lastRun;
  const summary = report?.summary;
  const finishedAt = summary?.finishedAt ?? report?.finishedAt;
  const differences = useMemo(() => report?.differences ?? [], [report]);
  // Each image's GDA images that may show the same picture, most likely first, and the one chosen on its card, by row id.
  const candidates = useMemo(() => new Map(differences.map(row => [row.id, imageCandidates(row)])), [differences]);
  const candidatesOf = (row: RssResource) => candidates.get(row.id) ?? [];
  const chosenOf = (row: RssResource) => candidatesOf(row).find(candidate => candidate.absolutePath === chosen.get(row.id)) ?? null;
  function choose(row: RssResource, file: string | null) {
    setChosen(current => {
      const next = new Map(current);
      if (file) next.set(row.id, file);
      else next.delete(row.id);
      return next;
    });
  }
  /** The GDA image each image is synced from: the one chosen on its card, or else the most likely one. */
  function choices(rows: RssResource[]) {
    const found: Record<string, GdaCandidate> = {};
    for (const row of rows) {
      const candidate = chosenOf(row) ?? (row.category === 'different' ? defaultCandidate(candidatesOf(row)) : null);
      if (candidate) found[row.id] = candidate;
    }
    return found;
  }
  const counts = useMemo(() => {
    const result = { all: differences.length, different: 0, missing: 0, invalid: 0, supplementary: 0 };
    for (const row of differences) if (row.category !== 'identical') result[row.category]++;
    return result;
  }, [differences]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Preserve the report's order by status, then path.
    return differences.filter(row => (filter === 'all' || row.category === filter) && rowMatches(row, needle));
  }, [differences, filter, query]);
  const visible = useMemo(() => rows.slice(0, shown), [rows, shown]);
  useEffect(() => { setShown(PAGE_SIZE); }, [filter, query, report]);

  const pending = useMemo(() => differences.filter(row => resourceAction(row) === 'sync'), [differences]);
  // Like the library, only the selected resources that are shown are acted on.
  const shownSelectable = useMemo(() => rows.filter(selectable), [rows]);
  const selectedRows = useMemo(() => shownSelectable.filter(row => selected.has(row.id)), [shownSelectable, selected]);
  const hasSelection = selected.size > 0;
  // The button syncs every different resource, or applies the action of each selected one by its status.
  const targets = hasSelection ? selectedRows : pending;
  const targetAction = (hasSelection ? commonAction(selectedRows) : null) ?? 'sync';
  const actionLabel = busy === 'sync' ? ACTION_LABELS[applying ?? 'sync'].busy
    : hasSelection ? ACTION_LABELS[targetAction].idle : 'Sync all pending';
  const allSelected = shownSelectable.length > 0 && selectedRows.length === shownSelectable.length;

  // A resource that a new report no longer lists with an action leaves the selection, and a GDA image it no longer lists
  // as a candidate leaves the choices.
  useEffect(() => {
    const ids = new Set(differences.filter(selectable).map(row => row.id));
    setSelected(current => ([...current].some(id => !ids.has(id)) ? new Set([...current].filter(id => ids.has(id))) : current));
    setChosen(current => {
      const kept = new Map([...current].filter(([id, file]) => candidates.get(id)?.some(candidate => candidate.absolutePath === file && candidate.syncable)));
      return kept.size === current.size ? current : kept;
    });
  }, [differences, candidates]);

  const detailsRow = useMemo(
    () => (detailsId ? differences.find(row => row.id === detailsId) ?? null : null),
    [detailsId, differences],
  );
  // The GDA image the details compare an image with: the chosen one, or else the most likely one.
  const detailsCandidate = useMemo(() => {
    if (!detailsRow) return null;
    const all = candidates.get(detailsRow.id) ?? [];
    const picked = all.find(candidate => candidate.absolutePath === chosen.get(detailsRow.id)) ?? null;
    return picked ?? defaultCandidate(all) ?? all[0] ?? null;
  }, [detailsRow, candidates, chosen]);

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(select: boolean) {
    setSelected(current => {
      const next = new Set(current);
      for (const row of shownSelectable) if (select) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  }

  return (
    <>
      <section className="sync-workspace" aria-label="Sync workspace">
        <div className="sync-workspace-top">{[
          <div key="intro" className="sync-workspace-intro">
            {reportPath ? (
              <p className="sync-report sync-report-file">{[
                <button key="copy" type="button" className="sync-report-copy" aria-label="Copy sync report path" title="Copy sync report path" onClick={() => { void copy(reportPath); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>,
                <span key="path">Sync data: <span className="sync-report-path" title={reportPath}>{reportPath}</span></span>,
              ]}</p>
            ) : null}
            {reportPath && lastRun && lastRun.state === 'failed' ? (
              <p className="sync-report sync-report-failed">
                <i aria-hidden="true" className="mdi mdi-alert-circle-outline" />The last GDA sync failed: {lastRun.error}{summary && finishedAt ? <> Showing the result from {time(finishedAt)}.</> : null}
              </p>
            ) : null}
            {loadError ? <p className="sync-report sync-report-failed"><i aria-hidden="true" className="mdi mdi-alert-circle-outline" />{loadError}</p> : null}
          </div>,
          <div key="actions" className="sync-workspace-actions">{[
            <button key="apply" type="button" className={classes('btn', targetAction === 'sync' ? 'btn-primary' : 'btn-danger')} disabled={!!busy || running || !targets.length}
              onClick={() => { hasSelection ? requestResourceActions(targets, choices(targets)) : requestResourceSync(targets, choices(targets)); }}>{[
              <i key="icon" aria-hidden="true" className={classes('mdi', busy === 'sync' ? 'mdi-loading mdi-spin' : resourceActionIcons[targetAction])} />,
              <span key="label">{actionLabel}</span>,
              targets.length ? <span key="count" className="badge badge-light">{number(targets.length)}</span> : null,
            ]}</button>,
            <button key="rescan" type="button" className="btn btn-outline-primary" disabled={!!busy || running} onClick={() => { void rescan(); }}>{[
              <i key="icon" aria-hidden="true" className={classes('mdi', busy === 'scan' || running ? 'mdi-loading mdi-spin' : 'mdi-refresh')} />,
              <span key="label">{busy === 'scan' ? 'Scanning…' : running ? 'Comparing…' : 'Rescan'}</span>,
            ]}</button>,
          ]}</div>,
        ]}</div>

        {summary ? (
          <div className="sync-metrics">{[
            <button key="compared" type="button" className="sync-metric" onClick={() => navigate('rssSync')}>{[
              <span key="icon" className="sync-metric-icon is-total" aria-hidden="true"><i className="mdi mdi-layers-outline" /></span>,
              <span key="copy" className="sync-metric-copy"><span className="sync-metric-label">Compared</span><span className="sync-metric-value">{number(summary.compared)}<small>game resource{plural(summary.compared)}</small></span></span>,
              <i key="arrow" className="mdi mdi-arrow-top-right sync-metric-arrow" aria-hidden="true" />,
            ]}</button>,
            <button key="pending" type="button" className={classes('sync-metric', { active: filter === 'all' })} onClick={() => setFilter('all')}>{[
              <span key="icon" className="sync-metric-icon is-pending" aria-hidden="true"><i className="mdi mdi-sync" /></span>,
              <span key="copy" className="sync-metric-copy"><span className="sync-metric-label">Not in sync</span><span className="sync-metric-value">{number(counts.different + counts.missing + counts.invalid)}<small>{number(counts.different)} different · {number(counts.missing)} missing · {number(counts.invalid)} invalid</small></span></span>,
            ]}</button>,
            <button key="synced" type="button" className="sync-metric" onClick={() => navigate('rssSync')}>{[
              <span key="icon" className="sync-metric-icon is-synced" aria-hidden="true"><i className="mdi mdi-check-all" /></span>,
              <span key="copy" className="sync-metric-copy"><span className="sync-metric-label">In sync</span><span className="sync-metric-value">{number(summary.identical)}<small>{summary.identicalMipOnly ? `${number(summary.identicalMipOnly)} differ only in DDS mip levels` : 'identical in the GDA folder'}</small></span></span>,
              <i key="arrow" className="mdi mdi-arrow-top-right sync-metric-arrow" aria-hidden="true" />,
            ]}</button>,
            <button key="supplementary" type="button" className={classes('sync-metric', { active: filter === 'supplementary' })} onClick={() => setFilter('supplementary')}>{[
              <span key="icon" className="sync-metric-icon is-supplementary" aria-hidden="true"><i className="mdi mdi-file-question-outline" /></span>,
              <span key="copy" className="sync-metric-copy"><span className="sync-metric-label">Supplementary</span><span className="sync-metric-value">{number(counts.supplementary)}<small>in the game, in no descriptor</small></span></span>,
            ]}</button>,
          ]}</div>
        ) : null}

        <div className="sync-folders" role="group" aria-label="Sync flow: GDA folder to Game path">{[
          <button key="gda" type="button" className="sync-folder-button" title={config.source} aria-label="Open GDA folder" onClick={() => { void openFolder('source'); }}>{[
            <i key="icon" className="mdi mdi-folder-open-outline sync-folder-icon" aria-hidden="true" />,
            <span key="label" className="sync-folder-label">GDA folder</span>,
            <span key="path" className="sync-folder-path">{config.source}</span>,
            <i key="open" className="mdi mdi-open-in-new sync-folder-open" aria-hidden="true" />,
          ]}</button>,
          <i key="direction" className="mdi mdi-arrow-down sync-folder-direction" aria-hidden="true" />,
          <button key="game" type="button" className="sync-folder-button" title={config.destination} aria-label="Open Game folder" onClick={() => { void openFolder('destination'); }}>{[
            <i key="icon" className="mdi mdi-folder-outline sync-folder-icon" aria-hidden="true" />,
            <span key="label" className="sync-folder-label">Game path</span>,
            <span key="path" className="sync-folder-path">{config.destination}</span>,
            <i key="open" className="mdi mdi-open-in-new sync-folder-open" aria-hidden="true" />,
          ]}</button>,
        ]}</div>
        {finishedAt ? <p className="sync-last-scan">Compared {time(finishedAt)}</p> : null}
      </section>

      <ReportNotice />

      {summary ? (
        !counts.all ? (
          <div className="card sync-empty grid-margin">
            <div className="card-body">
              <i aria-hidden="true" className="mdi mdi-check-all text-success" />
              <h4>All caught up.</h4>
              <p className="text-muted">Every resource of the game has an identical file in the GDA folder, and every file of the game is declared.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="card grid-margin">
              <div className="card-body sync-controls">{[
                <div key="filter" className="btn-group sync-filter" role="group" aria-label="Filter by status">{FILTERS.map(item => (
                  <ButtonTooltip key={item.key} text={item.hint}>
                    {bindings => (
                      <button {...bindings} type="button" className={classes('btn', 'btn-secondary', { active: filter === item.key })} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                        {item.label} <span className="sync-filter-count">{number(counts[item.key])}</span>
                      </button>
                    )}
                  </ButtonTooltip>
                ))}</div>,
                <div key="search" className="sync-search">
                  <i aria-hidden="true" className="mdi mdi-magnify" />
                  <input value={query} onChange={event => setQuery(event.target.value)} type="search" className="form-control" aria-label="Search resources not in sync" placeholder="Search by resource, GDA path or sequence…" />
                </div>,
              ]}</div>
            </div>

            {rows.length ? (
              <>
                <div className="results-heading">{shownSelectable.length ? (
                  <CheckBox checked={allSelected} label="Select all shown resources that have an action" onChange={toggleAll}>
                    {selectedRows.length ? `${number(selectedRows.length)} selected` : `${number(rows.length)} of ${number(counts.all)} resources`}{query ? <small className="text-muted"> matching “{query}”</small> : null}
                  </CheckBox>
                ) : (
                  <span>{number(rows.length)} of {number(counts.all)} resources{query ? <small className="text-muted"> matching “{query}”</small> : null}</span>
                )}</div>
                {/* A different resource, and an image with GDA images to choose from, spans the row, so its GDA files sit beside the game file. */}
                <div className="row asset-grid">{visible.map(row => (
                  <div key={row.id} className={classes(row.category === 'different' || candidatesOf(row).length ? 'col-12' : 'col-sm-6 col-xl-4', 'grid-margin', 'stretch-card')}>{
                    <ResourceCard row={row} revision={finishedAt ?? ''} selected={selected.has(row.id)} syncDisabled={!!busy || running}
                      candidates={candidatesOf(row)} chosen={chosenOf(row)?.absolutePath ?? null}
                      onToggle={() => toggle(row.id)} onOpen={() => setDetailsId(row.id)} onChoose={(file: string | null) => choose(row, file)} onSync={() => requestResourceSync([row], choices([row]))} />
                  }</div>
                ))}</div>
                {rows.length > shown ? (
                  <div className="sync-more grid-margin">
                    <span className="text-muted">Showing {number(shown)} of {number(rows.length)}</span><button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShown(value => value + PAGE_SIZE)}>Show {number(Math.min(PAGE_SIZE, rows.length - shown))} more</button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="card sync-none grid-margin">
                <div className="card-body text-muted">
                  <i aria-hidden="true" className="mdi mdi-magnify" />
                  <p>No resources match.</p>
                  <button type="button" className="btn btn-link p-0" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filter</button>
                </div>
              </div>
            )}
          </>
        )
      ) : null}

      {detailsRow ? (
        <ResourceDetails row={detailsRow} revision={finishedAt ?? ''} reportVersion={report?.version ?? 0}
          candidate={detailsCandidate} candidates={candidatesOf(detailsRow)} onChoose={(file: string) => choose(detailsRow, file)} onClose={() => setDetailsId(null)} />
      ) : null}
    </>
  );
}
