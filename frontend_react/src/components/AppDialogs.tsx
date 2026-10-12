import { classes } from '../classes';
import { matchText, plural, resourceActionIcons, rtfChangeSummary, typeIcons } from '../format';
import type { RssResource } from '../types';
import { confirmResourceActions, pendingAction, stopApplication, useWorkspace } from '../workspace';
import AppModal from './AppModal';

const HEADINGS = {
  sync: 'Sync {} resource',
  remove: 'Remove the declarations of {} invalid resource',
  delete: 'Delete {} supplementary resource',
} as const;

// A descriptor outside the game folder, such as a common one, can be included by other games.
const sharedDescriptor = (row: RssResource) => row.requiredBy.some(use => use.descriptor.startsWith('..'));

export default function AppDialogs() {
  const { config, ui } = useWorkspace();
  const resourceActions = ui.resourceActions;

  // The GDA sync report resources waiting for confirmation, by what applying them does. An image is synced from its chosen
  // GDA image, which the list names.
  const resourceKind = (() => {
    const actions = new Set((resourceActions ?? []).map(pendingAction));
    return actions.size > 1 ? 'mixed' as const : [...actions][0] ?? null;
  })();
  const syncSource = (row: RssResource) => ui.resourceChoices[row.id]?.path ?? row.gdaFiles[0]?.path ?? '';
  const resourceGroups = (['sync', 'remove', 'delete'] as const)
    .map(action => ({ action, rows: (resourceActions ?? []).filter(row => pendingAction(row) === action) }))
    .filter(group => group.rows.length)
    .map(group => ({ ...group, heading: HEADINGS[group.action].replace('{}', String(group.rows.length)) + plural(group.rows.length) }));
  const resourceTitle = ({
    sync: 'Ready to bring things up to date?',
    remove: 'Remove these declarations?',
    delete: 'Delete these files?',
    mixed: 'Apply these changes to the game?',
  })[resourceKind ?? 'sync'];
  const resourceCount = resourceActions?.length ?? 0;
  const resources = `${resourceCount} resource${plural(resourceCount)}`;
  const resourceConfirm = ({
    sync: `Sync ${resources}`,
    remove: `Remove ${resources}`,
    delete: `Delete ${resources}`,
    mixed: `Apply to ${resources}`,
  })[resourceKind ?? 'sync'];

  return (
    <>
      {resourceActions && (
        <AppModal title={resourceTitle} onClose={() => { ui.resourceActions = null; }}>
          <div className="modal-body">
            {resourceGroups.map(group => (
              <section key={group.action} className="resource-action-group">
                {resourceGroups.length > 1 ? <h6><i aria-hidden="true" className={classes('mdi', resourceActionIcons[group.action])} />{group.heading}</h6> : null}
                {group.action === 'sync' ? <p>Copy {group.rows.length} resource{plural(group.rows.length)} of the GDA sync report from the GDA folder to the game: an image from the GDA image chosen on its card, or else the one most likely to show the same picture, any other file from its closest GDA file; an image sequence copies each of its different frames. Existing game files will be replaced, with their previous versions saved in your backups.</p> : null}
                {group.action === 'sync' && group.rows.some(row => row.directory) ? (
                  <p className="text-warning">
                    An RTF's folder becomes a copy of its closest GDA folder: its files that the GDA folder does not have are deleted, unless a descriptor declares them, and saved in your backups first.
                  </p>
                ) : null}
                {group.action === 'remove' ? (
                  <p>Remove the entries that declare {group.rows.length === 1 ? 'this invalid resource' : `these ${group.rows.length} invalid resources`} from the *Data.json descriptors: each entry, image sequence or audio sample that names {group.rows.length === 1 ? 'it' : 'them'}. The rest of each descriptor stays as it is, and its previous version is saved in your backups.</p>
                ) : null}
                {group.action === 'delete' ? (
                  <p>Delete {group.rows.length === 1 ? 'this supplementary resource' : `these ${group.rows.length} supplementary resources`} from the game folder; no descriptor declares {group.rows.length === 1 ? 'it' : 'them'}, a guessed sequence goes with all its files, and an RTF with its whole folder. Each file is saved in your backups first.</p>
                ) : null}
                {group.action === 'sync' && group.rows.some(row => row.scope === 'common') ? (
                  <p className="text-warning">
                    {group.rows.filter(row => row.scope === 'common').length} of them are common resources, shared with other games.
                  </p>
                ) : null}
                {group.action === 'remove' && group.rows.some(sharedDescriptor) ? (
                  <p className="text-warning">
                    {group.rows.filter(sharedDescriptor).length} of them are declared in descriptors outside the game folder, which other games can include.
                  </p>
                ) : null}
                <ul className="list-group sync-file-list">
                  {group.rows.map(row => {
                    const choice = group.action === 'sync' ? ui.resourceChoices[row.id] : undefined;
                    return (
                      <li key={row.id} className="list-group-item">
                        <i aria-hidden="true" className={classes('mdi', row.sequence ? 'mdi-animation-outline' : row.directory ? typeIcons.rtf : 'mdi-file-outline', 'text-muted')} /><span title={group.action === 'sync' ? `${syncSource(row)} → ${row.resource}` : row.resourcePath}>{row.resource}</span>{choice ? <small className="text-muted ml-2 resource-action-source">from {choice.path} · {matchText(choice)}</small> : null}{row.sequence ? <small className="text-muted ml-2">{row.sequence.id ?? `${row.sequence.frames.length} files`}</small> : null}{row.directory ? <small className="text-muted ml-2">{group.action === 'sync' ? rtfChangeSummary(row.directory) : `${row.directory.files.length} file${plural(row.directory.files.length)}`}</small> : null}{group.action === 'remove' ? <small className="text-muted ml-2">{row.requiredBy.map(use => `${use.descriptor}:${use.line}`).join(', ')}</small> : null}{row.scope === 'common' ? <span className="badge badge-light">common</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="mb-2">The GDA sync then compares again.</p>
            <p className="modal-folder"><i aria-hidden="true" className="mdi mdi-folder-outline text-primary" />{config.destination}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={() => { ui.resourceActions = null; }}>Cancel</button>
            <button type="button" className={classes('btn', resourceKind === 'sync' ? 'btn-primary' : 'btn-danger')} disabled={!resourceActions.length} onClick={confirmResourceActions}><i aria-hidden="true" className={classes('mdi', resourceActionIcons[resourceKind ?? 'sync'])} />{resourceConfirm}</button>
          </div>
        </AppModal>
      )}

      {ui.shutdownConfirm ? (
        <AppModal title="Stop EGT GDA Sync?" onClose={() => { ui.shutdownConfirm = false; }}>
          <div className="modal-body"><p className="mb-0">This stops the local server. Your files, settings, and sync history stay saved. Launch EGT GDA Sync to open this workspace again.</p></div>
          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={() => { ui.shutdownConfirm = false; }}>Keep working</button>
            <button type="button" className="btn btn-danger" onClick={stopApplication}><i aria-hidden="true" className="mdi mdi-power" />Stop application</button>
          </div>
        </AppModal>
      ) : null}

      {ui.help ? (
        <AppModal title="A little help for your workflow" onClose={() => { ui.help = false; }}>
          <div className="modal-body help-body">
            <p>Browse the game’s resources, then bring the ones that differ from the GDA up to date on the Sync page.</p>
            <ul className="list-arrow">
              <li><strong>Explore your library.</strong> The Asset library lists the files in the game path. Filter by type, search, and click any asset to see its details and preview.</li>
              <li><strong>Choose what moves forward.</strong> On the Sync page, select resources, or use “Sync all pending” to copy every different GDA file to the game.</li>
              <li><strong>Keep it fresh.</strong> After editing your GDA files, use Rescan to compare them with the game again.</li>
            </ul>
            <table className="table table-sm mb-3">
              <tbody>
                <tr><td>Focus asset search</td><td className="text-right"><kbd>Ctrl / ⌘ K</kbd></td></tr>
                <tr><td>Close a dialog or menu</td><td className="text-right"><kbd>Esc</kbd></td></tr>
              </tbody>
            </table>
            <p className="text-muted small mb-0">DDS previews: DXT1, DXT3, DXT5, RGB24/32 and DX10 BC7 (UNORM / sRGB). Other DDS formats can still be copied. Model previews in this demo are illustrations.</p>
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
