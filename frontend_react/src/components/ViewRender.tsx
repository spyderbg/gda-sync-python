import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { reportPreviewURL, viewRenderURL, viewTextURL } from '../format';
import type { ViewElement, ViewLayout } from '../types';
import { classes } from '../classes';

// One view of a large view preview's screen, as the game draws it. A view without an Anim that plays, or a moved element,
// is the backend's render of all its elements. Otherwise the page draws those elements itself, between the backend's
// renders of the other elements drawn before and after each (segments, cut at them), so that each stays over and under
// the elements it is between. Each Anim whose image sequence has more than one frame plays as the game plays it
// (ImageSeqElement): a frame every frameTime milliseconds, loopCount times (0 repeats forever, each loop after the first
// starting at frame loopTo), each frame placed by its own size; a moved element is drawn where it was moved to. Both are
// tinted and faded by their color. The segments shown change once all the new ones have loaded, so that no element
// disappears while they load, and an Anim shows its first frame until all its frames have loaded.

type Drawn = {
  index: number; id: string; anim: boolean; frame: number | undefined; url: string;
  source: { x: number; y: number; w: number; h: number } | null; width: number; height: number;
  image: { width: number; height: number } | null; matrix: string; opacity: number; tint: string | null;
};

// The segments, cut at the elements drawn live: those shown, and the next ones while they load.
interface Segments { key: string; indices: number[]; urls: string[] }

export default function ViewRender({
  file, name, revision, resolution, hidden, layout, playing, restart, moves, text, style, onError,
}: {
  /** The view's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  resolution: { width: number; height: number };
  hidden: boolean;
  /** The view's elements, once loaded; until then the view is drawn whole, its Anims with their first frames. */
  layout: ViewLayout | null;
  /** Whether the Anims play; false keeps the frames shown. */
  playing: boolean;
  /** Changed to play every Anim again from its first frame. */
  restart: number;
  /** How far each moved element is moved, by its index. */
  moves?: Record<number, [number, number]>;
  /** The sample text that Text elements draw; the backend's default one when it is not given. */
  text?: string;
  /** Placement on the shared screen, from the preview. */
  style?: CSSProperties;
  onError?: () => void;
}) {
  /** The Anims that play, in drawing order: those the backend cuts its segments at (animated in egt_gda_sync/views.py). */
  const anims = useMemo(() => (layout?.elements ?? []).filter(element => element.type === 'Anim' && element.drawn
    && (element.frames ?? 0) > 1 && !!element.sequence?.length && !!element.placement && (hidden || !element.hidden)), [layout, hidden]);
  const byIndex = useMemo(() => new Map((layout?.elements ?? []).map(element => [element.index, element])), [layout]);
  const animAt = useMemo(() => new Map(anims.map((anim, position) => [anim.index, position])), [anims]);

  /** The elements the page draws itself, in drawing order: the Anims that play and the moved elements that draw an image
   * or a text. */
  const live = useMemo(() => (layout?.elements ?? []).filter(element => (element.drawn || !!element.text) && element.type !== 'Dummy' && !!element.placement
    && (hidden || !element.hidden) && (animAt.has(element.index) || !!moves?.[element.index])), [layout, hidden, animAt, moves]);

  const wanted = useMemo<Segments>(() => {
    const indices = live.map(element => element.index);
    const key = `${viewRenderURL(file, revision, resolution.width, hidden, false, text)}&cuts=${indices.join(',')}`;
    return { key, indices, urls: indices.length ? Array.from({ length: indices.length + 1 }, (_value, segment) => `${key}&segment=${segment}`) : [] };
  }, [live, file, revision, resolution.width, hidden, text]);
  const [shown, setShown] = useState<Segments | null>(null);
  const segmentLoad = useRef(0);
  const onErrorRef = useRef(onError);
  // Tint filters need ids of their own on the page.
  const [uid] = useState(() => `view-render-${Math.random().toString(36).slice(2, 10)}`);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  // Follow the segment key: another moves object with the same cuts does not load the segments again.
  const segmentKey = wanted.key;
  useEffect(() => {
    const current = ++segmentLoad.current;
    const next = wanted;
    if (!next.indices.length) { setShown(null); return; }
    void Promise.all(next.urls.map(url => new Promise<boolean>(resolve => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    }))).then(results => {
      if (current !== segmentLoad.current) return;
      if (results.every(Boolean)) setShown(next);
      else onErrorRef.current?.();
    });
    return () => { segmentLoad.current++; };
    // `wanted` is read from the render whose key changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentKey]);

  // The images of the moved elements that are not Anims, for the size of an image that a source rectangle is cut from.
  const stillsLoaded = useRef(new Map<string, HTMLImageElement>());
  const [stills, setStills] = useState<Map<string, HTMLImageElement>>(() => new Map());
  useEffect(() => {
    for (const element of live) {
      if (!element.file || !element.source || stillsLoaded.current.has(element.file) || animAt.has(element.index)) continue;
      const frameFile = element.file;
      const image = new Image();
      image.onload = () => {
        stillsLoaded.current.set(frameFile, image);
        setStills(new Map(stillsLoaded.current));
      };
      image.src = reportPreviewURL(frameFile, revision);
    }
    // The Vue watch follows `live`. This render's revision is the one a new load uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, animAt]);

  // The loaded images of the frames, by file, and the frame each Anim shows.
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(() => new Map());
  const [shownFrames, setShownFrames] = useState<number[]>([]);
  const playingRef = useRef(playing);
  const api = useRef<{ restart: () => void; syncPlaying: () => void } | null>(null);

  useEffect(() => {
    // Each Anim's loops played, whether its last loop ended, and the time since its frame was shown.
    const book = {
      images: new Map<string, HTMLImageElement>(),
      ready: [] as boolean[],
      shownFrames: [] as number[],
      loops: [] as number[],
      finished: [] as boolean[],
      elapsed: [] as number[],
      last: 0,
      handle: 0,
      generation: 0,
    };
    const frameURL = (frameFile: string) => reportPreviewURL(frameFile, revision);
    const publishFrames = () => setShownFrames([...book.shownFrames]);
    const publishImages = () => setImages(new Map(book.images));

    /** The next frame of an Anim, or false when its last loop ended, which keeps its last frame. */
    function advance(position: number) {
      const anim = anims[position];
      const count = anim.sequence!.length;
      if (book.shownFrames[position] < count - 1) {
        book.shownFrames[position]++;
        return true;
      }
      book.loops[position]++;
      if ((anim.loopCount ?? 1) > 0 && book.loops[position] >= (anim.loopCount ?? 1)) return false;
      const loopTo = anim.loopTo ?? 0;
      book.shownFrames[position] = loopTo > 0 && loopTo < count ? loopTo : 0;
      return true;
    }

    // Each Anim keeps its own time: its frames advance by its frameTime.
    function tick(now: number) {
      const step = now - book.last;
      book.last = now;
      // After a pause, such as in a hidden tab, go on from the frames shown instead of catching up.
      const delta = step > 1000 ? 0 : step;
      let changed = false;
      anims.forEach((anim, position) => {
        if (!book.ready[position] || book.finished[position]) return;
        const frameTime = Math.max(anim.frameTime ?? 0, 1);
        book.elapsed[position] += delta;
        while (book.elapsed[position] >= frameTime) {
          book.elapsed[position] -= frameTime;
          if (!advance(position)) { book.finished[position] = true; break; }
          changed = true;
        }
      });
      if (changed) publishFrames();
      run();
    }
    function run() {
      cancelAnimationFrame(book.handle);
      if (playingRef.current && anims.some((_anim, position) => book.ready[position] && !book.finished[position])) book.handle = requestAnimationFrame(tick);
    }
    function load() {
      const current = ++book.generation;
      book.images = new Map();
      book.ready = anims.map(() => false);
      book.shownFrames = anims.map(() => 0);
      book.loops = anims.map(() => 0);
      book.finished = anims.map(() => false);
      book.elapsed = anims.map(() => 0);
      publishImages();
      publishFrames();
      anims.forEach((anim, position) => {
        const files = [...new Set(anim.sequence!.map(frame => frame.file))];
        void Promise.all(files.map(frameFile => new Promise<void>(resolve => {
          const image = new Image();
          image.onload = () => {
            if (current === book.generation) {
              book.images.set(frameFile, image);
              publishImages();
            }
            resolve();
          };
          image.onerror = () => resolve();
          image.src = frameURL(frameFile);
        }))).then(() => {
          if (current !== book.generation) return;
          book.ready[position] = true;
          // The Anims start together, each once its frames are there.
          book.last = performance.now();
          run();
        });
      });
    }
    api.current = {
      restart() {
        book.shownFrames = anims.map(() => 0);
        book.loops = anims.map(() => 0);
        book.finished = anims.map(() => false);
        book.elapsed = anims.map(() => 0);
        book.last = performance.now();
        publishFrames();
        run();
      },
      syncPlaying() {
        book.last = performance.now();
        run();
      },
    };
    load();
    return () => {
      book.generation++;
      cancelAnimationFrame(book.handle);
      api.current = null;
    };
  }, [anims, revision]);

  const restartSeen = useRef(restart);
  useEffect(() => {
    if (restartSeen.current === restart) return;
    restartSeen.current = restart;
    api.current?.restart();
  }, [restart]);
  const playingSeen = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
    if (playingSeen.current === playing) return;
    playingSeen.current = playing;
    api.current?.syncPlaying();
  }, [playing]);

  /** An element drawn live: its image, or an Anim's frame, the part of it, its size, and its matrix for that size where it
   * was moved to, with its fade and tint. */
  function drawn(element: ViewElement): Drawn {
    if (element.text) return drawnText(element, element.text);
    const position = animAt.get(element.index);
    const frame = position !== undefined ? element.sequence![shownFrames[position]] ?? element.sequence![0]
      : { file: element.file!, source: element.source as [number, number, number, number] | undefined };
    const image = position !== undefined ? images.get(frame.file) : stills.get(frame.file);
    const [x, y, w, h] = frame.source ?? [0, 0, position !== undefined ? image?.naturalWidth ?? element.size[0] : element.size[0],
      position !== undefined ? image?.naturalHeight ?? element.size[1] : element.size[1]];
    // A frame of another size than the first is moved by its alignment's share of the difference (BaseElement::GetTransform),
    // and a moved element by how far it was moved.
    const [a, b, c, d, e, f] = element.placement!.matrix;
    const [shareX, shareY] = element.placement!.alignment;
    const dx = shareX * (w - element.size[0]);
    const dy = shareY * (h - element.size[1]);
    const [moveX, moveY] = moves?.[element.index] ?? [0, 0];
    const [red, green, blue, alpha] = element.color ?? [255, 255, 255, element.alpha ?? 255];
    return {
      index: element.index, id: element.id, anim: position !== undefined, frame: position !== undefined ? shownFrames[position] : undefined,
      url: reportPreviewURL(frame.file, revision), source: frame.source ? { x, y, w, h } : null, width: w, height: h,
      image: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
      matrix: `matrix(${a} ${b} ${c} ${d} ${e - a * dx - c * dy + moveX} ${f - b * dx - d * dy + moveY})`,
      opacity: alpha / 255,
      tint: red < 255 || green < 255 || blue < 255 ? `${red / 255} 0 0 0 0 0 ${green / 255} 0 0 0 0 0 ${blue / 255} 0 0 0 0 0 1 0` : null,
    };
  }
  /** A moved Text element's sample text: its image, at its size, with its matrix and the fit box's shrink. */
  function drawnText(element: ViewElement, sample: NonNullable<ViewElement['text']>): Drawn {
    const [a, b, c, d, e, f] = sample.matrix;
    const [moveX, moveY] = moves?.[element.index] ?? [0, 0];
    const [red, green, blue, alpha] = element.color ?? [255, 255, 255, element.alpha ?? 255];
    return {
      index: element.index, id: element.id, anim: false, frame: undefined, url: viewTextURL(file, revision, element.index, sample.sample),
      source: null, width: sample.width, height: sample.height, image: null, matrix: `matrix(${a} ${b} ${c} ${d} ${e + moveX} ${f + moveY})`,
      opacity: alpha / 255,
      tint: red < 255 || green < 255 || blue < 255 ? `${red / 255} 0 0 0 0 0 ${green / 255} 0 0 0 0 0 ${blue / 255} 0 0 0 0 0 1 0` : null,
    };
  }
  // The elements drawn live between the segments shown, in drawing order, where they are now.
  const items = (shown?.indices ?? []).map(index => byIndex.get(index)).map(element => (element ? drawn(element) : null));
  const animCount = items.filter(item => item?.anim).length;

  if (shown) {
    return (
      <svg className="view-stage-image view-render" viewBox={`0 0 ${resolution.width} ${resolution.height}`} preserveAspectRatio="none"
           role="img" aria-label={`${name} as the game draws it${animCount ? `, with ${animCount} animation${animCount === 1 ? '' : 's'}` : ''}`} data-view={name} data-anims={animCount} style={style}>
        <defs>
          {items.map(item => item?.tint ? (
            <filter key={item.index} id={`${uid}-${item.index}`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={item.tint} /></filter>
          ) : null)}
        </defs>
        {[null, ...items].map((item, position) => (
          <Fragment key={position}>
            {item ? (
              <g className={classes('view-live', { 'view-anim': item.anim })} data-element={item.id} data-frame={item.frame} transform={item.matrix} opacity={item.opacity}
                 filter={item.tint ? `url(#${uid}-${item.index})` : undefined}>
                {item.source && item.image ? (
                  <svg width={item.width} height={item.height} viewBox={`${item.source.x} ${item.source.y} ${item.source.w} ${item.source.h}`} preserveAspectRatio="none">
                    <image href={item.url} width={item.image.width} height={item.image.height} />
                  </svg>
                ) : !item.source ? (
                  <image href={item.url} width={item.width} height={item.height} preserveAspectRatio="none" />
                ) : null}
              </g>
            ) : null}
            <image href={shown.urls[position]} x="0" y="0" width={resolution.width} height={resolution.height} preserveAspectRatio="none" onError={() => onError?.()} />
          </Fragment>
        ))}
      </svg>
    );
  }
  return <img className="view-stage-image" src={viewRenderURL(file, revision, resolution.width, hidden, false, text)} alt={`${name} as the game draws it`} data-view={name} style={style} onError={() => onError?.()} />;
}
