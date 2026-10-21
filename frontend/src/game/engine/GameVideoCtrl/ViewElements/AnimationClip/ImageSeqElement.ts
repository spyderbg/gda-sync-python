// Egt::Game::ImageSeqElement (GameVideoCtrl/ViewElements/AnimationClip/ImageSeqElement.h): an image sequence, played a
// frame every frameTime milliseconds, loopCount times (the element's own, or else the sequence's; 0 repeats from frame
// loopTo forever).

import type { Color, RssImageSequence } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList, Transform } from '../../DrawList';
import { IVideo } from '../../RuntimeExport/IVideo';
import { IAnimationClip } from './IAnimationClip';

export class ImageSeqElement extends IAnimationClip {
  private readonly m_runtime = new RuntimeHolder();
  private m_ownRepeatCount: number | null = null;
  private m_playing = true;
  private m_startTime = performance.now();
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
    if (!this.m_playing) {
      this.m_playing = true;
      this.m_startTime = performance.now() - this.FrameStart(this.m_frame);
    }
    return true;
  }

  Stop() {
    this.m_playing = false;
  }

  Rewind() {
    this.m_frame = 0;
    this.m_startTime = performance.now();
    return true;
  }

  PlayFromLoopFrame() {
    this.m_frame = this.Sequence()?.loopTo ?? 0;
    this.m_startTime = performance.now() - this.FrameStart(this.m_frame);
    this.m_playing = true;
    return true;
  }

  IsPlaying() {
    return this.m_playing && this.Sequence() !== null;
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

  private FrameStart(frame: number) {
    return frame * (this.Sequence()?.frameTime ?? 0);
  }

  Update(now: number) {
    if (!this.m_playing) return;
    const sequence = this.Sequence();
    if (!sequence || !sequence.frames.length) return;
    const count = sequence.frames.length;
    const loopTo = Math.min(sequence.loopTo ?? 0, count - 1);
    const loops = this.GetRepeatCount();
    let index = Math.floor((now - this.m_startTime) / Math.max(sequence.frameTime, 1));
    if (index >= count) {
      const loopLength = count - loopTo;
      const total = count + (loops > 0 ? (loops - 1) * loopLength : Infinity);
      if (index >= total) {
        index = count - 1;
        this.m_playing = false;
      } else {
        index = loopTo + ((index - count) % loopLength);
      }
    }
    this.m_frame = index;
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
