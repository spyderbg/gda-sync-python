import { useMemo } from 'react';
import { classes } from '../classes';
import { assetBadges, assetFrames, baseName, declarationLabel, number, plural, sequenceName, sequenceSummary, size, splitPath, typeIcons, viewSummary } from '../format';
import type { ReportAsset } from '../types';
import CheckBox from './CheckBox';
import ReportThumbnail from './ReportThumbnail';
import RtfPreview from './RtfPreview';
import SequencePreview from './SequencePreview';
import ViewPreview from './ViewPreview';

// One asset of the asset report as a card, in the look of the Sync page's cards: its preview, name, folder, size and
// image size, the report's status, and the descriptor entries that load it. An image sequence plays its frames, and
// clicking its preview plays it again from the first frame. An RTF is its folder, named by it: it shows its pages, its
// languages, how many files the folder has, and how many of the files its pages draw are missing. A view, a .json file of
// the game's v folder, shows itself as the game draws it, its name, its elements by type, and how many of them name
// resources that cannot be found. Clicking the card, or its details button, emits open. A view can also be selected with
// its check box, which emits toggle, to show it with other views in one dialog; a selected view shows its place in the
// drawing order (layer).
export default function AssetCard({
  row, revision, inspected = false, selectable = false, selected = false, layer = null, onOpen, onToggle,
}: {
  row: ReportAsset;
  revision: string;
  inspected?: boolean;
  selectable?: boolean;
  selected?: boolean;
  layer?: number | null;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const resource = splitPath(row.resource);
  const sequence = row.sequence;
  const frames = useMemo(() => (sequence ? assetFrames(sequence) : []), [sequence]);
  const readable = row.category === 'available' || row.category === 'supplementary';
  const dimensions = row.dimensions ? `${row.dimensions.width} × ${row.dimensions.height}` : '';
  // A sequence's files that do not exist or cannot be used, each once: an atlas repeats one file in many frames.
  const unavailable = useMemo(() => [...new Map((sequence?.frames ?? [])
    .filter(frame => frame.category === 'missing' || frame.category === 'invalid')
    .map(frame => [frame.resourcePath, { ...frame, name: splitPath(frame.resource).name }])).values()], [sequence]);
  const shownUses = row.requiredBy.slice(0, 3);
  // The first Font entry whose declared characters the font does not all have.
  const fontGap = row.requiredBy.find(use => use.coverage?.missingCount);
  const rtf = readable ? row.rtf : undefined;
  const view = readable ? row.view : undefined;
  // The file a preview shows: an RTF's .rtf file, or the asset's own.
  const file = row.directory?.project ?? row.resourcePath;

  return (
    <article className={classes('card', 'asset-card', 'report-asset', `is-${row.category}`, { inspected, selected })}>{[
      sequence ? <SequencePreview key="sequence" frames={frames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={sequence.id ?? resource.name} revision={revision} /> : null,
      <div key="hit" className="asset-hit-target" onClick={() => onOpen()}>
        {rtf ? <RtfPreview file={file} name={resource.name} revision={revision} facts={rtf} />
          : view ? <ViewPreview file={file} name={resource.name} revision={revision} facts={view} />
            : !sequence ? (
              <button type="button" className="report-asset-preview" aria-label={`Inspect ${resource.name}`}>
                <ReportThumbnail file={file} name={baseName(file)} revision={revision} preview={readable && row.preview !== false} />
              </button>
            ) : null}
        <div className="card-body">
          <p className="asset-name"><i aria-hidden="true" className={classes('mdi', sequence ? 'mdi-animation-outline' : typeIcons[row.type])} /><span title={row.resourcePath}>{resource.name}</span></p>
          <p className="asset-meta"><span title={row.resourcePath}>{resource.folder}</span>{row.size !== undefined ? <span>{size(row.size)}</span> : null}</p>
          {sequence ? (
            <p className="report-asset-sequence" title={sequence.paths.join('\n')}><span className={classes('report-asset-sequence-id', { 'is-guessed': sequence.guessed })}>{sequenceName(sequence)}</span>{sequenceSummary(sequence)}</p>
          ) : null}
          {rtf || row.directory ? (
            <p className="report-asset-sequence">{rtf ? <>{number(rtf.pages.length)} page{plural(rtf.pages.length)}{rtf.languages.length ? ` · ${rtf.languages.join(', ')}` : ''} · </> : null}{row.directory ? <>{number(row.directory.files.length)} file{plural(row.directory.files.length)}</> : null}</p>
          ) : null}
          {view ? <p className="report-asset-sequence" title={viewSummary(view)}><span className="report-asset-sequence-id">{view.name}</span>{viewSummary(view)}</p> : null}
          <div className="asset-footer"><span className={classes('badge', 'report-asset-status', assetBadges[row.category])}>{row.status}</span>{dimensions ? <small>{dimensions}</small> : null}</div>
          <div className="report-asset-declared">{[
            <small key="label" className="text-muted">{row.requiredBy.length ? 'Loaded by' : 'No JSON descriptor'}</small>,
            ...shownUses.map(use => <span key={`${use.descriptor}:${use.line}`}>{declarationLabel(use)}</span>),
            row.requiredBy.length > shownUses.length ? <span key="more" className="text-muted">+{number(row.requiredBy.length - shownUses.length)} more</span> : null,
          ]}</div>
          {rtf?.missingCount ? (
            <p className="report-asset-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" />{`${number(rtf.missingCount)} file${plural(rtf.missingCount)} that its pages draw ${rtf.missingCount === 1 ? 'is' : 'are'} missing`}</p>
          ) : row.rtfError ? (
            <p className="report-asset-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" />{row.rtfError}</p>
          ) : null}
          {view?.missingCount ? (
            <p className="report-asset-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" />{`${number(view.missingCount)} element${plural(view.missingCount)} without ${view.missingCount === 1 ? 'its resource' : 'their resources'}`}</p>
          ) : row.viewError ? (
            <p className="report-asset-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" />{row.viewError}</p>
          ) : null}
          {fontGap?.coverage ? (
            <p className="report-asset-warning"><i aria-hidden="true" className="mdi mdi-alert-outline" />{`${number(fontGap.coverage.missingCount)} declared character${plural(fontGap.coverage.missingCount)} of ${fontGap.id ?? 'a Font entry'} not in the font`}</p>
          ) : null}
        </div>
      </div>,
      unavailable.length ? (
        <details key="frames" className="report-asset-frames">
          <summary>{number(unavailable.length)} file{plural(unavailable.length)} {row.category === 'invalid' ? 'not usable' : 'missing'}</summary>
          <ul>
            {unavailable.map(frame => (
              <li key={frame.resourcePath}><span title={frame.resourcePath}>{frame.name}</span><small>{frame.category}</small></li>
            ))}
          </ul>
        </details>
      ) : null,
      selectable ? <CheckBox key="check" className="asset-check" checked={selected} label={`Select ${resource.name} to show with other views`} onChange={() => onToggle()} /> : null,
      selected && layer ? <span key="layer" className="badge badge-primary report-asset-layer" title={`Drawn as layer ${layer}, over the views selected before it`}>{layer}</span> : null,
      <button key="menu" type="button" className="asset-menu" aria-label={`Show details for ${resource.name}`} title="Show details" onClick={() => onOpen()}><i aria-hidden="true" className="mdi mdi-dots-horizontal" /></button>,
    ]}</article>
  );
}
