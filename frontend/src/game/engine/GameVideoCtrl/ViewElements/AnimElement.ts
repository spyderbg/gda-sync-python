// Egt::GameVideoCtrl::AnimElement (ViewElements/AnimElement.h/.cpp): plays its key's movie (RssMoviesData.json) or
// image sequence (RssImagesSeqData.json), through the animation clip it makes for it (AnimationClip/).

import type { ViewElementData } from '../../Game/RuntimeExport/IResources';
import { IResources } from '../../Game/RuntimeExport/IResources';
import { Runtime } from '../../GameCore/RuntimeAccess';
import type { DrawList } from '../DrawList';
import { BaseElement } from './BaseElement';
import type { IAnimationClip } from './AnimationClip/IAnimationClip';
import { ImageSeqElement } from './AnimationClip/ImageSeqElement';
import { MovieElement } from './AnimationClip/MovieElement';

export class AnimElement extends BaseElement {
  private m_animationClip: IAnimationClip | null = null;
  private m_clipKey = '';

  Init(runtime: Runtime, key = '') {
    super.Init(runtime, key);
    this.CreateAnimationClip();
  }

  Deinit() {
    super.Deinit();
    this.m_animationClip?.Stop();
    this.m_animationClip?.Unload();
  }

  SetElementData(data: ViewElementData) {
    super.SetElementData(data);
    const key = data.rssKey ?? data.rssKeys?.[0];
    if (key) this.key = key;
    this.CreateAnimationClip();
    if (typeof data.loopCount === 'number') this.SetRepeatCount(data.loopCount);
  }

  // The views set an element's data after its Init, so the clip is made again when the key changes.
  private CreateAnimationClip() {
    if (this.m_clipKey === this.key) return;
    this.m_animationClip?.Unload();
    this.m_animationClip = null;
    this.m_clipKey = this.key;
    if (!this.key) return;
    const resources = this.RuntimeGet(IResources);
    if (resources.GetMovie(this.key)) this.m_animationClip = new MovieElement(this.GetRuntime(), this.key);
    else if (resources.GetImageSequence(this.key)) this.m_animationClip = new ImageSeqElement(this.GetRuntime(), this.key);
    else console.warn(`Could not find AnimElement of type Movie or ImageSeq with key ${this.key}`);
  }

  /** Loads the frames, or the movie, ahead of playing them. */
  Load() {
    return this.m_animationClip?.Load() ?? Promise.resolve(false);
  }

  Play() {
    return this.m_animationClip?.Play() ?? false;
  }

  Stop() {
    this.m_animationClip?.Stop();
  }

  Rewind() {
    return this.m_animationClip?.Rewind() ?? false;
  }

  PlayFromLoopFrame() {
    return this.m_animationClip?.PlayFromLoopFrame() ?? false;
  }

  IsPlaying() {
    return this.m_animationClip?.IsPlaying() ?? false;
  }

  /** The duration of one pass, in milliseconds. */
  GetDuration() {
    return this.m_animationClip?.GetDuration() ?? 0;
  }

  GetRepeatCount() {
    return this.m_animationClip?.GetRepeatCount() ?? 0;
  }

  SetRepeatCount(count: number) {
    this.m_animationClip?.SetRepeatCount(count);
    return this;
  }

  Update(now: number) {
    this.m_animationClip?.Update(now, this.IsVisible());
  }

  GetSize() {
    return this.m_animationClip?.GetSize() ?? { w: 0, h: 0 };
  }

  Draw(drawList: DrawList) {
    if (this.hidden) return;
    this.m_animationClip?.Draw(drawList, this.GetTransform(), this.color);
  }
}
