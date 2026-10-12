import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import AssetDetails from '../components/AssetDetails';
import ButtonTooltip from '../components/ButtonTooltip';
import CheckBox from '../components/CheckBox';
import ReportThumbnail from '../components/ReportThumbnail';
import ViewsDetails from '../components/ViewsDetails';
import WorkspaceHeader from '../components/WorkspaceHeader';
import { classes } from '../classes';
import { assetBadges, assetMatches, assetSection, baseName, declarationLabel, number, plural, size, splitPath } from '../format';
import { useAssetReport } from '../hooks/useAssetReport';
import type { AssetCategory, AssetFolder, ReportAsset } from '../types';
import { useWorkspace } from '../workspace';

// The asset library shows the newest asset report of the workspace's game: every asset that its descriptors declare,
// with the entries that load it, and the files of the game folder that nothing declares. Rescan writes a new
// one. The sidebar's types, the header's folders, the status filters and the search narrow the assets down.
type Filter = 'all' | AssetCategory;
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  {
    key: 'all', label: 'All',
    hint: 'Every asset of the newest asset report: each file that the game\'s *Data.json descriptors, and those they '
      + 'include, (or the workspace\'s resource_paths) declare, in any folder, and each file of the game folder with a '
      + 'compared extension that nothing declares.\n\n'
      + 'An image sequence is one asset with its frames, as in the GDA sync. Rescan reads the game again.',
  },
  {
    key: 'available', label: 'Available',
    hint: 'A descriptor declares the file and it exists, so the game can load it.\n\n'
      + 'An image sequence is available when every one of its files exists.',
  },
  {
    key: 'missing', label: 'Missing',
    hint: 'A descriptor declares the file, but it does not exist in the game, so the game cannot load it.\n\n'
      + 'An image sequence is missing when any of its files does not exist and none is invalid.',
  },
  {
    key: 'invalid', label: 'Invalid',
    hint: 'A descriptor declares a path that leads outside the resources folder that holds the game folder, so the file '
      + 'is not read.\n\nAn image sequence is invalid when any of its files is.',
  },
  {
    key: 'supplementary', label: 'Supplementary',
    hint: 'A file in the game folder, with a compared extension, that no descriptor declares, so the game does not load '
      + 'it.\n\nNumbered images in one folder with the same name and extension, at least five numbers in a row, are '
      + 'guessed to be one image sequence.',
  },
];
const PAGE_SIZE = 200;
// The asset report version this release writes, ASSET_REPORT_VERSION in egt_gda_sync/asset_report.py.
const REPORT_VERSION = 6;
const stackable = (row: ReportAsset) => row.type === 'view' && !!row.view;
const readable = (row: { category: AssetCategory }) => row.category === 'available' || row.category === 'supplementary';
// A row of the list shows the file of the asset, a sequence's first frame, or the background of an RTF's first
// page that has one, else its .rtf file.
function listFile(row: ReportAsset) {
  const page = readable(row) ? row.rtf?.pages.find(item => item.found && item.background) : undefined;
  if (page?.background) return { resourcePath: page.background, resource: baseName(page.background), category: row.category };
  if (row.directory) return { resourcePath: row.directory.project, resource: baseName(row.directory.project), category: row.category };
  return row.sequence?.frames[0] ?? row;
}

export default function AssetsLibraryView() {
  const { assetReport, ui } = useWorkspace();
  const { report, loadError } = useAssetReport();
  const [filter, setFilter] = useState<Filter>('all');
  // The header's folder that narrows the assets down, by path; null shows every folder.
  const [folder, setFolder] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  // Views can be selected to show them together in one dialog, as the game draws several at once, in the order they were
  // selected, the first at the bottom. Any other asset opens on its own. A new report that no longer lists a selected view
  // drops it.
  const [stacked, setStacked] = useState<string[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);

  const state = !assetReport?.reportPath ? 'none' : loadError ? 'error' : report ? 'ready' : 'loading';
  const revision = report?.summary.finishedAt ?? '';
  const outdated = !!assetReport?.reportPath && (assetReport.version ?? 1) < REPORT_VERSION;
  // What an earlier version did not report: fonts before version 2, RTFs before version 3, views before version 4, the
  // views of other folders and the folders the assets are in before version 5, and the counts of the sidebar's Images and
  // ImagesSeq before version 6.
  const outdatedNote = useMemo(() => {
    const version = assetReport?.version ?? 1;
    if (version >= 5) return 'This report was written by an earlier version, which did not count images and image sequences apart, so the sidebar counts image sequences as images. Rescan to update it.';
    const types = version < 2 ? 'fonts, RTFs and views' : version < 3 ? 'RTFs and views' : version < 4 ? 'views' : 'views outside the game folder';
    return `This report was written by an earlier version, which counted ${types} as other files and did not read them, and did not list the folders its assets are in. Rescan to update it.`;
  }, [assetReport]);
  const assets = useMemo(() => report?.assets ?? [], [report]);
  // The folders of the report, or for an earlier report, only the game folder, which does not filter.
  const folders = useMemo<AssetFolder[]>(() => report?.folders ?? [], [report]);
  useEffect(() => {
    setFolder(current => (current && !folders.some(item => item.path === current) ? null : current));
  }, [folders]);
  // The sidebar's section and the header's folder narrow the assets that the status filters count.
  const typed = useMemo(() => assets.filter(row => (ui.category === 'all' || assetSection(row) === ui.category)
    && (!folder || row.folder === folder)), [assets, ui.category, folder]);
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: typed.length, available: 0, missing: 0, invalid: 0, supplementary: 0 };
    for (const row of typed) result[row.category]++;
    return result;
  }, [typed]);
  const rows = useMemo(() => {
    const needle = ui.query.trim().toLowerCase();
    return typed.filter(row => (filter === 'all' || row.category === filter) && assetMatches(row, needle));
  }, [typed, filter, ui.query]);
  const visible = useMemo(() => rows.slice(0, shown), [rows, shown]);
  useEffect(() => { setShown(PAGE_SIZE); }, [filter, folder, ui.query, ui.category, report]);

  // Clicking an asset shows its details; a new report that no longer lists it closes them.
  const detailsRow = useMemo(
    () => (ui.inspecting ? assets.find(row => row.id === ui.inspecting) ?? null : null),
    [assets, ui.inspecting],
  );
  const stackRows = useMemo(
    () => stacked.flatMap(id => assets.filter(row => row.id === id && stackable(row))),
    [stacked, assets],
  );
  function toggleView(row: ReportAsset) {
    setStacked(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id]);
  }
  const layerOf = (row: ReportAsset) => stacked.indexOf(row.id) + 1 || null;
  useEffect(() => {
    setStacked(current => {
      const kept = current.flatMap(id => assets.filter(row => row.id === id && stackable(row)).map(row => row.id));
      return kept.length === current.length ? current : kept;
    });
  }, [assets]);
  function showAll() {
    ui.query = '';
    ui.category = 'all';
    setFilter('all');
    setFolder(null);
  }
  const folderName = folders.find(item => item.path === folder)?.relative;

  return (
    <>
      <WorkspaceHeader filter={filter} folder={folder} folders={folders} onFilterChange={setFilter} onFolderChange={setFolder} />

      {state !== 'ready' ? (
        <div className="card empty-state grid-margin">
          <div className="card-body">
            <i aria-hidden="true" className={classes('mdi', state === 'loading' ? 'mdi-loading mdi-spin text-muted' : state === 'error' ? 'mdi-alert-circle-outline text-danger' : 'mdi-file-document-outline text-muted')} />
            <h4>{state === 'loading' ? 'Loading the asset report…' : state === 'error' ? 'The asset report could not be loaded' : 'No asset report yet'}</h4>
            <p className="text-muted">{state === 'error' ? loadError : 'Rescan lists the game\'s assets: every file that its descriptors declare, with the entries that load it, and the files of the game folder that nothing declares.'}</p>
          </div>
        </div>
      ) : (
        <>
          {outdated ? (
            <div className="alert alert-info library-outdated" role="note"><i aria-hidden="true" className="mdi mdi-information-outline" />{outdatedNote}</div>
          ) : null}
          <div className="library-controls">
            <div className="library-filter-toolbar" role="group" aria-label="Asset filters and layout">{[
              <div key="layout" className="btn-group toolbar-item" role="group" aria-label="Layout">{[
                <button key="grid" type="button" className={classes('btn', 'btn-secondary', { active: ui.layout === 'grid' })} aria-label="Grid view" aria-pressed={ui.layout === 'grid'} onClick={() => { ui.layout = 'grid'; }}><i aria-hidden="true" className="mdi mdi-view-grid-outline" /></button>,
                <button key="list" type="button" className={classes('btn', 'btn-secondary', { active: ui.layout === 'list' })} aria-label="List view" aria-pressed={ui.layout === 'list'} onClick={() => { ui.layout = 'list'; }}><i aria-hidden="true" className="mdi mdi-view-list-outline" /></button>,
              ]}</div>,
              <div key="status" className="btn-group library-status-filter" role="group" aria-label="Filter by status">{FILTERS.map(item => (
                <ButtonTooltip key={item.key} text={item.hint}>
                  {bindings => (
                    <button {...bindings} type="button" className={classes('btn', 'btn-secondary', { active: filter === item.key })} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                      {item.label} <span className="library-filter-count">{number(counts[item.key])}</span>
                    </button>
                  )}
                </ButtonTooltip>
              ))}</div>,
              <form key="search" className="asset-search" role="search" onSubmit={event => event.preventDefault()}>
                <div className="form-group search-field">
                  <i aria-hidden="true" className="mdi mdi-magnify" />
                  <input value={ui.query} onChange={event => { ui.query = event.target.value; }} type="text" className="form-control" data-asset-search="" aria-label="Search assets" placeholder="Search paths, ids or sequences…" />
                  {ui.query ? (
                    <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { ui.query = ''; }}><i aria-hidden="true" className="mdi mdi-close" /></button>
                  ) : (
                    <kbd className="search-shortcut">Ctrl K</kbd>
                  )}
                </div>
              </form>,
            ]}</div>
          </div>

          <div className="results-heading">{[
            <span key="count">{number(rows.length)} of {number(counts.all)} assets{folderName ? <small className="text-muted"> in {folderName === '.' ? 'the game folder' : folderName}</small> : null}{ui.query ? <small className="text-muted"> matching “{ui.query}”</small> : null}</span>,
            stacked.length ? (
              <span key="views" className="library-views-selection" role="group" aria-label="Selected views">{[
                <i key="icon" aria-hidden="true" className="mdi mdi-layers-outline" />,
                `${number(stacked.length)} view${plural(stacked.length)} selected`,
                stacked.length < 2 ? <small key="hint" className="text-muted"> · select another to show them together</small> : null,
                <button key="show" type="button" className="btn btn-primary btn-sm" disabled={stacked.length < 2} onClick={() => setViewsOpen(true)}>Show together</button>,
                <button key="clear" type="button" className="btn btn-link btn-sm" onClick={() => setStacked([])}>Clear</button>,
              ]}</span>
            ) : null,
          ]}</div>

          {rows.length && ui.layout === 'grid' ? (
            <div className="row asset-grid">{visible.map(row => (
              <div key={row.id} className="col-sm-6 col-xl-4 grid-margin stretch-card">{
                <AssetCard row={row} revision={revision} inspected={ui.inspecting === row.id} selectable={stackable(row)} selected={stacked.includes(row.id)}
                  layer={layerOf(row)} onOpen={() => { ui.inspecting = row.id; }} onToggle={() => toggleView(row)} />
              }</div>
            ))}</div>
          ) : rows.length ? (
            <div className="card asset-list grid-margin">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr><th className="library-check"><span className="sr-only">Select views</span></th><th>Asset</th><th className="d-none d-md-table-cell">Folder</th><th>Status</th><th className="d-none d-lg-table-cell">Loaded by</th><th className="text-right">Size</th></tr>
                  </thead>
                  <tbody>
                    {visible.map(row => {
                      const file = listFile(row);
                      return (
                        <tr key={row.id} className={classes('asset-card', 'asset-row', { inspected: ui.inspecting === row.id })}>
                          <td className="library-check">
                            {stackable(row) ? <CheckBox checked={stacked.includes(row.id)} label={`Select ${splitPath(row.resource).name} to show with other views`} onChange={() => toggleView(row)} /> : null}
                          </td>
                          <td>
                            <button type="button" className="asset-hit-target" aria-label={`Inspect ${splitPath(row.resource).name}`} onClick={() => { ui.inspecting = row.id; }}>{[
                              <ReportThumbnail key="thumb" file={file.resourcePath} name={splitPath(file.resource).name} revision={revision} preview={readable(file)} />,
                              <span key="name" className="asset-name">{splitPath(row.resource).name}</span>,
                            ]}</button>
                          </td>
                          <td className="d-none d-md-table-cell text-muted">{splitPath(row.resource).folder}</td>
                          <td><span className={classes('badge', assetBadges[row.category])}>{row.category}</span></td>
                          <td className="d-none d-lg-table-cell text-muted library-use">
                            {row.requiredBy.length ? declarationLabel(row.requiredBy[0]) + (row.requiredBy.length > 1 ? ` +${row.requiredBy.length - 1}` : '') : '—'}
                          </td>
                          <td className="text-right text-nowrap">{row.size !== undefined ? size(row.size) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card empty-state grid-margin">
              <div className="card-body">
                <i aria-hidden="true" className="mdi mdi-magnify text-muted" />
                <h4>No assets found</h4>
                <p className="text-muted">{assets.length ? 'Try a different search or clear your filters.' : 'The game folder has no assets.'}</p>
                <button type="button" className="btn btn-outline-primary" onClick={showAll}>Show all assets</button>
              </div>
            </div>
          )}
          {rows.length > shown ? (
            <div className="library-more grid-margin">
              <span className="text-muted">Showing {number(shown)} of {number(rows.length)}</span><button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShown(value => value + PAGE_SIZE)}>Show {number(Math.min(PAGE_SIZE, rows.length - shown))} more</button>
            </div>
          ) : null}
        </>
      )}

      {detailsRow ? <AssetDetails row={detailsRow} revision={revision} onClose={() => { ui.inspecting = null; }} /> : null}
      {viewsOpen && stackRows.length > 1 ? <ViewsDetails rows={stackRows} revision={revision} onClose={() => setViewsOpen(false)} /> : null}
    </>
  );
}
