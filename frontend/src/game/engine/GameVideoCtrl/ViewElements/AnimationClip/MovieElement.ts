// Egt::Game::MovieElement (GameVideoCtrl/ViewElements/AnimationClip/MovieElement.h/.cpp): a movie of
// RssMoviesData.json, played by the browser's video player from the backend (the asset library's preview), muted: its
// sounds are audio events. It plays repeatCount times (0: forever) while it is visible, as in C++.
//
// C++ loads and starts a movie when the element is made. Here it loads once the game's images have loaded (so that
// they come first), or when it is played, and starts when it is played.

import type { Color, RssMovie } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList, Transform } from '../../DrawList';
import { MovieFrame } from '../../MovieFrame';
import { IVideo } from '../../RuntimeExport/IVideo';
import { IAnimationClip } from './IAnimationClip';

export class MovieElement extends IAnimationClip {
  private readonly m_runtime = new RuntimeHolder();
  private readonly m_resource: RssMovie | null;
  private readonly m_frame = new MovieFrame();
  private m_player: HTMLVideoElement | null = null;
  private m_started = false;

  constructor(runtime: Runtime, key: string) {
    super();
    this.m_runtime.SetRuntime(runtime);
    this.m_resource = this.m_runtime.RuntimeGet(IResources).GetMovie(key);
  }

  /** The player of the movie (rss::convert), made when it is first needed. */
  private Player() {
    if (!this.m_player && this.m_resource) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = this.m_runtime.RuntimeGet(IResources).FileUrl(this.m_resource.file);
      this.m_player = video;
    }
    return this.m_player;
  }

  Load() {
    const player = this.Player();
    if (!player) return Promise.resolve(false);
    if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
    return new Promise<boolean>(resolve => {
      player.addEventListener('loadeddata', () => resolve(true), { once: true });
      player.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  Unload() {
    if (!this.m_player) return;
    this.m_player.pause();
    this.m_player.removeAttribute('src');
    this.m_player.load();
    this.m_player = null;
  }

  Play() {
    const player = this.Player();
    if (!player) return false;
    player.currentTime = 0;
    this.m_started = true;
    // A muted video may play without a user gesture; one that may not stays on its first frame.
    void player.play().catch(() => {});
    return true;
  }

  Stop() {
    this.m_started = false;
    this.m_player?.pause();
  }

  Rewind() {
    const player = this.Player();
    if (!player) return false;
    player.currentTime = 0;
    return true;
  }

  PlayFromLoopFrame() {
    // TODO: implement functionality (as in C++)
    return false;
  }

  IsPlaying() {
    return this.m_started && !!this.m_player && !this.m_player.ended;
  }

  GetDuration() {
    const duration = this.m_player?.duration ?? 0;
    return Number.isFinite(duration) ? duration * 1000 : 0;
  }

  Update(_now: number, visible: boolean) {
    if (!this.m_player && this.m_resource && this.m_runtime.RuntimeGet(IVideo).GetImages().IsIdle()) this.Player();
    if (!visible || !this.m_player || !this.m_started) return;
    if (!this.m_player.ended) return;
    this.m_playCount++;
    if (this.GetRepeatCount() === 0 || this.m_playCount < this.GetRepeatCount()) this.Play();
    else this.m_started = false;
  }

  GetSize() {
    const player = this.m_player;
    if (!player?.videoWidth) return { w: 0, h: 0 };
    return { w: player.videoWidth, h: this.m_resource?.movieFormat === 'valpha' ? Math.floor(player.videoHeight / 2) : player.videoHeight };
  }

  Draw(drawList: DrawList, transform: Transform, color: Color) {
    if (!this.m_player || !this.m_started) return;
    const picture = this.m_frame.Get(this.m_player, this.m_resource?.movieFormat);
    if (!picture) return;
    const size = this.GetSize();
    drawList.DrawMovie(picture, transform, size.w, size.h, color);
  }
}
