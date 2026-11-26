import type { MovieAlphaFormat } from '../../../types';

export function isMovieAlphaFormat(format: string | undefined): format is MovieAlphaFormat {
  return format === 'valpha' || format === 'valpha-top' || format === 'halpha' || format === 'halpha-left';
}

export function movieAlphaRects(videoWidth: number, videoHeight: number, format: MovieAlphaFormat) {
  const horizontal = format === 'halpha' || format === 'halpha-left';
  const width = horizontal ? Math.floor(videoWidth / 2) : videoWidth;
  const height = horizontal ? videoHeight : Math.floor(videoHeight / 2);
  return {
    width, height,
    pictureX: format === 'halpha-left' ? width : 0,
    pictureY: format === 'valpha-top' ? height : 0,
    alphaX: format === 'halpha' ? width : 0,
    alphaY: format === 'valpha' ? height : 0,
  };
}

const snapshots = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>();

export function composeMovieAlpha(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, rects: ReturnType<typeof movieAlphaRects>) {
  const { width, height, pictureX, pictureY, alphaX, alphaY } = rects;
  const { width: outputWidth, height: outputHeight } = ctx.canvas;
  let snapshot = snapshots.get(ctx);
  if (!snapshot) {
    const context = document.createElement('canvas').getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) return;
    snapshots.set(ctx, context);
    snapshot = context;
  }
  const horizontal = pictureX !== alphaX;
  const packedWidth = width * (horizontal ? 2 : 1);
  const packedHeight = height * (horizontal ? 1 : 2);
  const snapshotWidth = outputWidth * (horizontal ? 2 : 1);
  const snapshotHeight = outputHeight * (horizontal ? 1 : 2);
  if (snapshot.canvas.width !== snapshotWidth || snapshot.canvas.height !== snapshotHeight) {
    snapshot.canvas.width = snapshotWidth;
    snapshot.canvas.height = snapshotHeight;
  }
  // Playback can advance between two draws from a video. Both tiles must come from the same snapshot.
  snapshot.drawImage(video, 0, 0, packedWidth, packedHeight, 0, 0, snapshotWidth, snapshotHeight);
  const alpha = snapshot.getImageData(alphaX ? outputWidth : 0, alphaY ? outputHeight : 0, outputWidth, outputHeight).data;
  const picture = snapshot.getImageData(pictureX ? outputWidth : 0, pictureY ? outputHeight : 0, outputWidth, outputHeight);
  // ImageData uses straight color. Divide out the alpha that was applied before encoding.
  for (let i = 0; i < alpha.length; i += 4) {
    const value = alpha[i];
    const factor = value ? 255 / value : 0;
    picture.data[i] *= factor;
    picture.data[i + 1] *= factor;
    picture.data[i + 2] *= factor;
    picture.data[i + 3] = value;
  }
  ctx.putImageData(picture, 0, 0);
}
