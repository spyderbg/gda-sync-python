import { useMemo, useState } from 'react';
import { classes } from '../classes';
import { assetBadges, assetFrames, baseName, codePoint, extensionOf, fileType, firstRtfPage, number, plural, sequenceName, size, splitPath, time, typeIcons, viewTable } from '../format';
import type { FileFacts, ReportAsset } from '../types';
import { copy, openDeclaration, openResourceFolder } from '../workspace';
import AppModal from './AppModal';
import AudioPreview from './AudioPreview';
import FontPreview from './FontPreview';
import ReportThumbnail from './ReportThumbnail';
import RtfPreview from './RtfPreview';
import SequencePreview from './SequencePreview';
import ViewPreview from './ViewPreview';

// The details of one asset of the asset report in a dialog, like the details of a GDA sync report resource: a large
// preview, what the status means, the descriptor entries that load the asset, its game path with buttons to copy it or
// open its folder, and the format, size, resolution, pixel format, mip levels and time of its file. An image sequence
// plays in the dialog, with how it plays, the totals of its files and each frame's status. An audio file plays once
// when the dialog opens. A font is drawn with itself, with the characters and at the size of the Font entry chosen, its
// names and glyph count, and for each Font entry, which of its declared characters the font has. An RTF is its folder,
// named by it: it draws its pages, in each of its languages, with its tool version, its pages, each of which the table
// shows on the preview, the images and videos its pages draw that are missing, and every file of the folder; its folder
// button opens the RTF's folder itself. A view's elements can be moved. Escape closes the dialog.
type Fact = { label: string; value: string; warn?: boolean };

/** Up to three different values, then how many more there are. */
function listed(values: string[]) {
  const distinct = [...new Set(values)];
  return distinct.length > 3 ? `${distinct.slice(0, 3).join(', ')} +${distinct.length - 3} more` : distinct.join(', ');
}

export default function AssetDetails({
  row, revision, onClose,
}: {
  row: ReportAsset;
  revision: string;
  onClose: () => void;
}) {
  // A view's elements can be moved; closing with moves that are not saved asks first.
  const [unsaved, setUnsaved] = useState(false);
  function close() {
    if (unsaved && !window.confirm('Discard the elements you moved without saving them?')) return;
    onClose();
  }

  const sequence = row.sequence;
  const name = splitPath(row.resource).name;
  const readable = row.category === 'available' || row.category === 'supplementary';
  const isAudio = fileType(extensionOf(baseName(row.resourcePath))) === 'audio';
  const frames = useMemo(() => (sequence ? assetFrames(sequence) : []), [sequence]);
  // The Font entries that declare characters of a font, and the one whose characters the preview draws.
  const isFont = row.type === 'font';
  const fontUses = useMemo(() => row.requiredBy.filter(use => use.chars), [row.requiredBy]);
  const [chosen, setChosen] = useState(0);
  // An RTF's facts, its folder, its .rtf file, which the previews show, and the page its preview shows.
  const rtf = readable ? row.rtf : undefined;
  const directory = row.directory;
  const file = directory?.project ?? row.resourcePath;
  const [rtfPage, setRtfPage] = useState(() => (row.rtf ? firstRtfPage(row.rtf) : 0));
  // A view's facts: what its elements draw.
  const view = readable ? row.view : undefined;
  const [rowId, setRowId] = useState(row.id);
  if (row.id !== rowId) {
    setRowId(row.id);
    setChosen(0);
    setRtfPage(row.rtf ? firstRtfPage(row.rtf) : 0);
  }
  const fontUse = fontUses[chosen] ?? null;

  const table = useMemo<Fact[]>(() => {
    const current = sequence;
    // A sequence's files, each once: an atlas repeats one file in many frames.
    const files: (FileFacts & { resourcePath: string })[] = current
      ? [...new Map(current.frames.map(frame => [frame.resourcePath, frame])).values()]
      : [row];
    const found = files.filter(item => item.size !== undefined);
    const dimensions = found.flatMap(item => (item.dimensions ? [item.dimensions] : []));
    const newest = found.map(item => item.modifiedAt ?? '').sort().pop();
    const font = row.font;
    if (row.type === 'rtf') {
      const facts = rtf;
      const folder = directory;
      return [
        { label: folder ? 'Project file' : 'File format', value: [folder ? baseName(folder.project) : '', facts ? 'RTF Tool project (JSON)' : ''].filter(Boolean).join(', ') || 'RTF' },
        ...(facts ? [
          { label: 'Tool version', value: facts.version ?? '—' },
          { label: 'Languages', value: facts.languages.join(', ') || '—' },
          { label: 'Pages', value: `${number(facts.pages.length)}${facts.pages.length ? `, ${listed(facts.pages.map(item => `${item.width} × ${item.height}`))}` : ''}` },
          { label: 'Images and videos', value: `${number(facts.images)} image${plural(facts.images)}, ${number(facts.videos)} video${plural(facts.videos)}` },
          { label: 'Missing files', value: facts.missingCount ? number(facts.missingCount) : 'None', warn: !!facts.missingCount },
          { label: 'Texts and styles', value: `${number(facts.texts)} text${plural(facts.texts)}, ${number(facts.styles)} style${plural(facts.styles)}` },
        ] : [{ label: 'RTF', value: row.rtfError ?? (readable ? 'Rescan to read its pages' : '—') }]),
        ...(folder ? [{ label: 'Files', value: `${number(folder.files.length)} file${plural(folder.files.length)}` }] : []),
        { label: folder ? 'Total size' : 'File size', value: row.size !== undefined ? size(row.size) : '—' },
        { label: folder ? 'Last modified, newest' : 'Last modified', value: row.modifiedAt ? time(row.modifiedAt) : '—' },
      ];
    }
    if (row.type === 'view') {
      return [
        ...(view ? viewTable(view) : [{ label: 'View', value: row.viewError ?? (readable ? 'Rescan to read its elements' : '—') }]),
        { label: 'File size', value: row.size !== undefined ? size(row.size) : '—' },
        { label: 'Last modified', value: row.modifiedAt ? time(row.modifiedAt) : '—' },
      ];
    }
    if (isFont) {
      return [
        { label: 'File format', value: font?.format ?? (extensionOf(name).toUpperCase() || '—') },
        ...(font ? [
          { label: 'Family', value: font.family ?? '—' }, { label: 'Style', value: font.style ?? '—' },
          { label: 'Version', value: font.version ?? '—' }, { label: 'Glyphs', value: font.glyphs !== undefined ? number(font.glyphs) : '—' },
        ] : [{ label: 'Font', value: row.fontError ?? '—' }]),
        { label: 'File size', value: row.size !== undefined ? size(row.size) : '—' },
        { label: 'Last modified', value: row.modifiedAt ? time(row.modifiedAt) : '—' },
      ];
    }
    return [
      { label: 'File format', value: listed(files.map(item => extensionOf(baseName(item.resourcePath)).toUpperCase()).filter(Boolean)) || '—' },
      ...(current ? [{ label: 'Files', value: `${number(found.length)} of ${number(files.length)} found` }] : []),
      { label: current ? 'Total size' : 'File size', value: found.length ? size(found.reduce((total, item) => total + (item.size ?? 0), 0)) : '—' },
      { label: 'Resolution', value: listed(dimensions.map(item => `${item.width} × ${item.height}`)) || '—' },
      { label: 'Pixel format', value: listed(dimensions.map(item => item.format)) || '—' },
      { label: 'Mip levels', value: listed(dimensions.flatMap(item => (item.mipmaps ? [String(item.mipmaps)] : []))) || '—' },
      { label: current ? 'Last modified, newest' : 'Last modified', value: newest ? time(newest) : '—' },
    ];
  }, [row, sequence, rtf, directory, view, isFont, name, readable]);

  /** How the sequence plays, from its descriptor or as guessed. */
  const animation = useMemo(() => {
    const current = sequence;
    if (!current) return [];
    const count = current.frames.length;
    const fileCount = new Set(current.frames.map(frame => frame.resourcePath)).size;
    const crops = listed(current.frames.flatMap(frame => (frame.source ? [`${frame.source.w} × ${frame.source.h} at ${frame.source.x}, ${frame.source.y}`] : [])));
    return [
      { label: 'Sequence', value: current.guessed ? 'Guessed from the file names' : sequenceName(current) },
      { label: 'Frames', value: `${number(count)} frame${plural(count)}${fileCount !== count ? `, ${number(fileCount)} file${plural(fileCount)}` : ''}` },
      { label: 'Frame time', value: `${current.frameTime} ms, ${current.frameTime > 0 ? Number((1000 / current.frameTime).toFixed(1)) : '—'} frames per second` },
      { label: 'Loops', value: current.loopCount === 0 ? 'Forever' : current.loopCount === 1 ? 'Once' : `${current.loopCount} times` },
      ...(current.loopTo ? [{ label: 'Later loops start at', value: `Frame ${current.loopTo}` }] : []),
      { label: 'One loop', value: `${(count * current.frameTime / 1000).toFixed(2)} s` },
      ...(crops ? [{ label: 'Frame area', value: crops }] : []),
    ];
  }, [sequence]);
  const frameRows = useMemo(() => (sequence?.frames ?? []).map((frame, index) => ({ ...frame, index, name: splitPath(frame.resource).name })), [sequence]);

  const note = useMemo(() => {
    const many = !!sequence;
    // An RTF is loaded by its .rtf file.
    const project = directory ? `its project file, ${baseName(directory.project)}` : '';
    switch (row.category) {
      case 'available': return {
        icon: 'mdi-check-all', tone: 'is-synced', title: 'Loaded by the game.',
        text: `The descriptor entries below load ${project || (many ? 'these files' : 'this file')}, and ${many ? 'every one exists' : 'it exists'} in the game.`,
      };
      case 'missing': return {
        icon: 'mdi-file-alert-outline', tone: 'is-pending', title: 'Not in the game folder.',
        text: many ? 'A descriptor declares frames whose files do not exist, so the game cannot load them.' : `A descriptor declares ${project || 'this file'}, but it does not exist, so the game cannot load it.`,
      };
      case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: row.status.replace(/^invalid: /, '') };
      default: return {
        icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
        text: `No descriptor declares ${project || (many ? 'these files' : 'this file')}, so the game does not load ${many ? 'them' : 'it'}.${sequence?.guessed ? ' The sequence is guessed from the file names.' : ''}`,
      };
    }
  }, [row, sequence, directory]);
  const scope = ({ game: '', common: 'A common resource, shared with other games.', outside: 'Outside the game folder.' })[row.scope];

  return (
    <AppModal title={name} xl onClose={close}>
      <div className="modal-body details-dialog asset-details">
        <div className="details-previews">
          <figure className="details-preview">
            <figcaption>{[
              sequence ? 'Game frames' : rtf ? 'Pages' : view ? 'View, as the game draws it' : 'Game file',
              sequence ? <small key="again">Click to play again</small> : null,
              isFont && fontUses.length > 1 ? (
                <span key="fonts" className="btn-group btn-group-sm" role="group" aria-label="Characters of the Font entry">{fontUses.map((use, index) => (
                  <button key={`${use.descriptor}:${use.line}`} type="button" className={classes('btn', 'btn-secondary', { active: index === chosen })} aria-pressed={index === chosen} onClick={() => setChosen(index)}>{use.id ?? `${use.descriptor}:${use.line}`}</button>
                ))}</span>
              ) : null,
            ]}</figcaption>
            {sequence ? <SequencePreview frames={frames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={sequence.id ?? name} revision={revision} />
              : isAudio && readable ? <AudioPreview file={row.resourcePath} name={name} revision={revision} autoplay />
                : isFont && readable ? <FontPreview file={row.resourcePath} name={name} revision={revision} large chars={fontUse?.chars} size={fontUse?.size} missing={fontUse?.coverage?.missing} />
                  : rtf ? <RtfPreview page={rtfPage} onPageChange={setRtfPage} file={file} name={name} revision={revision} facts={rtf} large />
                    : view ? <ViewPreview file={file} name={name} revision={revision} facts={view} large editable onDirty={setUnsaved} />
                      : <ReportThumbnail file={file} name={baseName(file)} revision={revision} preview={readable && row.preview !== false} />}
          </figure>
        </div>

        <div className="details-columns">
          <section className="details-summary" aria-label="Status">
            <span className={classes('badge', 'details-status', assetBadges[row.category])}>{row.status}</span>
            <h5 className="details-name" title={row.resourcePath}>{name}</h5>
            <p className="details-folder text-muted"><i aria-hidden="true" className="mdi mdi-folder-outline" /> {splitPath(row.resource).folder}</p>
            <div className={classes('details-note', note.tone)}>{[
              <i key="icon" aria-hidden="true" className={classes('mdi', note.icon)} />,
              <p key="text">{note.title}<small>{note.text}</small></p>,
            ]}</div>
            {scope ? <p className="details-scope text-muted"><i aria-hidden="true" className="mdi mdi-share-variant-outline" /> {scope}</p> : null}
            {row.previewError ? <p className="details-scope text-muted"><i aria-hidden="true" className="mdi mdi-image-off-outline" /> {row.previewError}</p> : null}
            {row.rtfError ? <p className="details-scope text-muted"><i aria-hidden="true" className="mdi mdi-book-alert-outline" /> {row.rtfError}</p> : null}
            {row.viewError ? <p className="details-scope text-muted"><i aria-hidden="true" className="mdi mdi-alert-outline" /> {row.viewError}</p> : null}

            <h6 className="details-heading">Loaded by</h6>
            {!row.requiredBy.length ? <p className="text-muted details-small">No JSON descriptor</p> : (
              <ul className="details-list">
                {row.requiredBy.map(use => (
                  <li key={`${use.descriptor}:${use.line}`} className="details-declaration">{[
                    <span key="where" className="details-code">{use.descriptor}:{use.line}</span>,
                    <span key="type" className="badge badge-light">{use.type}</span>,
                    use.id ? <span key="id" className="details-code">{use.id}</span> : null,
                    <button key="open" type="button" className="details-icon" aria-label={`Open ${use.descriptor} at line ${use.line} in VS Code`} title={`Open in VS Code: ${use.descriptor}:${use.line}`} onClick={() => { void openDeclaration(use.descriptor, use.line); }}><i aria-hidden="true" className="mdi mdi-code-braces" /></button>,
                    use.size ? <span key="size" className="text-muted">{use.size} px</span> : null,
                    use.coverage ? (
                      <span key="coverage" className={classes('details-coverage', use.coverage.missingCount ? 'text-danger' : 'text-success')}>
                        <i aria-hidden="true" className={classes('mdi', use.coverage.missingCount ? 'mdi-alert-outline' : 'mdi-check')} />{`${number(use.coverage.covered)} of ${number(use.coverage.declared)} declared characters`}
                      </span>
                    ) : null,
                    use.coverage?.missingCount ? (
                      <span key="missing" className="details-missing">{[
                        ...use.coverage.missing.map(point => <span key={point} className="badge badge-light" title={codePoint(point)}>{codePoint(point)} {String.fromCodePoint(point)}</span>),
                        use.coverage.missingCount > use.coverage.missing.length ? <span key="more" className="text-muted">+{number(use.coverage.missingCount - use.coverage.missing.length)} more</span> : null,
                      ]}</span>
                    ) : null,
                  ]}</li>
                ))}
              </ul>
            )}

            <h6 className="details-heading">Game path</h6>
            <div className="details-path">{[
              <span key="path" className="details-code" title={row.resourcePath}>{row.resource}</span>,
              <button key="copy" type="button" className="details-icon" aria-label={`Copy the game path ${row.resourcePath}`} title="Copy the game path" onClick={() => { void copy(row.resourcePath); }}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>,
              <button key="folder" type="button" className="details-icon" aria-label={`Open the game folder of ${name}`} title="Open the game folder" onClick={() => { void openResourceFolder(file); }}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button>,
            ]}</div>
          </section>

          <section className="details-facts" aria-label="File details">
            <h6 className="details-heading mt-0">{sequence ? 'Files' : directory ? 'Folder' : 'File'}</h6>
            <table className="table details-table">
              <tbody>{table.map(item => (
                <tr key={item.label}><th scope="row">{item.label}</th><td className={item.warn ? 'is-different' : undefined}>{item.value}</td></tr>
              ))}</tbody>
            </table>

            {rtf ? (
              <>
                <h6 className="details-heading">Pages</h6>
                <div className="details-frames">
                  <table className="table table-sm">
                    <thead><tr><th scope="col">Page</th><th scope="col">Resolution</th><th scope="col">Sections</th><th scope="col">Background</th></tr></thead>
                    <tbody>{rtf.pages.map((item, index) => (
                      <tr key={item.id} className={classes('details-page', { 'is-shown': index === rtfPage })}>
                        <td><button type="button" className="details-page-button" aria-label={`Show page ${item.id}`} aria-pressed={index === rtfPage} onClick={() => setRtfPage(index)}>{item.id}</button></td>
                        <td className="text-nowrap">{item.width} × {item.height}</td>
                        <td>{number(item.sections)}</td>
                        <td className="details-code" title={item.background ?? undefined}>
                          {item.found ? <span>{baseName(item.background ?? '')}</span> : <span className="badge badge-warning">{item.background ? `${baseName(item.background)} missing` : 'not mapped'}</span>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {rtf.missingCount ? (
                  <>
                    <h6 className="details-heading">Missing files</h6>
                    <ul className="details-list details-rtf-missing">
                      {rtf.missing.map(item => (
                        <li key={`${item.kind}:${item.id}`}>{[
                          <span key="kind" className="badge badge-light">{item.kind}</span>,
                          <span key="id" className="details-code">{item.id}</span>,
                          <span key="path" className="details-code text-muted">{item.path ?? 'not mapped to a file'}</span>,
                        ]}</li>
                      ))}
                      {rtf.missingCount > rtf.missing.length ? <li className="text-muted">+{number(rtf.missingCount - rtf.missing.length)} more</li> : null}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}

            {view?.missingCount ? (
              <>
                <h6 className="details-heading">Missing resources</h6>
                <ul className="details-list details-rtf-missing">
                  {view.missing.map(item => (
                    <li key={`${item.id}:${item.keys.join()}`}>{[
                      <span key="type" className="badge badge-light">{item.type}</span>,
                      <span key="id" className="details-code">{item.id}</span>,
                      <span key="reason" className="details-code text-muted">{item.reason}</span>,
                    ]}</li>
                  ))}
                  {view.missingCount > view.missing.length ? <li className="text-muted">+{number(view.missingCount - view.missing.length)} more</li> : null}
                </ul>
              </>
            ) : null}

            {directory?.files.length ? (
              <>
                <h6 className="details-heading">Files</h6>
                <div className="details-frames">
                  <table className="table table-sm details-rtf-files">
                    <thead><tr><th scope="col">File</th><th scope="col">Resolution</th><th scope="col">Size</th></tr></thead>
                    <tbody>{directory.files.map(item => (
                      <tr key={item.path}>
                        <td className="details-code" title={item.resourcePath}><i aria-hidden="true" className={classes('mdi', typeIcons[item.type], 'text-muted')} /> {item.path}</td>
                        <td className="text-nowrap">{item.dimensions ? `${item.dimensions.width} × ${item.dimensions.height}` : '—'}</td>
                        <td className="text-nowrap">{size(item.size)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            ) : null}

            {sequence ? (
              <>
                <h6 className="details-heading">Animation</h6>
                <table className="table details-table">
                  <tbody>{[
                    ...animation.map(item => (
                      <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value}</td></tr>
                    )),
                    ...sequence.paths.map((path, index) => (
                      <tr key={`path:${index}:${path}`}><th scope="row">{index ? '' : `Path${plural(sequence.paths.length)}`}</th><td className="details-code">{path}</td></tr>
                    )),
                  ]}</tbody>
                </table>

                <h6 className="details-heading">Frames</h6>
                <div className="details-frames">
                  <table className="table table-sm">
                    <thead><tr><th scope="col">#</th><th scope="col">Game file</th><th scope="col">Status</th><th scope="col">Size</th></tr></thead>
                    <tbody>{frameRows.map(frame => (
                      <tr key={frame.index}>
                        <td className="text-muted">{frame.index}</td>
                        <td className="details-code" title={frame.resourcePath}>{frame.name}</td>
                        <td><span className={classes('badge', assetBadges[frame.category])}>{frame.category}</span></td>
                        <td className="text-nowrap">{frame.size !== undefined ? size(frame.size) : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
      <div className="modal-footer details-footer">{[
        <span key="path" className="text-muted">{row.resource}</span>,
        <button key="close" type="button" className="btn btn-light" onClick={close}>Close</button>,
      ]}</div>
    </AppModal>
  );
}
