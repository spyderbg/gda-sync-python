// Egt::Game::IAnimationClip (GameVideoCtrl/ViewElements/AnimationClip/IAnimationClip.h): what an AnimElement plays,
// an image sequence (ImageSeqElement) or a movie (MovieElement).

import type { Color, Size } from '../../../Game/RuntimeExport/IResources';
import type { DrawList, Transform } from '../../DrawList';

export abstract class IAnimationClip {
  protected m_playCount = 0;
  /** 0 - loop, 1 - play just once, ... */
  protected m_repeatCount = 1;

  abstract Load(): Promise<boolean>;
  abstract Unload(): void;
  abstract Play(): boolean;
  abstract Stop(): void;
  abstract Rewind(): boolean;
  abstract PlayFromLoopFrame(): boolean;
  abstract IsPlaying(): boolean;
  /** The duration of one pass, in milliseconds. */
  abstract GetDuration(): number;

  // The AnimElement keeps the place, size and color: its clip draws with them.
  abstract Update(now: number, visible: boolean): void;
  abstract Draw(drawList: DrawList, transform: Transform, color: Color): void;
  abstract GetSize(): Size;

  GetPlayCount() {
    return this.m_playCount;
  }

  GetRepeatCount() {
    return this.m_repeatCount;
  }

  SetRepeatCount(count: number) {
    this.m_repeatCount = count;
  }

  protected ResetPlayCount() {
    this.m_playCount = 0;
  }
}
