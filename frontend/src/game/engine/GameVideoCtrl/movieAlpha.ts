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

export function composeMovieAlpha(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, rects: ReturnType<typeof movieAlphaRects>) {
  const { width, height, pictureX, pictureY, alphaX, alphaY } = rects;
  const { width: outputWidth, height: outputHeight } = ctx.canvas;
  ctx.drawImage(video, alphaX, alphaY, width, height, 0, 0, outputWidth, outputHeight);
  const alpha = ctx.getImageData(0, 0, outputWidth, outputHeight).data;
  ctx.drawImage(video, pictureX, pictureY, width, height, 0, 0, outputWidth, outputHeight);
  const picture = ctx.getImageData(0, 0, outputWidth, outputHeight);
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
