import { useEffect, useRef, useState } from 'react';
import { classes } from '../classes';
import { extensionOf, reportPreviewURL } from '../format';

// The audio preview that plays: starting another one stops it, so only one plays at a time.
let current: HTMLAudioElement | undefined;

// A waveform, which fills in as the file plays.
const BARS = Array.from({ length: 48 }, (_, i) => `${12 + Math.abs(Math.sin(i * 1.7)) * 52}px`);

function rewind(element: HTMLAudioElement) {
  element.pause();
  element.currentTime = 0;
}

/** Seconds as "1.4 s", or "2:05" from a minute on. */
const clock = (seconds: number) => (seconds < 60 ? `${seconds.toFixed(1)} s`
  : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`);

// An audio file the GDA sync report names, a game resource or a GDA file, in the look of ReportThumbnail, with a play
// and stop button. It plays once and never loops, and stop goes back to the start. With autoplay it starts playing when
// it opens, unless the browser only allows that after a click. Closing it stops it.
export default function AudioPreview({
  file, name, revision, autoplay = false,
}: {
  file: string;
  name: string;
  revision: string;
  autoplay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef(0);
  const failedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const extension = extensionOf(name);
  const progress = duration > 0 ? position / duration : 0;

  // A new file or report can be played again.
  const mediaKey = `${file}\0${revision}`;
  const [mediaSeen, setMediaSeen] = useState(mediaKey);
  if (mediaKey !== mediaSeen) {
    failedRef.current = false;
    setMediaSeen(mediaKey);
    setFailed(false);
  }

  function play() {
    const element = audioRef.current;
    if (!element || failedRef.current) return;
    if (current && current !== element) rewind(current);
    current = element;
    // Refused without a click, it stays stopped for the play button.
    element.play().catch(() => undefined);
  }
  const playRef = useRef(play);
  playRef.current = play;

  function toggle() {
    if (!playing) play();
    else if (audioRef.current) rewind(audioRef.current);
  }

  // The position follows every frame while it plays: a short sound effect would otherwise move only once or twice.
  function track() {
    setPosition(audioRef.current?.currentTime ?? 0);
    frameRef.current = requestAnimationFrame(track);
  }
  function onPlay() {
    setPlaying(true);
    cancelAnimationFrame(frameRef.current);
    track();
  }
  function onPause() {
    setPlaying(false);
    cancelAnimationFrame(frameRef.current);
    setPosition(audioRef.current?.currentTime ?? 0);
  }
  function onEnded() {
    onPause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  }
  // A new file or report loads the file again, which stops it.
  function onEmptied() {
    onPause();
    setDuration(0);
  }
  function onDuration() {
    const value = audioRef.current?.duration ?? 0;
    setDuration(Number.isFinite(value) ? value : 0);
  }
  function onError() {
    onPause();
    failedRef.current = true;
    setFailed(true);
  }

  useEffect(() => {
    if (autoplay) playRef.current();
    return () => {
      cancelAnimationFrame(frameRef.current);
      const element = audioRef.current;
      if (element) rewind(element);
      if (current === element) current = undefined;
    };
    // Starts once when the preview opens, matching onMounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={classes('thumbnail', 'audio', 'audio-preview', { 'is-playing': playing })}>
      <div className="generic-preview audio">{[
        <div key="wave" className="waveform audio-waveform" aria-hidden="true">{BARS.map((height, i) => (
          <i key={i} className={(i + 0.5) / BARS.length <= progress ? 'is-played' : undefined} style={{ height }} />
        ))}</div>,
        <button key="toggle" type="button" className="audio-toggle" disabled={failed} aria-label={`${playing ? 'Stop' : 'Play'} ${name}`} title={playing ? 'Stop' : 'Play'} onClick={toggle}>
          <i aria-hidden="true" className={classes('mdi', playing ? 'mdi-stop' : 'mdi-play')} />
        </button>,
        <small key="time" className="audio-time">{failed ? 'This audio file cannot be played' : `${clock(position)} / ${duration ? clock(duration) : '…'}`}</small>,
      ]}</div>
      {extension ? <span className="badge file-format">{extension.toUpperCase()}</span> : null}
      <audio ref={audioRef} src={reportPreviewURL(file, revision)} preload="auto"
        onPlay={onPlay} onPause={onPause} onEnded={onEnded} onEmptied={onEmptied} onDurationChange={onDuration} onError={onError} />
    </div>
  );
}
