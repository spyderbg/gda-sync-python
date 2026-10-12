import { useMemo } from 'react';
import { classes } from '../classes';
import { number, plural, size, time } from '../format';
import type { AssetCategory, AssetFolder } from '../types';
import { copy, generateAssetReport, openFolder, openResourceFolder, useWorkspace } from '../workspace';

// The asset library's header: the newest asset report with Rescan, the counts of its assets by status, which
// filter the library when clicked, and the folders its assets are in, each on its own line, which filter the library
// when clicked too. A report from before version 5 lists no folders, so only the game path is shown.
const FOLDER_KINDS: Record<AssetFolder['kind'], { label: string; icon: string; hint: string }> = {
  game: { label: 'Game path', icon: 'mdi-folder-outline', hint: 'The game folder' },
  shared: { label: 'Shared', icon: 'mdi-folder-network-outline', hint: 'A folder of the resources folder that holds files the game declares, such as the features it includes' },
  outside: { label: 'Outside', icon: 'mdi-folder-alert-outline', hint: 'A folder outside the resources folder, which the game cannot load from' },
};

export default function WorkspaceHeader({
  filter, folder, folders, onFilterChange, onFolderChange,
}: {
  filter: 'all' | AssetCategory;
  folder: string | null;
  folders: AssetFolder[];
  onFilterChange: (filter: 'all' | AssetCategory) => void;
  onFolderChange: (folder: string | null) => void;
}) {
  const { assetReport, busy, config } = useWorkspace();
  const lines = useMemo<AssetFolder[]>(() => (folders.length ? folders
    : [{ path: config.destination, relative: '.', kind: 'game', assets: -1 }]), [folders, config.destination]);
  const filtering = folders.length > 0;
  const shownPath = (item: AssetFolder) => (item.kind === 'game' ? item.path : item.relative);
  function choose(item: AssetFolder) {
    if (filtering) onFolderChange(folder === item.path ? null : item.path);
    else void openFolder('destination');
  }
  function open(item: AssetFolder) {
    if (item.kind === 'game') void openFolder('destination');
    else void openResourceFolder(item.path, true);
  }
  const summary = assetReport?.summary ?? null;
  const problems = summary ? summary.missing + summary.invalid : 0;
  const reportPath = assetReport?.reportPath;

  return (
    <section className="workspace-header" aria-label="Workspace summary">
      <div className="workspace-header-top">{[
        <div key="intro" className="workspace-header-intro">
          <p className="workspace-subtitle">{[
            <span key="label">Asset report:</span>,
            <span key="path" className="workspace-sync-data-path">{reportPath || 'None yet'}</span>,
            reportPath ? <button key="copy" type="button" className="workspace-sync-data-copy" aria-label="Copy asset report path" title="Copy asset report path" onClick={() => { void copy(reportPath); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button> : null,
          ]}</p>
        </div>,
        <div key="actions" className="workspace-header-actions">
          <button type="button" className="btn btn-outline-primary" disabled={!!busy} onClick={() => { void generateAssetReport(); }}>
            <i aria-hidden="true" className={classes('mdi', busy === 'report' ? 'mdi-loading mdi-spin' : 'mdi-file-document-outline')} /><span>{busy === 'report' ? 'Generating…' : 'Rescan'}</span>
          </button>
        </div>,
      ]}</div>

      {summary ? (
        <div className="workspace-metrics">{[
          <button key="total" type="button" className={classes('workspace-metric', { active: filter === 'all' })} onClick={() => onFilterChange('all')}>{[
            <span key="icon" className="workspace-metric-icon total" aria-hidden="true"><i className="mdi mdi-layers-outline" /></span>,
            <span key="copy" className="workspace-metric-copy"><span className="workspace-metric-label">Total assets</span><span className="workspace-metric-value">{number(summary.assets)}<small>{number(summary.available)} available · {size(summary.size)}</small></span></span>,
          ]}</button>,
          <button key="problems" type="button" className={classes('workspace-metric', { active: filter === 'missing' || filter === 'invalid' })} onClick={() => onFilterChange(summary.missing || !summary.invalid ? 'missing' : 'invalid')}>{[
            <span key="icon" className="workspace-metric-icon problems" aria-hidden="true"><i className="mdi mdi-file-alert-outline" /></span>,
            <span key="copy" className="workspace-metric-copy"><span className="workspace-metric-label">Cannot be loaded</span><span className="workspace-metric-value">{number(problems)}<small>{number(summary.missing)} missing · {number(summary.invalid)} invalid</small></span></span>,
          ]}</button>,
          <button key="supplementary" type="button" className={classes('workspace-metric', { active: filter === 'supplementary' })} onClick={() => onFilterChange('supplementary')}>{[
            <span key="icon" className="workspace-metric-icon supplementary" aria-hidden="true"><i className="mdi mdi-file-question-outline" /></span>,
            <span key="copy" className="workspace-metric-copy"><span className="workspace-metric-label">Supplementary</span><span className="workspace-metric-value">{number(summary.supplementary)}<small>in the game, in no descriptor</small></span></span>,
          ]}</button>,
        ]}</div>
      ) : null}

      <div className="workspace-folder-strip" role="group" aria-label={filtering ? 'Asset folders: show the assets of one' : 'Game path'}>{lines.map(item => (
          <div key={item.path} className={classes('workspace-folder-line', { active: filtering && folder === item.path })}>{[
            <button key="folder" type="button" className="workspace-folder" title={`${FOLDER_KINDS[item.kind].hint}: ${item.path}`}
              aria-label={filtering ? `Show the assets in ${shownPath(item)}` : 'Open Game folder'} aria-pressed={filtering ? folder === item.path : undefined} onClick={() => choose(item)}>{[
              <i key="icon" className={classes('mdi', FOLDER_KINDS[item.kind].icon, 'workspace-folder-icon')} aria-hidden="true" />,
              <span key="label" className="workspace-folder-label">{FOLDER_KINDS[item.kind].label}</span>,
              <span key="path" className="workspace-folder-path">{shownPath(item)}</span>,
              item.assets >= 0 ? <span key="count" className="workspace-folder-count">{number(item.assets)} asset{plural(item.assets)}</span> : null,
            ]}</button>,
            filtering
              ? <button key="open" type="button" className="workspace-folder-open" title={`Open ${item.path}`}
                aria-label={item.kind === 'game' ? 'Open Game folder' : `Open ${item.relative} folder`} onClick={() => open(item)}><i className="mdi mdi-open-in-new" aria-hidden="true" /></button>
              : <i key="open" className="mdi mdi-open-in-new workspace-folder-open" aria-hidden="true" />,
          ]}</div>
        ))}</div>
      {summary ? <p className="workspace-last-scan">Generated {time(summary.finishedAt)}</p> : null}
    </section>
  );
}
