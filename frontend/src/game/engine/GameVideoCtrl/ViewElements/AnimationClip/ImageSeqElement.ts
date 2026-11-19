// Egt::Game::ImageSeqElement (GameVideoCtrl/ViewElements/AnimationClip/ImageSeqElement.h/.cpp): an image sequence,
// played from when it is made, a frame every frameTime milliseconds of its stopwatch on the game Clock, while it is
// visible (hidden, its time runs on, and it catches up when it shows again). At its end, a repeat count of 0 (loopCount:
// the element's own, or else the sequence's) goes on from frame loopTo forever; any other count stays on the last frame,
// counting a play each frame time, until it has played that many times.

import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import type { Color, RssImageSequence } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList, Transform } from '../../DrawList';
import { IVideo } from '../../RuntimeExport/IVideo';
import { IAnimationClip } from './IAnimationClip';

export class ImageSeqElement extends IAnimationClip {
  private readonly m_runtime = new RuntimeHolder();
  private m_ownRepeatCount: number | null = null;
  private readonly m_stopwatch = new Stopwatch();
  /** The time not yet played, in ms. */
  private m_dt = 0;
  private m_frame = 0;

  constructor(runtime: Runtime, private readonly m_key: string) {
    super();
    this.m_runtime.SetRuntime(runtime);
  }

  private Sequence(): RssImageSequence | null {
    return this.m_runtime.RuntimeGet(IResources).GetImageSequence(this.m_key);
  }

  /** Loads the frames ahead of playing them. */
  Load() {
    const sequence = this.Sequence();
    if (!sequence) return Promise.resolve(false);
    return this.m_runtime.RuntimeGet(IVideo).GetImages().Preload(sequence.frames.map(frame => frame.file)).then(() => true);
  }

  Unload() {}

  Play() {
    this.m_stopwatch.Reset();
    this.m_stopwatch.Resume();
    return true;
  }

  Stop() {
    this.m_stopwatch.Pause();
  }

  Rewind() {
    this.m_frame = 0;
    this.m_stopwatch.Reset();
    this.ResetPlayCount();

    return true;
  }

  PlayFromLoopFrame() {
    const imagesSeq = this.Sequence();
    if (!imagesSeq || (imagesSeq.loopTo ?? 0) === 0) return false;

    this.m_frame = imagesSeq.loopTo ?? 0;
    this.Play();

    return true;
  }

  IsPlaying() {
    return this.m_stopwatch.IsRunning();
  }

  GetDuration() {
    const sequence = this.Sequence();
    return sequence ? sequence.frames.length * sequence.frameTime : 0;
  }

  // The element's loopCount, or else the sequence's.
  GetRepeatCount() {
    return this.m_ownRepeatCount ?? this.Sequence()?.loopCount ?? 0;
  }

  SetRepeatCount(count: number) {
    this.m_ownRepeatCount = count;
  }

  Update(_now: number, visible: boolean) {
    if (!visible) return;
    if (!this.m_stopwatch.IsRunning()) return;

    const imagesSeq = this.Sequence();
    if (imagesSeq === null || !imagesSeq.frameTime) return;

    this.m_dt = this.m_dt + this.m_stopwatch.Reset();

    while (this.m_dt >= imagesSeq.frameTime) {
      this.m_dt = this.m_dt - imagesSeq.frameTime;

      if (!this.NextFrame()) {
        this.Stop();
      }
    }
  }

  private NextFrame() {
    const imagesSeq = this.Sequence();
    if (!imagesSeq || !imagesSeq.frames.length) return false;

    this.m_frame++;

    if (this.m_frame >= imagesSeq.frames.length) {
      const repeatCount = this.GetRepeatCount();
      this.m_frame = repeatCount === 0 ? (imagesSeq.loopTo ?? 0) : this.m_frame - 1;
      this.m_playCount++;

      if (repeatCount > 0 && this.m_playCount >= repeatCount) return false;
    }

    return true;
  }

  private CurrentFrame() {
    const sequence = this.Sequence();
    const frame = sequence?.frames[Math.min(this.m_frame, (sequence?.frames.length ?? 1) - 1)];
    if (!frame) return null;
    const image = this.m_runtime.RuntimeGet(IVideo).GetImages().Get(frame.file);
    return image ? { image, source: frame.source ?? null } : null;
  }

  GetSize() {
    const current = this.CurrentFrame();
    if (!current) return { w: 0, h: 0 };
    return current.source ? { w: current.source.w, h: current.source.h } : { w: current.image.naturalWidth, h: current.image.naturalHeight };
  }

  Draw(drawList: DrawList, transform: Transform, color: Color) {
    const current = this.CurrentFrame();
    if (!current) return;
    const size = this.GetSize();
    drawList.DrawImage(current.image, current.source, transform, size.w, size.h, color);
  }
}
