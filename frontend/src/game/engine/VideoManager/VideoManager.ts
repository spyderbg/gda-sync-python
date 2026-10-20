// The VideoManager module (plugins/src/Egt/VideoManager): provides IVideo, the screen of the view resolution the game
// draws on, and IVideoManager, the render layers over it (the capping splash...). The browser's canvas is that screen,
// scaled to the page; touches are mapped back to the view resolution. Its Process updates the started tweens (tweeny).

import * as tweeny from '../../hat_libs/tweeny/tweeny';
import { IResources } from '../Game/RuntimeExport/IResources';
import { Runtime } from '../GameCore/RuntimeAccess';
import { DrawList } from '../GameVideoCtrl/DrawList';
import { FontCache } from '../GameVideoCtrl/Fonts';
import { ImageCache } from '../GameVideoCtrl/ImageCache';
import { IVideo, type TouchEventData } from '../GameVideoCtrl/RuntimeExport/IVideo';
import { type DrawHandler, type EventHandler, IVideoManager, type IsOpaqueFullScreenHandler } from '../GameVideoCtrl/RuntimeExport/IVideoManager';
import { BaseModule, type ModuleConfig } from '../ModuleManager/BaseModule';

export const RESOLUTION = { width: 1920, height: 1080 };

export class VideoManager extends BaseModule implements IVideo, IVideoManager {
  private images: ImageCache | null = null;
  private fonts: FontCache | null = null;
  private drawMain: ((drawList: DrawList) => void) | null = null;
  private drawInfo: ((drawList: DrawList) => void) | null = null;
  private drawTopper: ((drawList: DrawList) => void) | null = null;
  private infoCtx: CanvasRenderingContext2D | null = null;
  private topperCtx: CanvasRenderingContext2D | null = null;
  private handleEvent: ((event: TouchEventData) => boolean) | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly layersMain = new Map<number, { handleEvent: EventHandler; draw: DrawHandler; isOpaqueFullScreen: IsOpaqueFullScreenHandler }>();
  private readonly listeners: [string, EventListener][] = [];
  private m_lastProcess: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly infoCanvas: HTMLCanvasElement | null = null,
    private readonly topperCanvas: HTMLCanvasElement | null = null) {
    super();
  }

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    const resources = this.RuntimeGet(IResources);
    const images = new ImageCache(file => resources.FileUrl(file));
    this.images = images;
    this.fonts = new FontCache(file => resources.FileUrl(file), file => images.Get(file));
    this.canvas.width = RESOLUTION.width;
    this.canvas.height = RESOLUTION.height;
    this.ctx = this.canvas.getContext('2d');
    for (const screen of [this.infoCanvas, this.topperCanvas]) {
      if (!screen) continue;
      screen.width = RESOLUTION.width;
      screen.height = RESOLUTION.height;
    }
    this.infoCtx = this.infoCanvas?.getContext('2d') ?? null;
    this.topperCtx = this.topperCanvas?.getContext('2d') ?? null;
    const touch = (type: 'down' | 'up') => (event: Event) => {
      const pointer = event as PointerEvent;
      const rect = this.canvas.getBoundingClientRect();
      const x = ((pointer.clientX - rect.left) / rect.width) * RESOLUTION.width;
      const y = ((pointer.clientY - rect.top) / rect.height) * RESOLUTION.height;
      if (type === 'down') this.canvas.setPointerCapture?.(pointer.pointerId);
      this.HandleEvent({ type, x, y });
    };
    this.listeners.push(['pointerdown', touch('down')], ['pointerup', touch('up')]);
    for (const [name, listener] of this.listeners) this.canvas.addEventListener(name, listener);
    this.RuntimeAdd(IVideo, this);
    this.RuntimeAdd(IVideoManager, this);
    return true;
  }

  Deinit() {
    tweeny.shutdown();
    for (const [name, listener] of this.listeners) this.canvas.removeEventListener(name, listener);
    this.RuntimeRemove(IVideo);
    this.RuntimeRemove(IVideoManager);
    super.Deinit();
  }

  /** Runs the tweens by the time since the last frame (C++'s stopwatch). */
  Process() {
    const now = performance.now();
    const dt = this.m_lastProcess === null ? 0 : now - this.m_lastProcess;
    this.m_lastProcess = now;
    tweeny.update(dt);
  }

  RegisterDrawMain(handleEvent: (event: TouchEventData) => boolean, draw: (drawList: DrawList) => void) {
    this.handleEvent = handleEvent;
    this.drawMain = draw;
  }

  UnregisterDrawMain() {
    this.handleEvent = null;
    this.drawMain = null;
  }

  RegisterDrawInfo(_handleEvent: ((event: TouchEventData) => boolean) | null, draw: (drawList: DrawList) => void) {
    this.drawInfo = draw;
  }

  UnregisterDrawInfo() {
    this.drawInfo = null;
  }

  RegisterDrawTopper(_handleEvent: ((event: TouchEventData) => boolean) | null, draw: (drawList: DrawList) => void) {
    this.drawTopper = draw;
  }

  UnregisterDrawTopper() {
    this.drawTopper = null;
  }

  /** The topper screen's size. In C++ the integration's viewport has it; the browser has none, so the topper's module
   * sets it from its picture. */
  SetTopperResolution(width: number, height: number) {
    if (!this.topperCanvas || width <= 0 || height <= 0) return;
    this.topperCanvas.width = Math.round(width);
    this.topperCanvas.height = Math.round(height);
  }

  GetInfoResolution() {
    return { ...RESOLUTION };
  }

  RegisterRenderLayerMain(layer: number, handleEvent: EventHandler, draw: DrawHandler, isOpaqueFullScreen: IsOpaqueFullScreenHandler) {
    this.layersMain.set(layer, { handleEvent, draw, isOpaqueFullScreen });
  }

  UnregisterRenderLayerMain(layer: number) {
    this.layersMain.delete(layer);
  }

  private Layers() {
    return [...this.layersMain].sort(([a], [b]) => a - b).map(([, layer]) => layer);
  }

  /** The topmost layer first, then the game, until one takes the input. */
  private HandleEvent(event: TouchEventData) {
    for (const layer of this.Layers().reverse()) if (layer.handleEvent(event)) return;
    this.handleEvent?.(event);
  }

  GetImages() {
    if (!this.images) throw new Error('VideoManager is not initialized');
    return this.images;
  }

  GetFonts() {
    if (!this.fonts) throw new Error('VideoManager is not initialized');
    return this.fonts;
  }

  /** The images, once the module is initialized. */
  TryGetImages() {
    return this.images;
  }

  GetResolution() {
    return { ...RESOLUTION };
  }

  /** Draws a frame: the game's main draw over black, then the layers over it, from the topmost opaque one. */
  PostProcess() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, RESOLUTION.width, RESOLUTION.height);
    const drawList = new DrawList(ctx);
    const layers = this.Layers();
    // What is under an opaque full-screen layer is not drawn.
    let opaque = -1;
    layers.forEach((layer, i) => {
      if (layer.isOpaqueFullScreen?.()) opaque = i;
    });
    if (opaque < 0) this.drawMain?.(drawList);
    for (const layer of layers.slice(Math.max(opaque, 0))) layer.draw(drawList);
    this.DrawScreen(this.infoCanvas, this.infoCtx, this.drawInfo);
    this.DrawScreen(this.topperCanvas, this.topperCtx, this.drawTopper);
  }

  /** The info or topper screen, when the page shows it. */
  private DrawScreen(canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null, draw: ((drawList: DrawList) => void) | null) {
    if (!ctx || !draw || !canvas?.isConnected || !canvas.offsetParent) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw(new DrawList(ctx));
  }
}
