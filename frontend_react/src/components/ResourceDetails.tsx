import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { classes } from '../classes';
import { algorithmValues, baseName, viewTable, type GdaCandidate, declarationLabel, directoryOf, extensionOf, fileType, matchBadge, matchText, number, plural, previewFrames, rssBadges, rtfChangeBadges, rtfChangeNames, rtfChangeSummary, sequenceName, size, splitPath, time } from '../format';
import type { RssFileDetails, RssResource, RtfFacts } from '../types';
import { copy, openDeclaration, openResourceFolder, requestResourceSync, resourceDetails, useWorkspace } from '../workspace';
import AppModal from './AppModal';
import AudioPreview from './AudioPreview';
import FontPreview from './FontPreview';
import ReportThumbnail from './ReportThumbnail';
import RtfPreview from './RtfPreview';
import SequencePreview from './SequencePreview';
import ViewPreview from './ViewPreview';

// The details of one resource of the GDA sync report in a dialog, like the asset library's asset details (AssetDetails):
// a large preview, beside the GDA file's when the GDA has one, what the status means, the files' format, size,
// resolution, pixel format, mip levels and time, for the game and the GDA side by side, and where the resource is
// declared. An image sequence plays in the dialog, with how it plays, the totals of its files and each frame's status.
// An audio file plays once when the dialog opens, and each audio preview has a play and stop button. A font is drawn with
// itself on both sides, with the same text, and with the characters and at the size of the Font entry chosen; the table
// compares the fonts' names, glyph counts and how many of each Font entry's characters they have. An RTF draws the
// pages of the game's RTF and of the closest GDA one side by side, on the same page when both have it; the table compares
// the two projects, and the files of the folders are listed with what Sync does to each. An image lists how the image
// matching judged the GDA image it is compared with, with every algorithm's value. An image with GDA images to choose
// from (candidate) is shown only with the one given: the image chosen on its card, or else the most likely one, which
// Sync this resource copies. Left and Right choose the previous and next of its GDA images (candidates), which emits
// choose; the dialog stays open and compares the game image with the new one. Escape closes the dialog.
// reportVersion is the GDA sync report's version; one before FONT_REPORT_VERSION has no Font entry characters to check.
const NO_CANDIDATES: GdaCandidate[] = [];

/** Display workspace-relative paths; keep absolute paths for desktop and clipboard actions. */
function relativePath(path: string, root?: string) {
  if (!root) return path;
  const parts = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '').split('/');
  const file = parts(path), base = parts(root);
  const windows = /^[A-Za-z]:/.test(root) || root.startsWith('\\\\');
  const same = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(file[0], base[0])) return path;
  let shared = 0;
  while (shared < file.length && shared < base.length && same(file[shared], base[shared])) shared++;
  return [...base.slice(shared).map(() => '..'), ...file.slice(shared)].join('/') || '.';
}
const unique = (paths: (string | null | undefined)[]) => [...new Set(paths.filter((path): path is string => !!path))];

export default function ResourceDetails({
  row, revision, reportVersion, candidate = null, candidates = NO_CANDIDATES, onClose, onChoose,
}: {
  row: RssResource; revision: string; reportVersion?: number; candidate?: GdaCandidate | null; candidates?: GdaCandidate[];
  onClose: () => void; onChoose: (file: string) => void;
}) {
  const { busy, data, rssSync } = useWorkspace();
  const sequence = row.sequence;
  const name = splitPath(row.resource).name;
  const running = !!rssSync?.running;
  const gamePath = (path: string) => relativePath(path, data?.config.destination);
  const gdaPath = (path: string) => relativePath(path, data?.config.source);
  // An RTF's folder, and the page its previews show, by name: both RTFs show it when they have it.
  const directory = row.directory;
  const [rtfPage, setRtfPage] = useState<string | null>(null);
  const [chosen, setChosen] = useState(0);
  const [rowSeen, setRowSeen] = useState(row.id);
  if (rowSeen !== row.id) {
    setRowSeen(row.id);
    setRtfPage(null);
    setChosen(0);
  }
  const pageIndex = (facts: RtfFacts) => { const index = facts.pages.findIndex(page => page.id === rtfPage); return index < 0 ? undefined : index; };
  const choosePage = (facts: RtfFacts, index: number | undefined) => { setRtfPage(index === undefined ? null : facts.pages[index]?.id ?? null); };
  // An RTF's files that Sync copies or deletes first, then the identical ones.
  const rtfFiles = [...(directory?.files ?? [])].sort((a, b) => Number(!a.change || a.change === 'identical') - Number(!b.change || b.change === 'identical'));
  const isAudio = (path: string) => fileType(extensionOf(baseName(path))) === 'audio';
  // The GDA image an image is compared with: the given candidate, or else, in a report without candidates on the card, its
  // closest same-named GDA file. Its evaluation by the image matching is listed, when it has one.
  const gdaShown = candidate ?? row.gdaFiles[0] ?? null;
  // Where the GDA image shown is among the image's GDA images, as the card lists them.
  const candidateIndex = candidates.findIndex(item => item.absolutePath === candidate?.absolutePath);
  useEffect(() => {
    /** Left and Right choose the previous and next GDA image that can be chosen, from the one shown; the first and last stay.
     * Keys typed into a text field, or with a modifier, are left alone. */
    function onKeydown(event: KeyboardEvent) {
      const direction = ({ ArrowLeft: -1, ArrowRight: 1 } as Record<string, number | undefined>)[event.key];
      const target = event.target as HTMLElement | null;
      if (!direction || candidates.length < 2 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
          || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      let index = candidateIndex + direction;
      while (index >= 0 && index < candidates.length && !candidates[index].syncable) index += direction;
      if (index >= 0 && index < candidates.length) onChoose(candidates[index].absolutePath);
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [candidates, candidateIndex, onChoose]);
  const evaluated = (() => {
    if (candidate) return [{ path: candidate.path, absolutePath: candidate.absolutePath, sameName: candidate.sameName, evaluation: candidate }];
    const file = sequence || directory ? null : row.gdaFiles[0];
    return file?.match ? [{ path: file.path, absolutePath: file.absolutePath, sameName: true, evaluation: file.match }] : [];
  })();

  // The files described: a sequence's game files and the GDA file of each of its frames, each once. An RTF is described by
  // the report.
  const gameFiles = directory ? [] : sequence
    ? unique(sequence.frames.filter(frame => frame.category !== 'invalid').map(frame => frame.resourcePath))
    : row.category === 'invalid' ? [] : [row.resourcePath];
  const gdaFileList = directory ? [] : sequence
    ? unique(sequence.frames.map(frame => frame.gdaFiles[0]?.absolutePath))
    : gdaShown ? [gdaShown.absolutePath] : [];
  const hasGda = directory ? !!directory.gdaProject : gdaFileList.length > 0;
  const gdaLabel = sequence ? 'GDA frames'
    : directory ? (row.category === 'different' ? 'GDA folder, copied on sync' : 'Matching GDA folder')
      : candidate ? (candidate.syncable ? 'GDA image, copied on sync' : 'GDA image, the same file')
        : row.category === 'different' ? 'GDA file, copied on sync' : 'Matching GDA file';
  // Computed once per row: SequencePreview loads its frames again whenever it gets other ones.
  const gameFrames = useMemo(() => (sequence ? previewFrames(sequence, 'game') : []), [sequence]);
  const gdaFrames = useMemo(() => (sequence ? previewFrames(sequence, 'gda') : []), [sequence]);
  // The GDA preview shows beside the game's for a resource that the GDA has.
  const pairedPreview = hasGda && (row.category === 'different' || row.category === 'identical' || !!candidate);
  // The Font entries that declare characters of a font, and the one whose characters the previews draw.
  const isFont = !sequence && fileType(extensionOf(name)) === 'font';
  const fontUses = row.requiredBy.filter(use => use.chars);
  const fontUse = fontUses[chosen] ?? null;
  const [fontText, setFontText] = useState('');
  // The GDA sync report version that lists the characters and size of Font entries: REPORT_VERSION in egt_gda_sync/rss_jobs.py.
  const FONT_REPORT_VERSION = 4;
  const fontsUnchecked = isFont && (reportVersion ?? FONT_REPORT_VERSION) < FONT_REPORT_VERSION;

  const [details, setDetails] = useState<Record<string, RssFileDetails>>({});
  const detailsRef = useRef(details);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestRef = useRef(0);
  const described = useRef<[RssResource, string] | null>(null);
  const gdaKey = gdaFileList.join('\n');
  const coverageOf = (file: string) => details[file]?.coverage?.[chosen];
  // The files' details, read again for another resource or report. Another GDA image of the same resource only reads its
  // own, so the game file's stay shown.
  useLayoutEffect(() => {
    const id = ++requestRef.current;
    const kept = described.current?.[0] === row && described.current[1] === revision ? detailsRef.current : {};
    described.current = [row, revision];
    const files = unique([...gameFiles, ...gdaFileList]).filter(file => !(file in kept)).slice(0, 1000);
    detailsRef.current = kept;
    setDetails(kept);
    setLoadError('');
    if (!files.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const chars = fontUses.map(use => use.chars!);
    void (async () => {
      try {
        const result = await resourceDetails(files, chars);
        if (id === requestRef.current) {
          const merged = { ...kept, ...result };
          detailsRef.current = merged;
          setDetails(merged);
        }
      } catch (e) {
        if (id === requestRef.current) setLoadError((e as Error).message);
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    })();
    // gameFiles, gdaFileList and fontUses are the ones for this row, revision and GDA file list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, revision, gdaKey]);

  /** Up to three different values, then how many more there are. */
  function listed(values: string[]) {
    const distinct = [...new Set(values)];
    return distinct.length > 3 ? `${distinct.slice(0, 3).join(', ')} +${distinct.length - 3} more` : distinct.join(', ');
  }

  /** What the table shows for a set of files: one file, or the totals of a sequence's files. */
  function describe(files: string[]) {
    const found = files.map(file => details[file]).filter((entry): entry is RssFileDetails => !!entry && !entry.error);
    const dimensions = found.flatMap(entry => (entry.dimensions ? [entry.dimensions] : []));
    const none = loading ? '…' : '—';
    const newest = found.map(entry => entry.modifiedAt ?? '').sort().pop();
    return {
      format: listed(files.map(file => extensionOf(baseName(file)).toUpperCase()).filter(Boolean)) || none,
      files: files.length ? `${number(found.length)} of ${number(files.length)} found` : none,
      size: found.length ? size(found.reduce((total, entry) => total + (entry.size ?? 0), 0)) : none,
      resolution: listed(dimensions.map(item => `${item.width} × ${item.height}`)) || none,
      pixelFormat: listed(dimensions.map(item => item.format)) || none,
      mipmaps: listed(dimensions.flatMap(item => (item.mipmaps ? [String(item.mipmaps)] : []))) || none,
      modified: newest ? time(newest) : none,
    };
  }

  /** What the table shows of a font: its format, names and glyph count, and how many of each Font entry's characters it has. */
  function describeFont(files: string[]) {
    const entry = files.map(file => details[file]).find(item => item && !item.error);
    const none = loading ? '…' : '—';
    const font = entry?.font;
    return {
      format: font?.format ?? entry?.fontError ?? none, family: font?.family ?? none, style: font?.style ?? none,
      version: font?.version ?? none, glyphs: font?.glyphs !== undefined ? number(font.glyphs) : none,
      coverage: fontUses.map((_use, index) => {
        const result = entry?.coverage?.[index];
        return result ? `${number(result.covered)} of ${number(result.declared)}` : none;
      }),
    };
  }

  const table = (() => {
    const game = describe(gameFiles);
    const gda = describe(gdaFileList);
    let rows: { label: string; game: string; gda: string; compare: boolean }[];
    if (directory) {
      const folder = directory;
      const project = (facts?: RtfFacts, error?: string) => ({
        version: facts?.version ?? error ?? '—', languages: facts?.languages.join(', ') || '—',
        pages: facts ? `${number(facts.pages.length)}${facts.pages.length ? `, ${listed(facts.pages.map(page => `${page.width} × ${page.height}`))}` : ''}` : '—',
        media: facts ? `${number(facts.images)} image${plural(facts.images)}, ${number(facts.videos)} video${plural(facts.videos)}` : '—',
        missing: facts ? (facts.missingCount ? number(facts.missingCount) : 'None') : '—',
        texts: facts ? `${number(facts.texts)} text${plural(facts.texts)}, ${number(facts.styles)} style${plural(facts.styles)}` : '—',
      });
      const gameRtf = project(row.rtf, row.rtfError);
      const gdaRtf = project(row.gdaRtf, row.gdaRtfError);
      const files = (key: 'resourcePath' | 'gdaPath') => number(folder.files.filter(file => file[key]).length);
      rows = [
        { label: 'Tool version', game: gameRtf.version, gda: gdaRtf.version, compare: true },
        { label: 'Languages', game: gameRtf.languages, gda: gdaRtf.languages, compare: true },
        { label: 'Pages', game: gameRtf.pages, gda: gdaRtf.pages, compare: true },
        { label: 'Images and videos', game: gameRtf.media, gda: gdaRtf.media, compare: true },
        { label: 'Missing files', game: gameRtf.missing, gda: gdaRtf.missing, compare: true },
        { label: 'Texts and styles', game: gameRtf.texts, gda: gdaRtf.texts, compare: true },
        { label: 'Files', game: files('resourcePath'), gda: hasGda ? files('gdaPath') : '—', compare: true },
      ];
    } else if (row.view || row.viewError) {
      // A view: what it and its closest GDA file draw, then the files.
      const gameView = row.view ? viewTable(row.view) : [];
      const gdaView = row.gdaView ? viewTable(row.gdaView) : [];
      rows = [
        ...gameView.map((item, index) => ({ label: item.label, game: item.value, gda: hasGda ? (gdaView[index]?.value ?? row.gdaViewError ?? '—') : '—', compare: index > 0 })),
        ...(gameView.length ? [] : [{ label: 'View', game: row.viewError ?? '—', gda: row.gdaViewError ?? '—', compare: false }]),
        { label: 'File size', game: game.size, gda: gda.size, compare: true },
        { label: 'Last modified', game: game.modified, gda: gda.modified, compare: false },
      ];
    } else if (isFont) {
      const gameFont = describeFont(gameFiles);
      const gdaFont = describeFont(gdaFileList);
      rows = [
        { label: 'Font format', game: gameFont.format, gda: gdaFont.format, compare: true },
        { label: 'Family', game: gameFont.family, gda: gdaFont.family, compare: true },
        { label: 'Style', game: gameFont.style, gda: gdaFont.style, compare: true },
        { label: 'Version', game: gameFont.version, gda: gdaFont.version, compare: true },
        { label: 'Glyphs', game: gameFont.glyphs, gda: gdaFont.glyphs, compare: true },
        ...fontUses.map((use, index) => ({
          label: `Characters of ${use.id ?? `${use.descriptor}:${use.line}`}`, game: gameFont.coverage[index], gda: gdaFont.coverage[index], compare: true,
        })),
        { label: 'File size', game: game.size, gda: gda.size, compare: true },
        { label: 'Last modified', game: game.modified, gda: gda.modified, compare: false },
      ];
    } else {
      const keys: { label: string; key: keyof typeof game; compare: boolean }[] = [
        { label: 'File format', key: 'format', compare: true },
        ...(sequence ? [{ label: 'Files', key: 'files' as const, compare: false }] : []),
        { label: sequence ? 'Total size' : 'File size', key: 'size', compare: true },
        { label: 'Resolution', key: 'resolution', compare: true },
        { label: 'Pixel format', key: 'pixelFormat', compare: true },
        { label: 'Mip levels', key: 'mipmaps', compare: true },
        { label: sequence ? 'Last modified, newest' : 'Last modified', key: 'modified', compare: false },
      ];
      rows = keys.map(({ label, key, compare }) => ({ label, game: game[key], gda: gda[key], compare }));
    }
    return rows.map(({ label, game: gameValue, gda: gdaValue, compare }) => ({
      label, game: gameValue, gda: gdaValue,
      // A value that differs between the game and the GDA stands out.
      differs: hasGda && compare && gameValue !== gdaValue && ![gameValue, gdaValue].some(value => value === '—' || value === '…'),
    }));
  })();

  /** How the sequence plays, from its descriptor or as guessed. */
  const animation = (() => {
    const current = sequence;
    if (!current) return [];
    const frames = current.frames.length;
    const files = new Set(current.frames.map(frame => frame.resourcePath)).size;
    const crops = listed(current.frames.flatMap(frame => (frame.source ? [`${frame.source.w} × ${frame.source.h} at ${frame.source.x}, ${frame.source.y}`] : [])));
    return [
      { label: 'Sequence', value: current.guessed ? 'Guessed from the file names' : sequenceName(current) },
      { label: 'Frames', value: `${number(frames)} frame${plural(frames)}${files !== frames ? `, ${number(files)} file${plural(files)}` : ''}` },
      { label: 'Frame time', value: `${current.frameTime} ms, ${current.frameTime > 0 ? Number((1000 / current.frameTime).toFixed(1)) : '—'} frames per second` },
      { label: 'Loops', value: current.loopCount === 0 ? 'Forever' : current.loopCount === 1 ? 'Once' : `${current.loopCount} times` },
      ...(current.loopTo ? [{ label: 'Later loops start at', value: `Frame ${current.loopTo}` }] : []),
      { label: 'One loop', value: `${(frames * current.frameTime / 1000).toFixed(2)} s` },
      ...(crops ? [{ label: 'Frame area', value: crops }] : []),
    ];
  })();
  const frames = (sequence?.frames ?? []).map((frame, index) => ({
    ...frame, index, name: splitPath(frame.resource).name, gda: frame.gdaFiles[0] ? splitPath(frame.gdaFiles[0].path).name : '',
  }));
  const showFrameStatus = !sequence?.guessed;

  const note = (() => {
    const many = !!sequence;
    const folder = directory;
    if (folder) {
      const project = baseName(folder.project);
      switch (row.category) {
        case 'identical': return { icon: 'mdi-check-all', tone: 'is-synced', title: 'Everything looks good.', text: 'The GDA folder has an identical copy of every file of this RTF.' };
        case 'different': return {
          icon: 'mdi-sync', tone: 'is-pending', title: 'The GDA has another version.',
          text: `Sync makes this RTF's folder a copy of the closest GDA folder (${rtfChangeSummary(folder)}), and keeps the replaced and deleted files in your backups. A file that a descriptor declares is never deleted.`,
        };
        case 'missing': return { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder.', text: `No GDA folder holds a file named ${project}, so there is nothing to copy.` };
        case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: row.status.replace(/^invalid: /, '') };
        default: return {
          icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
          text: `No descriptor declares its ${project}, so the game does not load it, and it is not compared with the GDA folder.`,
        };
      }
    }
    switch (row.category) {
      case 'identical': return { icon: 'mdi-check-all', tone: 'is-synced', title: 'Everything looks good.', text: `The GDA folder has an identical ${many ? 'file for every frame' : 'file'}.` };
      case 'different': return {
        icon: 'mdi-sync', tone: 'is-pending', title: 'The GDA has another version.',
        text: many ? 'Sync copies the GDA file of each different frame over the game file, and keeps the replaced files in your backups.'
          : 'Sync copies the GDA file over the game file, and keeps the replaced file in your backups.',
      };
      case 'missing': return candidate
        ? { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder by name.', text: 'No GDA file has this name, but GDA images may show the same picture. Sync copies the one shown over the game file, and keeps the replaced file in your backups.' }
        : { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder.', text: `No GDA file has ${many ? 'the name of these files' : 'this name'}, so there is nothing to copy.` };
      case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: row.status.replace(/^invalid: /, '') };
      default: return {
        icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
        text: `No descriptor declares ${many ? 'these files' : 'this file'}, so the game does not load ${many ? 'them' : 'it'}, and ${many ? 'they are' : 'it is'} not compared with the GDA folder.${sequence?.guessed ? ' The sequence is guessed from the file names.' : ''}`,
      };
    }
  })();
  const scope = ({ game: '', common: 'A common resource, shared with other games.', outside: 'Outside the game folder.' })[row.scope];
  // Each folder of a sequence's GDA files, with one of its files to open it by.
  const gdaFolders = [...new Map(gdaFileList.map(file => [directoryOf(file), file])).entries()]
    .map(([folder, file]) => ({ folder, file }));
  const syncable = candidate ? candidate.syncable
    : row.category === 'different' && row.gdaFiles.length > 0;

  function sync() {
    onClose();
    requestResourceSync([row], candidate ? { [row.id]: candidate } : {});
  }

  return (
    <AppModal title={name} xl onClose={onClose}>
      <div className="modal-body details-dialog">
        <div className={classes('details-previews', { 'is-paired': pairedPreview })}>
          <figure className="details-preview">
            <figcaption>
              {sequence ? 'Game frames' : directory ? 'Game folder' : row.view ? 'Game view, as the game draws it' : 'Game file'}{sequence ? <small>Click to play again</small> : null}
              {isFont && fontUses.length > 1 ? (
                <span className="btn-group btn-group-sm" role="group" aria-label="Characters of the Font entry">
                  {fontUses.map((use, index) => (
                    <button key={`${use.descriptor}:${use.line}`} type="button" className={classes('btn', 'btn-secondary', { active: index === chosen })} aria-pressed={index === chosen} onClick={() => setChosen(index)}>{use.id ?? `${use.descriptor}:${use.line}`}</button>
                  ))}
                </span>
              ) : null}
            </figcaption>
            {sequence ? (
              <SequencePreview frames={gameFrames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={sequence.id ?? name} revision={revision} />
            ) : directory && row.rtf ? (
              <RtfPreview page={pageIndex(row.rtf)} file={directory.project} name={name} revision={revision} facts={row.rtf} large onPageChange={(index: number | undefined) => choosePage(row.rtf!, index)} />
            ) : isAudio(row.resourcePath) && row.category !== 'invalid' ? (
              <AudioPreview file={row.resourcePath} name={name} revision={revision} autoplay />
            ) : isFont && row.category !== 'invalid' ? (
              <FontPreview text={fontText} onTextChange={setFontText} file={row.resourcePath} name={name} revision={revision} large
                           chars={fontUse?.chars} size={fontUse?.size} missing={coverageOf(row.resourcePath)?.missing} />
            ) : row.view ? (
              <ViewPreview file={row.resourcePath} name={name} revision={revision} facts={row.view} large />
            ) : (
              <ReportThumbnail file={directory?.project ?? row.resourcePath} name={directory ? baseName(directory.project) : name} revision={revision} preview={row.category !== 'invalid'} />
            )}
          </figure>
          {pairedPreview ? (
            <figure className="details-preview">
              <figcaption>
                {gdaLabel}{candidate && candidates.length > 1 && candidateIndex >= 0 ? <small className="details-candidate-position">{candidateIndex + 1} of {candidates.length} · Left and Right change it</small> : null}
              </figcaption>
              {sequence ? (
                <SequencePreview frames={gdaFrames} frameTime={sequence.frameTime} loopCount={sequence.loopCount} loopTo={sequence.loopTo} name={`${sequence.id ?? name} from the GDA`} revision={revision} />
              ) : directory?.gdaProject && row.gdaRtf ? (
                <RtfPreview page={pageIndex(row.gdaRtf)} file={directory.gdaProject} name={`${baseName(row.gdaFiles[0].path)} from the GDA`} revision={revision} facts={row.gdaRtf} large onPageChange={(index: number | undefined) => choosePage(row.gdaRtf!, index)} />
              ) : directory?.gdaProject ? (
                <ReportThumbnail file={directory.gdaProject} name={baseName(directory.gdaProject)} revision={revision} />
              ) : row.gdaView && gdaShown ? (
                <ViewPreview file={gdaShown.absolutePath} name={`${baseName(gdaShown.path)} from the GDA`} revision={revision} facts={row.gdaView} large />
              ) : gdaShown && isAudio(gdaShown.path) ? (
                <AudioPreview file={gdaShown.absolutePath} name={baseName(gdaShown.path)} revision={revision} />
              ) : isFont && gdaShown ? (
                <FontPreview text={fontText} onTextChange={setFontText} file={gdaShown.absolutePath} name={baseName(gdaShown.path)} revision={revision} large
                             chars={fontUse?.chars} size={fontUse?.size} missing={coverageOf(gdaShown.absolutePath)?.missing} />
              ) : gdaShown ? (
                <ReportThumbnail file={gdaShown.absolutePath} name={baseName(gdaShown.path)} revision={revision} />
              ) : null}
            </figure>
          ) : null}
        </div>

        <div className="details-columns">
          <section className="details-summary" aria-label="Status">
            <span className={classes('badge', 'details-status', rssBadges[row.category])}>{row.category === 'missing' ? 'missing: no GDA file' : row.status}</span>
            <h5 className="details-name" title={row.resourcePath}>{name}</h5>
            <p className="details-folder text-muted"><i aria-hidden="true" className="mdi mdi-folder-outline" /> {splitPath(row.resource).folder}</p>
            <div className={classes('details-note', note.tone)}>
              <i aria-hidden="true" className={classes('mdi', note.icon)} />
              <p>{note.title}<small>{note.text}</small></p>
            </div>
            {scope ? <p className="details-scope text-muted"><i aria-hidden="true" className="mdi mdi-share-variant-outline" /> {scope}</p> : null}

            {fontsUnchecked ? (
              <p className="details-scope text-muted">
                <i aria-hidden="true" className="mdi mdi-information-outline" /> This report was written by an earlier version, without the characters that Font entries declare. Rescan to check both fonts against them.
              </p>
            ) : null}
            <h6 className="details-heading">Declared in</h6>
            {!row.requiredBy.length ? <p className="text-muted details-small">No JSON descriptor</p> : (
              <ul className="details-list">
                {row.requiredBy.map(use => (
                  <li key={`${use.descriptor}:${use.line}`} className="details-path">
                    <span className="details-code">{declarationLabel(use)}</span>
                    <button type="button" className="details-icon" aria-label={`Open ${use.descriptor} at line ${use.line} in VS Code`} title={`Open in VS Code: ${use.descriptor}:${use.line}`} onClick={() => void openDeclaration(use.descriptor, use.line)}><i aria-hidden="true" className="mdi mdi-code-braces" /></button>
                  </li>
                ))}
              </ul>
            )}

            <h6 className="details-heading">Game path</h6>
            <div className="details-path">
              <span className="details-code" title={row.resourcePath}>{gamePath(row.resourcePath)}</span>
              <button type="button" className="details-icon" aria-label={`Copy the game path ${row.resourcePath}`} title="Copy the game path" onClick={() => void copy(row.resourcePath)}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
              <button type="button" className="details-icon" aria-label={`Open the game folder of ${name}`} title="Open the game folder" onClick={() => void openResourceFolder(directory?.project ?? row.resourcePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button>
            </div>
            {sequence && gdaFolders.length ? (
              <>
                <h6 className="details-heading">GDA folder{plural(gdaFolders.length)}</h6>
                {gdaFolders.map(item => (
                  <div key={item.folder} className="details-path">
                    <span className="details-code" title={item.folder}>{gdaPath(item.folder)}</span>
                    <button type="button" className="details-icon" aria-label={`Copy the GDA folder ${item.folder}`} title="Copy the GDA folder" onClick={() => void copy(item.folder)}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
                    <button type="button" className="details-icon" aria-label={`Open the GDA folder ${item.folder}`} title="Open the GDA folder" onClick={() => void openResourceFolder(item.file)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button>
                  </div>
                ))}
              </>
            ) : candidate ? (
              <>
                <h6 className="details-heading">GDA image</h6>
                <div className="details-path">
                  <span className="details-code" title={candidate.absolutePath}>{gdaPath(candidate.absolutePath)}</span>
                  <button type="button" className="details-icon" aria-label={`Copy the GDA path ${candidate.path}`} title="Copy the GDA path" onClick={() => void copy(candidate.absolutePath)}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
                  <button type="button" className="details-icon" aria-label={`Open the GDA folder of ${candidate.path}`} title="Open the GDA folder" onClick={() => void openResourceFolder(candidate.absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button>
                </div>
                <span className={classes('badge', candidate.syncable ? 'badge-primary' : 'badge-light')}>{candidate.syncable ? 'Copied on sync' : 'Same file as the game'}</span>
              </>
            ) : row.gdaFiles.length ? (
              <>
                <h6 className="details-heading">GDA {directory ? 'folder' : 'file'}{plural(row.gdaFiles.length)}{row.gdaFiles.length > 1 ? (directory ? ', closest first' : ', closest folder first') : ''}</h6>
                {row.gdaFiles.map((file, index) => (
                  <div key={file.absolutePath} className="details-path-entry">
                    <div className="details-path">
                      <span className="details-code" title={file.absolutePath}>{gdaPath(file.absolutePath)}</span>
                      <button type="button" className="details-icon" aria-label={`Copy the GDA path ${file.path}`} title="Copy the GDA path" onClick={() => void copy(file.absolutePath)}><i aria-hidden="true" className="mdi mdi-content-copy" /></button>
                      <button type="button" className="details-icon" aria-label={`Open the GDA folder of ${file.path}`} title="Open the GDA folder" onClick={() => void openResourceFolder(directory ? `${file.absolutePath}/${baseName(directory.project)}` : file.absolutePath)}><i aria-hidden="true" className="mdi mdi-folder-open-outline" /></button>
                    </div>
                    {row.category === 'different' ? <span className={classes('badge', index ? 'badge-light' : 'badge-primary')}>{index ? 'Other match' : 'Copied on sync'}</span> : null}
                  </div>
                ))}
              </>
            ) : null}
          </section>

          <section className="details-facts" aria-label="File details">
            <h6 className="details-heading mt-0">{sequence ? 'Files' : directory ? 'RTF' : 'File'}</h6>
            {loadError ? <p className="text-danger details-small">{loadError}</p> : null}
            <table className="table details-table">
              {hasGda ? <thead><tr><th scope="col" /><th scope="col">Game</th><th scope="col">{gdaLabel}</th></tr></thead> : null}
              <tbody>
                {table.map(item => (
                  <tr key={item.label}>
                    <th scope="row">{item.label}</th>
                    <td className={classes({ 'is-different': item.differs })}>{item.game}</td>
                    {hasGda ? <td className={classes({ 'is-different': item.differs })}>{item.gda}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>

            {evaluated.length || row.imageMatch?.error ? (
              <>
                <h6 className="details-heading">Image matching</h6>
                {row.imageMatch?.error ? <p className="text-muted details-small">This image could not be decoded: {row.imageMatch.error}</p> : null}
                {evaluated.map(item => (
                  <div key={item.absolutePath} className="details-match">
                    <p className="details-match-title">
                      <span className="details-code" title={item.absolutePath}>{item.path}</span>
                      <span className={classes('badge', matchBadge(item.evaluation))}>{matchText(item.evaluation)}</span>
                      <small className="text-muted">{item.sameName ? 'same name' : 'other name'}</small>
                    </p>
                    <table className="table table-sm details-table">
                      <tbody>
                        {algorithmValues(item.evaluation.algorithms).map(value => (
                          <tr key={value.name}>
                            <th scope="row">{value.name}</th><td>{value.value}</td>
                            <td className="text-muted">{value.probability === undefined ? '' : `${value.probability.toFixed(1)} %`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {item.evaluation.stoppedBy === 'ssim' ? <p className="text-muted details-small">SIFT did not run: SSIM already shows a near duplicate.</p> : null}
                  </div>
                ))}
              </>
            ) : null}

            {directory ? (
              <>
                <h6 className="details-heading">Files{row.category === 'different' ? <small className="text-muted"> · copied on sync: {rtfChangeSummary(directory)}</small> : null}</h6>
                <div className="details-frames">
                  <table className="table table-sm details-rtf-files">
                    <thead><tr><th scope="col">File</th>{hasGda ? <th scope="col">On sync</th> : null}</tr></thead>
                    <tbody>
                      {rtfFiles.map(file => (
                        <tr key={file.path}>
                          <td className="details-code" title={file.resourcePath ?? file.gdaPath ?? undefined}>{file.path}</td>
                          {hasGda ? (
                            <td>
                              {file.change ? <span className={classes('badge', rtfChangeBadges[file.change])}>{rtfChangeNames[file.change]}</span> : null}
                              {file.mipOnly ? <small className="text-muted ml-1">mip levels differ</small> : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {sequence ? (
              <>
                <h6 className="details-heading">Animation</h6>
                <table className="table details-table">
                  <tbody>
                    {animation.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value}</td></tr>)}
                    {sequence.paths.map((path, index) => <tr key={path}><th scope="row">{index ? '' : `Path${plural(sequence.paths.length)}`}</th><td className="details-code">{path}</td></tr>)}
                  </tbody>
                </table>

                <h6 className="details-heading">Frames</h6>
                <div className="details-frames">
                  <table className="table table-sm">
                    <thead><tr><th scope="col">#</th><th scope="col">Game file</th>{showFrameStatus ? <th scope="col">Status</th> : null}{hasGda ? <th scope="col">GDA file</th> : null}</tr></thead>
                    <tbody>
                      {frames.map(frame => (
                        <tr key={frame.index}>
                          <td className="text-muted">{frame.index}</td>
                          <td className="details-code" title={frame.resourcePath}>{frame.name}</td>
                          {showFrameStatus ? <td><span className={classes('badge', frame.category === 'skipped' ? 'badge-light' : rssBadges[frame.category])}>{frame.status}</span></td> : null}
                          {hasGda ? <td className="details-code" title={frame.gdaFiles[0]?.absolutePath}>{frame.gda || '—'}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
      <div className="modal-footer details-footer">
        <span className="text-muted">{row.resource}</span>
        <button type="button" className="btn btn-light" onClick={onClose}>Close</button>
        {syncable ? (
          <button type="button" className="btn btn-primary" disabled={!!busy || running} onClick={sync}>
            <i aria-hidden="true" className="mdi mdi-sync" />Sync this resource
          </button>
        ) : null}
      </div>
    </AppModal>
  );
}
