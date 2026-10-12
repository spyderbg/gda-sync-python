import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { classes } from '../classes';
import { algorithmTitle, baseName, declarationLabel, directoryOf, extensionOf, fileType, matchText, number, plural, previewFrames, resourceAction, rssBadges, rssStatusNames, rtfChangeNames, rtfChangeSummary, sequenceName, sequenceSummary, splitPath, typeIcons, viewSummary, type GdaCandidate } from '../format';
import type { RssResource } from '../types';
import { copy, openDeclaration, openResourceFolder } from '../workspace';
import CheckBox from './CheckBox';
import ReportThumbnail from './ReportThumbnail';
import RtfPreview from './RtfPreview';
import SequencePreview from './SequencePreview';
import ViewPreview from './ViewPreview';

// One resource of the GDA sync report as a card in the look of AssetCard: the game file's preview, name, folder and the
// report's status. A "different" resource also shows its GDA files as cards, closest folder first. Sync copies the first
// of them over the game file. A resource with an action, which a "missing" one has not, can be selected with its check
// box, which emits toggle.
// Clicking the card, or its details button, emits open to show the resource's details.
// An image sequence is one card that plays its frames, and clicking its preview plays it again from the first frame.
// It lists its files that are not in sync, and a "different" one plays the GDA files of its frames beside it.
// A "supplementary" file is in the game folder, but no descriptor declares it; numbered images among them are played
// as a guessed sequence.
// An RTF is one card for its folder, which shows its pages and lists its files that are not in sync; a "different" one
// shows the pages of the closest GDA folder beside it, which Sync makes the game's folder a copy of, and the other GDA
// folders that hold a .rtf file of its name. A view, a .json file of the game's v folder, shows itself as the game draws it,
// with its name and its elements; a different one shows its closest GDA file's view beside it.
// A different or missing image shows its candidates, the GDA images that may show the same picture (possible matches by
// content, and its same-named GDA files), on one line, most likely first, each with its probability and match type.
// Clicking one chooses it, or clears the choice, which emits choose: Sync copies the chosen image, so the copy button
// waits for a choice. One with the game file's contents cannot be chosen, since copying it changes nothing. The whole
// card of a GDA image chooses it, and Left and Right choose the previous and next GDA image. The game image's card and the
// GDA images' cards are one size; only the GDA images scroll sideways, right of the copy arrow.
const NO_CANDIDATES: GdaCandidate[] = [];
const STRIP_PADDING = 3; // .resource-candidates' padding, so the chosen card's ring shows

export default function ResourceCard({
  row, revision, selected = false, syncDisabled = false, candidates = NO_CANDIDATES, chosen = null, onToggle, onOpen, onSync, onChoose,
}: {
  row: RssResource; revision: string; selected?: boolean; syncDisabled?: boolean; candidates?: GdaCandidate[]; chosen?: string | null;
  onToggle: () => void; onOpen: () => void; onSync: () => void; onChoose: (file: string | null) => void;
}) {
  const icon = (fileName: string) => typeIcons[fileType(extensionOf(fileName))];
  const directory = row.directory;

  const resource = splitPath(row.resource);
  const resourceDirectory = directoryOf(row.resourcePath);
  const selectable = !!resourceAction(row);
  const matching = candidates.length > 0;
  const chosenCandidate = candidates.find(candidate => candidate.absolutePath === chosen) ?? null;
  const syncable = matching ? !!chosenCandidate?.syncable : resourceAction(row) === 'sync';
  // The GDA images' scroll area, and the height of its scroll bar, which the game image's card leaves room for below it so
  // that it stays as tall as the GDA images' cards.
  const stripRef = useRef<HTMLElement | null>(null);
  const [gutter, setGutter] = useState(0);
  useEffect(() => {
    const element = stripRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => { setGutter(element.offsetHeight - element.clientHeight); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [matching]);
  const chosenSeen = useRef(chosen);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    const pendingFocus = focusIndex.current;
    const changed = chosenSeen.current !== chosen;
    if (!changed && pendingFocus === null) return;
    chosenSeen.current = chosen;
    // Scroll the GDA images sideways, and only sideways, so the chosen one's card is in view: a choice made in the details
    // dialog shows when it closes, without moving the page behind the dialog.
    if (changed) {
      const element = stripRef.current;
      const index = candidates.findIndex(candidate => candidate.absolutePath === chosen);
      const card = index >= 0 ? element?.querySelector<HTMLElement>(`[data-index="${index}"]`) : null;
      if (element && card) {
        const area = element.getBoundingClientRect(), box = card.getBoundingClientRect();
        if (box.left < area.left) element.scrollLeft -= area.left - box.left + STRIP_PADDING;
        else if (box.right > area.right) element.scrollLeft += box.right - area.right + STRIP_PADDING;
      }
    }
    if (pendingFocus !== null) {
      focusIndex.current = null;
      stripRef.current?.querySelector<HTMLButtonElement>(`[data-index="${pendingFocus}"] .resource-candidate-select`)?.focus({ preventScroll: true });
    }
  }, [chosen, candidates]);
  /** Left and Right choose the previous and next GDA image that can be chosen: from the chosen one, or else from the
   * focused one, or else the first or last. The new choice gets the focus and scrolls into view. */
  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const direction = ({ ArrowLeft: -1, ArrowRight: 1 } as Record<string, number | undefined>)[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const list = candidates;
    const focused = Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index ?? NaN);
    const chosenIndex = list.findIndex(candidate => candidate.absolutePath === chosen);
    let index = (chosenIndex >= 0 ? chosenIndex : Number.isNaN(focused) ? (direction > 0 ? -1 : list.length) : focused) + direction;
    while (index >= 0 && index < list.length && !list[index].syncable) index += direction;
    if (index < 0 || index >= list.length) return;
    focusIndex.current = index;
    onChoose(list[index].absolutePath);
  }
  function candidateLabel(candidate: GdaCandidate) {
    if (candidate.absolutePath === chosen) return 'Copied on sync';
    if (!candidate.syncable) return 'Same file as the game';
    return candidate.sameName ? 'Same name' : 'Other name';
  }
  const gdaFiles = row.gdaFiles.map(file => ({ ...file, ...splitPath(file.path), directory: directoryOf(file.absolutePath) }));

  const sequence = row.sequence;
  const copyLabel = matching
    ? (chosenCandidate ? `Copy GDA image ${chosenCandidate.path} over game file ${row.resource}` : `Select a GDA image to copy over ${row.resource}`)
    : sequence ? `Copy different GDA frames over game files for ${row.resource}`
      : directory ? `Make the RTF folder ${row.resource} a copy of its GDA folder` : `Copy GDA file over game file for ${row.resource}`;
  // The game side plays the game files, and the GDA side the GDA file of each frame: the one that matched, or the closest,
  // which sync copies. A frame without a file to show stays empty.
  // Computed once per sequence: SequencePreview loads its frames again whenever it gets other ones.
  const gameFrames = useMemo(() => (sequence ? previewFrames(sequence, 'game') : []), [sequence]);
  const gdaFrames = useMemo(() => (sequence ? previewFrames(sequence, 'gda') : []), [sequence]);
  // Each file once: an atlas repeats one file in many frames.
  const unsynced = directory
    // An RTF's files that Sync copies or deletes.
    ? directory.files.filter(file => file.change && file.change !== 'identical')
      .map(file => ({ resourcePath: file.resourcePath ?? file.gdaPath ?? file.path, name: file.path, status: rtfChangeNames[file.change!] }))
    : [...new Map((sequence?.frames ?? [])
      .filter(frame => frame.category !== 'identical' && frame.category !== 'skipped' && frame.category !== 'supplementary')
      .map(frame => [frame.resourcePath, { ...frame, name: splitPath(frame.resource).name }])).values()];
  // A sequence's different files that have a GDA file to copy, each once.
  const copied = new Set((sequence?.frames ?? []).filter(frame => frame.category === 'different' && frame.gdaFiles.length).map(frame => frame.resourcePath)).size;
  const gdaFolders = [...new Set(gdaFiles.map(file => file.directory))];
  // The absolute folder of the first GDA file, whatever the separators of the backend's platform.
  const gdaFolder = gdaFiles[0]?.directory ?? '';

  return (
    <div className={classes('resource-card', `is-${row.category}`, { 'is-matching': matching })} style={matching ? ({ '--strip-gutter': `${gutter}px` } as CSSProperties) : undefined}>
      <article className={classes('card', 'asset-card', 'resource-game', { selected })}>
        {sequence ? <SequencePreview frames={gameFrames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={sequence.id ?? resource.name} revision={revision} /> : null}
        <div className="asset-hit-target" onClick={() => onOpen()}>
          {directory && row.rtf ? (
            <RtfPreview file={directory.project} name={resource.name} revision={revision} facts={row.rtf} />
          ) : row.view ? (
            <ViewPreview file={row.resourcePath} name={resource.name} revision={revision} facts={row.view} />
          ) : !sequence ? (
            <button type="button" className="resource-preview" aria-label={`Show the details of ${row.resource}`}>
              <ReportThumbnail file={directory?.project ?? row.resourcePath} name={directory ? baseName(directory.project) : resource.name} revision={revision} preview={row.category !== 'invalid'} />
            </button>
          ) : null}
          <div className="card-body">
            <p className="asset-name"><button type="button" className="resource-icon-button resource-file-copy" aria-label={`Copy the game path of ${resource.name}`} title="Copy the game path" onClick={event => { event.stopPropagation(); void copy(row.resourcePath); }}><i aria-hidden="true" className={classes('mdi', sequence ? 'mdi-animation-outline' : directory ? typeIcons.rtf : icon(resource.name))} /></button><span title={row.resourcePath}>{resource.name}</span></p>
            <p className="asset-meta"><span className="resource-folder"><button type="button" className="resource-icon-button resource-folder-open" aria-label={`Open game directory ${resourceDirectory}`} title={`Open ${resourceDirectory}`} onClick={event => { event.stopPropagation(); void openResourceFolder(row.resourcePath); }}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button><span title={resourceDirectory}>{resourceDirectory}</span></span>{row.scope !== 'game' ? <span>{row.scope}</span> : null}</p>
            {sequence ? (
              <p className="resource-sequence" title={sequence.paths.join('\n')}>
                <span className={classes('resource-sequence-id', { 'is-guessed': !!sequence.guessed })}>{sequenceName(sequence)}</span>{sequenceSummary(sequence)}{sequence.paths.length > 1 ? <> · {sequence.paths.length} paths</> : null}
              </p>
            ) : null}
            {row.view ? (
              <p className="resource-sequence" title={viewSummary(row.view)}>
                <span className="resource-sequence-id">{row.view.name}</span>{viewSummary(row.view)}{row.view.missingCount ? <> · {number(row.view.missingCount)} without resources</> : null}
              </p>
            ) : row.viewError ? <p className="resource-sequence">{row.viewError}</p> : null}
            {directory ? (
              <p className="resource-sequence">
                {row.rtf ? <>{number(row.rtf.pages.length)} page{plural(row.rtf.pages.length)} · </> : null}{number(directory.files.filter(file => file.resourcePath).length)} files
              </p>
            ) : null}
            <div className="asset-footer"><span className={classes('badge', 'resource-status', rssBadges[row.category])}>{rssStatusNames[row.category]}</span></div>
            {row.category !== 'different' && !matching ? (
              <div className="resource-declared">
                <small className="text-muted">{row.requiredBy.length ? 'Declared in' : 'No JSON descriptor'}</small>
                {row.requiredBy.map(use => (
                  <div key={`${use.descriptor}:${use.line}`} className="resource-declaration">
                    <button type="button" className="resource-icon-button resource-declaration-open" aria-label={`Open ${use.descriptor} at line ${use.line} in VS Code`} title={`Open in VS Code: ${use.descriptor}:${use.line}`} onClick={event => { event.stopPropagation(); void openDeclaration(use.descriptor, use.line); }}><i aria-hidden="true" className="mdi mdi-code-braces" /></button>
                    <span>{declarationLabel(use)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {unsynced.length ? (
          <details className="resource-frames">
            <summary>{number(unsynced.length)} file{plural(unsynced.length)} not in sync</summary>
            <ul>
              {unsynced.map(frame => <li key={frame.resourcePath}><span title={frame.resourcePath}>{frame.name}</span><small>{frame.status}</small></li>)}
            </ul>
          </details>
        ) : null}
        {selectable ? <CheckBox className="asset-check" checked={selected} label={`Select ${row.resource}`} onChange={() => onToggle()} /> : null}
        <button type="button" className="asset-menu" aria-label={`Show details for ${resource.name}`} title="Show details" onClick={() => onOpen()}><i aria-hidden="true" className="mdi mdi-dots-horizontal" /></button>
      </article>

      {row.category === 'different' || matching ? (
        <div className="resource-operation">
          <button type="button" className="resource-copy-button" aria-label={copyLabel} title={copyLabel}
                  disabled={syncDisabled || !syncable} onClick={event => { event.stopPropagation(); onSync(); }}>
            <img src="/icons/gda-copy-left.png" className="resource-copy-icon" alt="" aria-hidden="true" width="36" height="36" />
          </button>
          {matching ? (
            <small className="resource-operation-hint">
              {chosenCandidate ? `Copies ${baseName(chosenCandidate.path)}` : 'Choose a GDA image'}<br />{number(candidates.length)} image{plural(candidates.length)}
            </small>
          ) : null}
        </div>
      ) : null}

      {matching ? (
        <section ref={stripRef} className="resource-gda resource-candidates" aria-label={`GDA images that may show ${resource.name}`}
                 aria-description="Left and Right choose the previous and next image" onKeyDown={onKeyDown}>
          {candidates.map((candidate, index) => (
            <article key={candidate.absolutePath} data-index={index}
                     className={classes('card', 'asset-card', 'gda-file-card', 'resource-candidate', { selected: candidate.absolutePath === chosen, chosen: candidate.absolutePath === chosen, 'is-unsyncable': !candidate.syncable })}>
              <button type="button" className="resource-candidate-select" aria-pressed={candidate.absolutePath === chosen} disabled={!candidate.syncable}
                      aria-label={`${candidate.absolutePath === chosen ? 'Clear the choice of' : 'Choose'} GDA image ${candidate.path} for ${row.resource}`}
                      title={`${candidate.absolutePath}\n${algorithmTitle(candidate)}`} onClick={() => onChoose(candidate.absolutePath === chosen ? null : candidate.absolutePath)}>
                <ReportThumbnail file={candidate.absolutePath} name={baseName(candidate.path)} revision={revision} />
                <span className="resource-candidate-name"><i aria-hidden="true" className={classes('mdi', icon(candidate.path))} />{baseName(candidate.path)}</span>
                <span className="resource-candidate-match">{matchText(candidate)}</span>
              </button>
              <div className="card-body resource-candidate-body">
                <p className="asset-meta"><span className="resource-folder"><button type="button" className="resource-icon-button resource-folder-open" aria-label={`Open GDA directory ${directoryOf(candidate.absolutePath)}`} title={`Open ${directoryOf(candidate.absolutePath)}`} onClick={() => void openResourceFolder(candidate.absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button><span title={directoryOf(candidate.absolutePath)}>{directoryOf(candidate.absolutePath)}</span></span>{candidate.tree === 'common' ? <span>common GDA</span> : null}</p>
                <div className="asset-footer">
                  <span className={classes('badge', 'resource-status', candidate.absolutePath === chosen ? 'badge-primary' : 'badge-light')}>{candidateLabel(candidate)}</span>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : row.category === 'different' && sequence ? (
        <section className="resource-gda" aria-label={`GDA files of ${sequence.id}`}>
          <div className="resource-gda-files">
            <article className="card asset-card gda-file-card">
              <SequencePreview frames={gdaFrames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={`${sequence.id} from the GDA`} revision={revision} />
              <div className="card-body">
                <p className="asset-name"><button type="button" className="resource-icon-button resource-file-copy" aria-label={`Copy the GDA folder ${gdaFolders[0]}`} title="Copy the GDA folder" onClick={() => void copy(gdaFolder)}><i aria-hidden="true" className="mdi mdi-animation-outline" /></button><span title={gdaFolder}>{resource.name}</span></p>
                <p className="asset-meta"><span className="resource-folder"><button type="button" className="resource-icon-button resource-folder-open" aria-label={`Open GDA directory ${gdaFolder}`} title={`Open ${gdaFolder}`} onClick={() => void openResourceFolder(gdaFiles[0].absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button><span title={gdaFolders.join('\n')}>{gdaFolder}</span></span>{gdaFolders.length > 1 ? <span>+{gdaFolders.length - 1} folder{plural(gdaFolders.length - 1)}</span> : null}</p>
                <p className="resource-sequence"><span className="resource-sequence-id">{sequence.id}</span>{sequenceSummary(sequence)}</p>
                <div className="asset-footer">
                  <span className="badge badge-primary resource-status">{number(copied)} file{plural(copied)} copied on sync</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      ) : row.category === 'different' && directory ? (
        <section className="resource-gda" aria-label={`GDA folders of ${resource.name}`}>
          <div className="resource-gda-files">
            {gdaFiles.map((folder, index) => (
              <article key={folder.absolutePath} className="card asset-card gda-file-card">
                <div className="asset-hit-target" onClick={() => onOpen()}>
                  {!index && row.gdaRtf && directory.gdaProject ? (
                    <RtfPreview file={directory.gdaProject} name={folder.name} revision={revision} facts={row.gdaRtf} />
                  ) : (
                    <button type="button" className="resource-preview" aria-label={`Show the details of ${row.resource}`}>
                      <div className="thumbnail"><div className="generic-preview rtf"><i aria-hidden="true" className={classes('mdi', typeIcons.rtf)} /></div></div>
                    </button>
                  )}
                </div>
                <div className="card-body">
                  <p className="asset-name"><button type="button" className="resource-icon-button resource-file-copy" aria-label={`Copy the GDA folder ${folder.path}`} title="Copy the GDA folder" onClick={() => void copy(folder.absolutePath)}><i aria-hidden="true" className={classes('mdi', typeIcons.rtf)} /></button><span title={folder.absolutePath}>{folder.name}</span></p>
                  <p className="asset-meta"><span className="resource-folder"><button type="button" className="resource-icon-button resource-folder-open" aria-label={`Open GDA directory ${folder.directory}`} title={`Open ${folder.directory}`} onClick={() => void openResourceFolder(folder.absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button><span title={folder.directory}>{folder.directory}</span></span>{folder.tree === 'common' ? <span>common GDA</span> : null}</p>
                  {!index && row.gdaRtf ? <p className="resource-sequence">{number(row.gdaRtf.pages.length)} page{plural(row.gdaRtf.pages.length)} · {number(directory.files.filter(file => file.gdaPath).length)} files</p> : null}
                  <div className="asset-footer">
                    <span className={classes('badge', 'resource-status', index ? 'badge-light' : 'badge-primary')}>{index ? 'Other match' : `Copied on sync: ${rtfChangeSummary(directory)}`}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : row.category === 'different' ? (
        <section className="resource-gda" aria-label={`GDA files named ${resource.name}`}>
          <div className="resource-gda-files">
            {gdaFiles.map((file, index) => (
              <article key={file.absolutePath} className="card asset-card gda-file-card">
                {!index && row.gdaView ? (
                  <div className="asset-hit-target" onClick={() => onOpen()}>
                    <ViewPreview file={file.absolutePath} name={file.name} revision={revision} facts={row.gdaView} />
                  </div>
                ) : (
                  <button type="button" className="resource-preview" aria-label={`Show the details of ${row.resource}`} onClick={() => onOpen()}>
                    <ReportThumbnail file={file.absolutePath} name={file.name} revision={revision} />
                  </button>
                )}
                <div className="card-body">
                  <p className="asset-name"><button type="button" className="resource-icon-button resource-file-copy" aria-label={`Copy the GDA path ${file.path}`} title="Copy the GDA path" onClick={() => void copy(file.absolutePath)}><i aria-hidden="true" className={classes('mdi', icon(file.name))} /></button><span title={file.absolutePath}>{file.name}</span></p>
                  <p className="asset-meta"><span className="resource-folder"><button type="button" className="resource-icon-button resource-folder-open" aria-label={`Open GDA directory ${file.directory}`} title={`Open ${file.directory}`} onClick={() => void openResourceFolder(file.absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button><span title={file.directory}>{file.directory}</span></span>{file.tree === 'common' ? <span>common GDA</span> : null}</p>
                  {file.match ? <p className="resource-sequence resource-match" title={algorithmTitle(file.match)}>{matchText(file.match)}</p> : null}
                  <div className="asset-footer">
                    <span className={classes('badge', 'resource-status', index ? 'badge-light' : 'badge-primary')}>{index ? 'Other match' : 'Copied on sync'}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
