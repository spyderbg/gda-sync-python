import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classes } from '../classes';
import AppModal from '../components/AppModal';
import CheckBox from '../components/CheckBox';
import PageHeader from '../components/PageHeader';
import { ago, number, plural, size, time } from '../format';
import type { BackupFile, BackupList, BackupOperation } from '../types';
import { copy, restoreBackup, useWorkspace } from '../workspace';

// The backups: the files that syncs, cleanups, view edits and restores replaced or deleted, one operation each, newest
// first. Only the selected workspace's are listed unless All workspaces is on; a backup whose workspace is not known is
// listed only then. An operation opens to its files, each with what the operation did to it and how it is now. Restore
// all, or a file's Restore, copies the backups back after a confirmation; the files there now are backed up first, so a
// restore can be restored too, and a file that is the same as its backup is skipped.
const ACTIONS: Record<BackupOperation['action'], { label: string; badge: string; icon: string }> = {
  sync: { label: 'Sync', badge: 'badge-success', icon: 'mdi-sync' },
  cleanup: { label: 'Cleanup', badge: 'badge-warning', icon: 'mdi-broom' },
  edit: { label: 'Edit', badge: 'badge-info', icon: 'mdi-pencil-outline' },
  restore: { label: 'Restore', badge: 'badge-primary', icon: 'mdi-backup-restore' },
  backup: { label: 'Backup', badge: 'badge-secondary', icon: 'mdi-archive-outline' },
};
const NOW: Record<BackupFile['now'], { label: string; tone: string }> = {
  same: { label: 'Same as the backup', tone: 'text-success' },
  changed: { label: 'Changed since', tone: 'text-warning' },
  missing: { label: 'Not there', tone: 'text-danger' },
  unknown: { label: 'Unknown', tone: 'text-muted' },
};

export default function BackupsView() {
  const { busy, config } = useWorkspace();
  const [list, setList] = useState<BackupList | null>(null);
  const [loadError, setLoadError] = useState('');
  const [everyWorkspace, setEveryWorkspace] = useState(false);
  const load = useCallback(async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/backups', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      setList(body as BackupList);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [config.defaultWorkspace, load]);

  const operations = useMemo(() => (list?.backups ?? [])
    .filter(item => everyWorkspace || item.workspace?.id === list?.workspaceId), [list, everyWorkspace]);
  const others = (list?.backups.length ?? 0) - operations.length;

  // The files of each opened operation, read when it opens and again after a restore.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const [files, setFiles] = useState<ReadonlyMap<string, BackupFile[] | string>>(() => new Map());
  async function loadFiles(id: string) {
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      setFiles(current => new Map(current).set(id, body.files as BackupFile[]));
    } catch (e) {
      setFiles(current => new Map(current).set(id, (e as Error).message));
    }
  }
  function toggle(item: BackupOperation) {
    if (opened.has(item.id)) {
      setOpened(current => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      return;
    }
    setOpened(current => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });
    void loadFiles(item.id);
  }
  const filesOf = (id: string) => (Array.isArray(files.get(id)) ? files.get(id) as BackupFile[] : []);

  // A restore waits in a dialog for confirmation: an operation's files, all of them or one.
  const [restoring, setRestoring] = useState<{ operation: BackupOperation; files: string[] | null } | null>(null);
  const restoringFiles = restoring ? filesOf(restoring.operation.id) : [];
  const restoringPaths = restoring?.files ?? (restoringFiles.length ? restoringFiles.map(item => item.path) : []);
  async function confirmRestore() {
    const pending = restoring;
    if (!pending) return;
    const result = await restoreBackup(pending.operation.id, pending.files ?? undefined);
    setRestoring(null);
    if (!result) return;
    await load();
    for (const id of openedRef.current) void loadFiles(id);
  }
  const actionOf = (item: BackupOperation) => ACTIONS[item.action] ?? ACTIONS.backup;

  return (
    <>
      <PageHeader
        title="Backups"
        links={<li><span>{number(operations.length)} operation{plural(operations.length)}</span></li>}
      />

      <div className="card grid-margin">
        <div className="card-body backups-intro">
          <p className="mb-2">Syncs, cleanups and view edits save every file they replace or delete here before they change it. Restore copies a file back where it was; the file there now is saved here first, so a restore can be restored too.</p>
          <div className="backups-folder">
            <span className="text-muted">Folder:</span>
            <code>{list?.backupPath ?? '…'}</code>
            {list ? (
              <button type="button" className="details-icon" aria-label="Copy the backups folder" title="Copy the backups folder" onClick={() => { void copy(list.backupPath); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
            ) : null}
          </div>
          <CheckBox checked={everyWorkspace} label="Show the backups of every workspace" onChange={setEveryWorkspace}>
            All workspaces{!everyWorkspace && others ? <small className="text-muted"> ({number(others)} more)</small> : null}
          </CheckBox>
        </div>
      </div>

      {loadError ? (
        <div className="alert alert-danger"><i aria-hidden="true" className="mdi mdi-alert-circle-outline" /> {loadError}</div>
      ) : list && !operations.length ? (
        <div className="card empty-state grid-margin">
          <div className="card-body">
            <i aria-hidden="true" className="mdi mdi-backup-restore text-muted" />
            <h4>No backups yet</h4>
            <p className="text-muted">{everyWorkspace ? 'Nothing has been replaced or deleted yet.' : 'Nothing of this workspace has been replaced or deleted yet.'}</p>
          </div>
        </div>
      ) : null}

      <div className="backups-list" aria-label="Backups, newest first">
        {operations.map(item => {
          const entry = files.get(item.id);
          const action = actionOf(item);
          return (
            <article key={item.id} className="card backup-operation" data-backup={item.id}>
              <div className="card-body">
                <div className="backup-row">
                  <div className="backup-when">
                    <span className={classes('badge', action.badge)}><i aria-hidden="true" className={classes('mdi', action.icon)} /> {action.label}</span>
                    <h5 className="backup-time">{time(item.date)}</h5>
                    <small className="text-muted">{ago(item.date)}{everyWorkspace ? <> · {item.workspace?.name ?? 'workspace not known'}</> : null}</small>
                  </div>
                  <div className="backup-what">
                    <p className="backup-message">{item.message || (item.legacy ? 'A backup from before backups were recorded' : '—')}</p>
                    <small className="text-muted">{number(item.fileCount)} file{plural(item.fileCount)} · {size(item.size)}</small>
                    {!item.restorable ? <small className="text-danger d-block">Where its files belong is not known, so it cannot be restored.</small> : null}
                  </div>
                  <div className="backup-actions">
                    <button type="button" className="btn btn-outline-secondary btn-sm" aria-expanded={opened.has(item.id)} onClick={() => toggle(item)}>
                      <i aria-hidden="true" className={classes('mdi', opened.has(item.id) ? 'mdi-chevron-up' : 'mdi-chevron-down')} />Files
                    </button>
                    <button type="button" className="btn btn-outline-primary btn-sm" disabled={!item.restorable || !!busy}
                      onClick={() => { setRestoring({ operation: item, files: null }); void loadFiles(item.id); }}>
                      <i aria-hidden="true" className="mdi mdi-backup-restore" />Restore all
                    </button>
                  </div>
                </div>
                {opened.has(item.id) ? (
                  <div className="backup-files">
                    {typeof entry === 'string' ? (
                      <p className="text-danger mb-0">{entry}</p>
                    ) : !files.has(item.id) ? (
                      <p className="text-muted mb-0"><i aria-hidden="true" className="mdi mdi-loading mdi-spin" /> Reading the files…</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm mb-0" aria-label={`Files of the backup of ${time(item.date)}`}>
                          <thead><tr><th scope="col">File</th><th scope="col">The operation</th><th scope="col" className="text-right">Size</th><th scope="col">Now</th><th scope="col"><span className="sr-only">Restore</span></th></tr></thead>
                          <tbody>
                            {filesOf(item.id).map(file => (
                              <tr key={file.path} data-file={file.path}>
                                <td className="backups-file-path" title={item.root ? `${item.root}/${file.path}` : file.path}>{file.path}</td>
                                <td>{file.change === 'deleted' ? 'Deleted it' : 'Replaced it'}</td>
                                <td className="text-right text-nowrap">{size(file.size)}</td>
                                <td className={NOW[file.now].tone}>{NOW[file.now].label}</td>
                                <td className="text-right">
                                  <button type="button" className="btn btn-link btn-sm backup-restore-file" disabled={!item.restorable || file.now === 'same' || !!busy}
                                    aria-label={`Restore ${file.path}`} title={file.now === 'same' ? 'The file is the same as its backup' : `Restore ${file.path}`}
                                    onClick={() => setRestoring({ operation: item, files: [file.path] })}>Restore</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {restoring ? (
        <AppModal title={restoring.files ? 'Restore this file?' : `Restore ${number(restoring.operation.fileCount)} file${plural(restoring.operation.fileCount)}?`} onClose={() => setRestoring(null)}>
          <div className="modal-body">
            <p>Copy {restoring.files ? 'the file' : 'the files'} of the backup of {time(restoring.operation.date)} back to <code className="backups-file-path">{restoring.operation.root}</code>:</p>
            <ul className="backup-restore-list">
              {restoringPaths.slice(0, 12).map(path => <li key={path} className="backups-file-path">{path}</li>)}
              {restoringPaths.length > 12 ? <li className="text-muted">and {number(restoringPaths.length - 12)} more</li> : null}
            </ul>
            <p className="mb-0 text-muted">The files there now are saved in the backups first, and a file that is the same as its backup is skipped.</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={() => setRestoring(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy === 'restore'} onClick={() => { void confirmRestore(); }}>
              <i aria-hidden="true" className={classes('mdi', busy === 'restore' ? 'mdi-loading mdi-spin' : 'mdi-backup-restore')} />Restore
            </button>
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
