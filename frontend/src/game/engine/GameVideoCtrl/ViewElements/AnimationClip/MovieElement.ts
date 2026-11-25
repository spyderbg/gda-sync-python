// Egt::Game::MovieElement (GameVideoCtrl/ViewElements/AnimationClip/MovieElement.h/.cpp): a movie of
// RssMoviesData.json, played by the browser's video player from the backend (the asset library's preview), muted: its
// sounds are audio events. It plays from when it is made; while it is visible, a stopped movie (at its end, or Stop)
// counts a play and plays again while its repeatCount allows (0: forever), as in C++. It is drawn while it plays.
//
// C++ loads and starts a movie when the element is made. Here it loads once the game's images have loaded (so that
// they come first), or when it is played: the start C++ makes when the element is made waits for it.

import type { Color, RssMovie } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList, Transform } from '../../DrawList';
import { MovieFrame } from '../../MovieFrame';
import { isMovieAlphaFormat, movieAlphaRects } from '../../movieAlpha';
import { IVideo } from '../../RuntimeExport/IVideo';
import { IAnimationClip } from './IAnimationClip';

export class MovieElement extends IAnimationClip {
  private readonly m_runtime = new RuntimeHolder();
  private readonly m_resource: RssMovie | null;
  private readonly m_frame = new MovieFrame();
  private m_player: HTMLVideoElement | null = null;
  private m_started = false;
  /** C++'s Init plays the movie: here once its player is made. */
  private m_playOnLoad = true;

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
    this.m_playOnLoad = false;
    player.currentTime = 0;
    this.m_started = true;
    // A muted video may play without a user gesture; one that may not stays on its first frame.
    void player.play().catch(() => {});
    return true;
  }

  Stop() {
    this.m_playOnLoad = false;
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
    if (this.m_playOnLoad && this.m_resource) return true;
    return this.m_started && !!this.m_player && !this.m_player.ended;
  }

  GetDuration() {
    const duration = this.m_player?.duration ?? 0;
    return Number.isFinite(duration) ? duration * 1000 : 0;
  }

  Update(_now: number, visible: boolean) {
    if (!this.m_player && this.m_resource && this.m_runtime.RuntimeGet(IVideo).GetImages().IsIdle()) this.Player();
    if (this.m_player && this.m_playOnLoad) this.Play();

    if (!visible) return;

    const player = this.m_player;
    if (player === null) return;
    if (this.IsPlaying()) return;

    // stopped: at its end, or by Stop
    this.m_playCount++;

    if (this.GetRepeatCount() === 0 || (this.GetRepeatCount() > 0 && this.m_playCount < this.GetRepeatCount())) {
      this.Play();
    }
  }

  GetSize() {
    const player = this.m_player;
    if (!player?.videoWidth) return { w: 0, h: 0 };
    const format = this.m_resource?.movieFormat;
    if (isMovieAlphaFormat(format)) {
      const { width, height } = movieAlphaRects(player.videoWidth, player.videoHeight, format);
      return { w: width, h: height };
    }
    return { w: player.videoWidth, h: player.videoHeight };
  }

  Draw(drawList: DrawList, transform: Transform, color: Color) {
    if (!this.m_player || !this.IsPlaying()) return;
    const picture = this.m_frame.Get(this.m_player, this.m_resource?.movieFormat);
    if (!picture) return;
    const size = this.GetSize();
    drawList.DrawMovie(picture, transform, size.w, size.h, color);
  }
}
