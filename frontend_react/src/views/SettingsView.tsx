import { Fragment, useState } from 'react';
import { classes } from '../classes';
import PageHeader from '../components/PageHeader';
import { contractPath, expandPath } from '../format';
import type { FolderKey } from '../types';
import { copy, navigate, openFolder, saveSettings, useWorkspace } from '../workspace';

export default function SettingsView() {
  const { busy, config, data, session, ui } = useWorkspace();
  // The folders as workspace.json writes them, which can use its global paths such as {games_root_path}.
  const stored = (folder: FolderKey) => config.templates?.[folder] ?? config[folder];
  const [form, setForm] = useState(() => ({
    name: config.name,
    source: stored('source'),
    destination: stored('destination'),
  }));
  const hasChanges = form.name !== config.name
    || form.source !== stored('source')
    || form.destination !== stored('destination');
  const windows = session.platform === 'Windows';
  // The scan knows only the saved folders, so a path being edited is not reported until it is saved.
  const missing = (folder: FolderKey) => data!.missingFolders.includes(folder) && form[folder] === stored(folder);
  const globalPaths = data?.globalPaths ?? {};
  const placeholder = (name: string) => `{${name}}`;
  /** What happens to a folder being entered: a path that uses global paths expands, one inside a global path is saved
   * with it, and a global path that workspace.json does not define is an error. */
  function pathHint(folder: FolderKey): { text: string; error?: boolean; expanded?: string } | null {
    const value = form[folder].trim();
    if (/\{[A-Za-z0-9_]+\}/.test(value)) {
      const { expanded, unknown } = expandPath(value, globalPaths);
      if (unknown.length) {
        const names = Object.keys(globalPaths).map(name => `{${name}}`).join(', ');
        return { text: `workspace.json defines no global path {${unknown[0]}}${names ? `. Its global paths: ${names}` : ''}.`, error: true };
      }
      return { text: `Expands to ${expanded}`, expanded };
    }
    const contracted = contractPath(value, globalPaths);
    return contracted !== value ? { text: `Saved as ${contracted}` } : null;
  }
  const anyMissing = missing('source') || missing('destination');
  const sourceHint = pathHint('source');
  const destinationHint = pathHint('destination');
  const sourceExpanded = sourceHint?.expanded;
  const destinationExpanded = destinationHint?.expanded;

  async function save() {
    if (!hasChanges || busy) return;
    await saveSettings(form);
  }

  return (
    <>
      <PageHeader
        title="Workspace settings"
        linksRight={<li><a href="#" onClick={event => { event.preventDefault(); navigate('history'); }}>Sync history</a></li>}
      />

      <div className="row">
        <div className="col-12 grid-margin stretch-card">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <h4 className="card-title mb-0">Workspace Connection</h4>
                {anyMissing ? (
                  <span className="badge badge-warning ml-auto"><i aria-hidden="true" className="mdi mdi-folder-alert-outline" />Folder not found</span>
                ) : (
                  <span className="badge badge-success ml-auto"><i aria-hidden="true" className="mdi mdi-lan-connect" />Connected</span>
                )}
              </div>
              <p className="card-description mt-2">Connect your GDA assets to their home in the game.</p>
              <form className="forms-sample" onSubmit={event => { event.preventDefault(); void save(); }}>
                <div className="form-group">
                  <label htmlFor="project-name">Project name</label>
                  <input id="project-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="form-control" required maxLength={80} placeholder="Your project name" />
                </div>
                <div className="form-group">
                  <label htmlFor="source-folder" className="settings-folder-label">
                    <a href="#" className="settings-folder-link" title={`Open GDA folder: ${config.source}`} onClick={event => { event.preventDefault(); void openFolder('source'); }}>
                      <span className="settings-folder-name"><i aria-hidden="true" className="mdi mdi-harddisk text-success" />GDA path</span>
                      <i aria-hidden="true" className="mdi mdi-open-in-new" />
                    </a>
                  </label>
                  <input id="source-folder" value={form.source} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} className="form-control" aria-describedby={missing('source') ? 'source-help source-missing' : 'source-help'} required placeholder={windows ? 'C:\\Users\\you\\project\\gda' : '/home/you/project/gda'} />
                  {sourceHint ? (
                    <div className="settings-path-hint-row">
                      <small className={classes('form-text', 'settings-path-hint', sourceHint.error ? 'text-danger' : 'text-muted')} role="status">{sourceHint.text}</small>
                      {sourceExpanded ? (
                        <button type="button" className="settings-path-copy" aria-label={`Copy full GDA path ${sourceExpanded}`} title="Copy full GDA path" onClick={() => { void copy(sourceExpanded); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
                      ) : null}
                    </div>
                  ) : null}
                  <small id="source-help" className="form-text text-muted">The originals you’re working with. All subfolders are included.</small>
                  {missing('source') ? (
                    <div id="source-missing" className="alert alert-warning folder-missing" role="status">
                      <i aria-hidden="true" className="mdi mdi-alert-outline" />The GDA folder does not exist. No assets can be listed until it does.
                    </div>
                  ) : null}
                </div>
                <div className="flow-hint"><i aria-hidden="true" className="mdi mdi-arrow-down" />Assets flow from GDA to Game</div>
                <div className="form-group">
                  <label htmlFor="destination-folder" className="settings-folder-label">
                    <a href="#" className="settings-folder-link" title={`Open Game folder: ${config.destination}`} onClick={event => { event.preventDefault(); void openFolder('destination'); }}>
                      <span className="settings-folder-name"><i aria-hidden="true" className="mdi mdi-folder-outline text-primary" />Game path</span>
                      <i aria-hidden="true" className="mdi mdi-open-in-new" />
                    </a>
                  </label>
                  <input id="destination-folder" value={form.destination} onChange={event => setForm(current => ({ ...current, destination: event.target.value }))} className="form-control" aria-describedby={missing('destination') ? 'destination-help destination-missing' : 'destination-help'} required placeholder={windows ? 'C:\\Users\\you\\project\\game' : '/home/you/project/game'} />
                  {destinationHint ? (
                    <div className="settings-path-hint-row">
                      <small className={classes('form-text', 'settings-path-hint', destinationHint.error ? 'text-danger' : 'text-muted')} role="status">{destinationHint.text}</small>
                      {destinationExpanded ? (
                        <button type="button" className="settings-path-copy" aria-label={`Copy full Game path ${destinationExpanded}`} title="Copy full Game path" onClick={() => { void copy(destinationExpanded); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
                      ) : null}
                    </div>
                  ) : null}
                  <small id="destination-help" className="form-text text-muted">A separate folder where your synced assets belong.</small>
                  {missing('destination') ? (
                    <div id="destination-missing" className="alert alert-warning folder-missing" role="status">
                      <i aria-hidden="true" className="mdi mdi-alert-outline" />The Game folder does not exist. Assets cannot be synced until it does.
                    </div>
                  ) : null}
                </div>
                {Object.keys(globalPaths).length ? (
                  <div className="settings-global-paths">
                    <small className="text-muted">Global paths of workspace.json, which a path can use, and which a path inside one is saved with:</small>
                    <dl>
                      {Object.entries(globalPaths).map(([name, path]) => (
                        <Fragment key={name}>
                          <dt>{placeholder(name)}</dt><dd>{path}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                ) : null}
                <button type="submit" className="btn btn-primary settings-save" disabled={!!busy || !hasChanges}>
                  <i aria-hidden="true" className={classes('mdi', busy === 'settings' ? 'mdi-loading mdi-spin' : 'mdi-check')} /><span>Save workspace</span>
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="col-12 grid-margin stretch-card">
          <div className="card">
            <div className="card-body">
              <div className="row">
                <div className="col-lg-8">
                  <h4 className="card-title">A Simple, Local Connection</h4>
                  <p>EGT GDA Sync copies assets from your GDA folder to your Game folder, keeping the same folder structure.</p>
                  <ul className="list-ticked">
                    <li>Original GDA files are preserved</li>
                    <li>Existing Game versions are backed up</li>
                    <li>File contents determine sync status</li>
                    <li>No uploads or cloud accounts</li>
                  </ul>
                  <h5 className="mt-4 mb-2">Your backups live here</h5>
                  <code className="backup-path">{data!.backupPath}</code>
                </div>
                <div className="col-lg-4 settings-stop">
                  <section className="settings-stop-panel" aria-labelledby="settings-stop-heading">
                    <h4 id="settings-stop-heading" className="card-title">Stop EGT GDA Sync</h4>
                    <p>Close the local server when you’re done.</p>
                    <p className="text-muted">Closing the last EGT GDA Sync page also stops it.</p>
                    <button type="button" className="btn btn-outline-danger" disabled={!!busy} onClick={() => { ui.shutdownConfirm = true; }}><i aria-hidden="true" className="mdi mdi-power" />Stop application</button>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
