import { useMemo, useState } from 'react';
import { classes } from '../classes';
import { assetBadges, number, plural, splitPath, viewSummary } from '../format';
import type { ReportAsset, ViewLayer } from '../types';
import AppModal from './AppModal';
import ViewPreview from './ViewPreview';

// Several views of the asset report in one dialog, drawn on one screen as the game shows them together: each in the
// order it was selected, the first at the bottom, with the large view preview's layers to hide and reorder them, and a
// table of the views. Only views open together; any other asset opens on its own. Escape closes the dialog.
export default function ViewsDetails({
  rows, revision, onClose,
}: {
  rows: ReportAsset[];
  revision: string;
  onClose: () => void;
}) {
  const nameOf = (row: ReportAsset) => splitPath(row.resource).name.replace(/\.json$/i, '');
  const layers = useMemo<ViewLayer[]>(() => rows.flatMap(row => (row.view ? [{ file: row.resourcePath, name: nameOf(row), facts: row.view }] : [])), [rows]);
  const first = layers[0];
  // The views' elements can be moved; closing with moves that are not saved asks first.
  const [unsaved, setUnsaved] = useState(false);
  function close() {
    if (unsaved && !window.confirm('Discard the elements you moved without saving them?')) return;
    onClose();
  }

  return (
    <AppModal title={`${number(layers.length)} views`} xl onClose={close}>
      <div className="modal-body details-dialog asset-details">
        <div className="details-previews">
          <figure className="details-preview">
            <figcaption>Views, as the game draws them together</figcaption>
            {first ? <ViewPreview file={first.file} name={first.name} revision={revision} facts={first.facts} layers={layers} large editable onDirty={setUnsaved} /> : null}
          </figure>
        </div>
        <section className="details-facts" aria-label="Views">
          <h6 className="details-heading mt-0">Views, in the order they are drawn</h6>
          <table className="table table-sm details-table views-details-table">
            <thead><tr><th scope="col">#</th><th scope="col">View</th><th scope="col">Folder</th><th scope="col">Screen</th><th scope="col">Elements</th><th scope="col">Status</th></tr></thead>
            <tbody>{rows.map((row, index) => (
              <tr key={row.id}>
                <td className="text-muted">{index + 1}</td>
                <td className="details-code" title={row.resourcePath}>{nameOf(row)}{row.view && row.view.name !== nameOf(row) ? <small className="text-muted"> {row.view.name}</small> : null}</td>
                <td className="details-code text-muted">{splitPath(row.resource).folder}</td>
                <td className="text-nowrap">{row.view ? `${row.view.resolution.width} × ${row.view.resolution.height}` : '—'}</td>
                <td>{row.view ? viewSummary(row.view) : '—'}{row.view?.missingCount ? <span className="text-danger"> · {number(row.view.missingCount)} without resource{plural(row.view.missingCount)}</span> : null}</td>
                <td><span className={classes('badge', assetBadges[row.category])}>{row.category}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </div>
      <div className="modal-footer details-footer">{[
        <span key="names" className="text-muted">{layers.map(layer => layer.name).join(' · ')}</span>,
        <button key="close" type="button" className="btn btn-light" onClick={close}>Close</button>,
      ]}</div>
    </AppModal>
  );
}
