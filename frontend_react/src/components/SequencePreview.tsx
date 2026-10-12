import { useEffect, useMemo, useRef, useState } from 'react';
import { classes } from '../classes';
import { number, plural, reportPreviewURL } from '../format';
import type { PreviewFrame } from '../types';

type PreviewState = 'waiting' | 'loading' | 'playing' | 'finished' | 'failed';

// An image sequence of the GDA sync report, played as the game plays it: a frame every frameTime milliseconds, loopCount
// times (0 repeats forever), each loop after the first starting at frame loopTo. A frame with a source rectangle shows
// only that part of its image. The frames load when the preview first comes into view, and it plays only while in view.
// Clicking it plays it again from the first frame, also after it finished.
export default function SequencePreview({
  frames, frameTime, loopCount, loopTo = null, name, revision,
}: {
  frames: PreviewFrame[];
  frameTime: number;
  loopCount: number;
  loopTo?: number | null;
  name: string;
  revision: string;
}) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PreviewState>('waiting');
  const [loaded, setLoaded] = useState(0);
  const files = useMemo(() => [...new Set(frames.flatMap(frame => (frame.file ? [frame.file] : [])))], [frames]);
  const shown = state === 'playing' || state === 'finished';

  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  // A newer load or unmounting ignores the images an earlier load is still waiting for.
  const generationRef = useRef(0);
  const indexRef = useRef(0);
  const loopsRef = useRef(0);
  const lastRef = useRef(0);
  const handleRef = useRef(0);
  const visibleRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  // A new report stops the timer and ignores images still loading before the next paint, as the Vue watch did.
  const sourceRef = useRef({ frames, revision });
  if (sourceRef.current.frames !== frames || sourceRef.current.revision !== revision) {
    sourceRef.current = { frames, revision };
    cancelAnimationFrame(handleRef.current);
    generationRef.current += 1;
    stateRef.current = 'waiting';
    if (state !== 'waiting') setState('waiting');
  }
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const filesRef = useRef(files);
  filesRef.current = files;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const frameTimeRef = useRef(frameTime);
  frameTimeRef.current = frameTime;
  const loopCountRef = useRef(loopCount);
  loopCountRef.current = loopCount;
  const loopToRef = useRef(loopTo);
  loopToRef.current = loopTo;

  function setPreviewState(next: PreviewState) {
    stateRef.current = next;
    setState(next);
  }

  const imageOf = (frame: PreviewFrame | undefined) => (frame?.file ? imagesRef.current.get(frame.file) : undefined);

  function load() {
    const current = ++generationRef.current;
    imagesRef.current = new Map();
    setLoaded(0);
    setPreviewState('loading');
    const shownRevision = revisionRef.current;
    void Promise.all(filesRef.current.map(file => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => {
        if (current === generationRef.current) {
          imagesRef.current.set(file, image);
          setLoaded(count => count + 1);
        }
        resolve();
      };
      image.onerror = () => {
        if (current === generationRef.current) setLoaded(count => count + 1);
        resolve();
      };
      image.src = reportPreviewURL(file, shownRevision);
    }))).then(() => {
      if (current !== generationRef.current) return;
      if (!imagesRef.current.size) {
        setPreviewState('failed');
        return;
      }
      resize();
      play();
    });
  }

  /** The canvas holds the largest frame; a frame that has no image stays empty. */
  function resize() {
    let width = 1;
    let height = 1;
    for (const frame of framesRef.current) {
      const image = imageOf(frame);
      if (!image) continue;
      width = Math.max(width, frame.source?.w ?? image.naturalWidth);
      height = Math.max(height, frame.source?.h ?? image.naturalHeight);
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
  }

  function draw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context || !canvas) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const frame = framesRef.current[indexRef.current];
    const image = imageOf(frame);
    if (!image || !frame) return;
    const { x, y, w, h } = frame.source ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    context.drawImage(image, x, y, w, h, 0, 0, w, h);
  }

  /** Show the next frame; false when the last loop ended, which keeps its last frame. */
  function advance() {
    const currentFrames = framesRef.current;
    if (indexRef.current < currentFrames.length - 1) {
      indexRef.current += 1;
      return true;
    }
    loopsRef.current += 1;
    if (loopCountRef.current > 0 && loopsRef.current >= loopCountRef.current) return false;
    const start = loopToRef.current;
    indexRef.current = start && start > 0 && start < currentFrames.length ? start : 0;
    return true;
  }

  function tick(now: number) {
    const step = Math.max(frameTimeRef.current, 1);
    // After a pause, such as in a hidden tab, go on from the frame shown instead of catching up.
    if (now - lastRef.current > Math.max(1000, step * 2)) lastRef.current = now - step;
    let changed = false;
    while (now - lastRef.current >= step) {
      lastRef.current += step;
      if (!advance()) {
        setPreviewState('finished');
        break;
      }
      changed = true;
    }
    if (changed) draw();
    if (stateRef.current === 'playing') handleRef.current = requestAnimationFrame(tick);
  }

  /** Run the timer while the sequence plays and is in view, from the frame shown. */
  function run() {
    cancelAnimationFrame(handleRef.current);
    if (stateRef.current !== 'playing' || !visibleRef.current) return;
    lastRef.current = performance.now();
    handleRef.current = requestAnimationFrame(tick);
  }

  function play() {
    indexRef.current = 0;
    loopsRef.current = 0;
    setPreviewState('playing');
    draw();
    run();
  }

  function replay() {
    if (shown) play();
  }

  const actions = useRef({ load, run });
  actions.current = { load, run };

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visibleRef.current = entry.isIntersecting;
      if (visibleRef.current && stateRef.current === 'waiting') actions.current.load();
      else actions.current.run();
    }, { rootMargin: '200px' });
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(handleRef.current);
      generationRef.current += 1;
    };
  }, []);

  // A new report loads the frames again. The first run is the mount, which the observer handles.
  const sourceMounted = useRef(false);
  useEffect(() => {
    if (!sourceMounted.current) {
      sourceMounted.current = true;
      return;
    }
    if (visibleRef.current) actions.current.load();
  }, [frames, revision]);

  return (
    <button ref={rootRef} type="button" className={classes('thumbnail', 'dds', 'sequence-preview', `is-${state}`)}
      aria-label={`Play ${name} from the first frame`} title={state === 'finished' ? 'Play again from the first frame' : 'Play from the first frame'} onClick={replay}>{[
      <canvas key="canvas" ref={canvasRef} style={{ display: shown ? undefined : 'none' }} />,
      !shown ? (
        <div key="placeholder" className="generic-preview texture">{[
          <i key="icon" aria-hidden="true" className={classes('mdi', state === 'failed' ? 'mdi-image-off-outline' : 'mdi-animation-play-outline')} />,
          state === 'loading' ? <small key="status" className="sequence-loading">Loading frames {number(loaded)} of {number(files.length)}</small>
            : state === 'failed' ? <small key="status" className="sequence-loading">No frame preview available</small>
              : null,
        ]}</div>
      ) : null,
      <span key="badge" className="badge file-format">{number(frames.length)} frame{plural(frames.length)}</span>,
      state === 'finished' ? <i key="replay" aria-hidden="true" className="mdi mdi-replay sequence-replay" /> : null,
    ]}</button>
  );
}
