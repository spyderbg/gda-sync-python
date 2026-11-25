import type { MovieAlphaFormat } from '../../../types';
import { composeMovieAlpha, isMovieAlphaFormat, movieAlphaRects } from './movieAlpha';

// Compose the premultiplied picture and its grayscale mask on the GPU (WebGL), with a 2D canvas fallback.
//
// The WebGL picture is an OffscreenCanvas where the browser has one: Firefox swaps red and blue when its GPU 2D canvas
// (the game's) draws a WebGL <canvas> (a gold Big Win shows blue), but not when it draws a WebGL OffscreenCanvas.

const VERTEX = `attribute vec2 p; varying vec2 uv;
void main() { uv = vec2(p.x, 1.0 - p.y) ; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FRAGMENT = `precision mediump float; varying vec2 uv; uniform sampler2D frame;
uniform vec2 tileSize, pictureOffset, alphaOffset;
void main() {
  vec2 point = uv * tileSize;
  vec3 color = texture2D(frame, point + pictureOffset).rgb;
  float alpha = texture2D(frame, point + alphaOffset).r;
  gl_FragColor = vec4(min(color, vec3(alpha)), alpha);
}`;

const ATTRIBUTES: WebGLContextAttributes = { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true };

export class MovieFrame {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private uniforms: { tile: WebGLUniformLocation | null; picture: WebGLUniformLocation | null; alpha: WebGLUniformLocation | null } | null = null;
  private composedTime = -1;
  private format?: MovieAlphaFormat;

  /** The picture of the video's current frame, or null before it has one. */
  Get(video: HTMLVideoElement, format: string | undefined): CanvasImageSource | null {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;
    if (!isMovieAlphaFormat(format)) return video;
    const rects = movieAlphaRects(video.videoWidth, video.videoHeight, format);
    const { width, height } = rects;
    if (!width || !height) return video;
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height) this.Create(width, height);
    if (this.composedTime !== video.currentTime || this.format !== format) {
      this.format = format;
      this.composedTime = video.currentTime;
      if (this.gl) this.ComposeGl(video, rects);
      else if (this.ctx) composeMovieAlpha(this.ctx, video, rects);
    }
    return this.canvas;
  }

  private Create(width: number, height: number) {
    this.composedTime = -1;
    this.ctx = null;
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : MovieFrame.Element(width, height);
    this.canvas = canvas;
    this.gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl', ATTRIBUTES) : canvas.getContext('webgl', ATTRIBUTES);
    if (!this.gl || !this.Program(this.gl)) {
      this.gl = null;
      const fallback = MovieFrame.Element(width, height);
      this.canvas = fallback;
      this.ctx = fallback.getContext('2d', { willReadFrequently: true });
    }
  }

  private static Element(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private Program(gl: WebGLRenderingContext) {
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)!;
      gl.shaderSource(result, source);
      gl.compileShader(result);
      return gl.getShaderParameter(result, gl.COMPILE_STATUS) ? result : null;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return false;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    this.uniforms = {
      tile: gl.getUniformLocation(program, 'tileSize'),
      picture: gl.getUniformLocation(program, 'pictureOffset'),
      alpha: gl.getUniformLocation(program, 'alphaOffset'),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    // A video's size is rarely a power of two: no mipmaps, no repeat.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  private ComposeGl(video: HTMLVideoElement, rects: ReturnType<typeof movieAlphaRects>) {
    const gl = this.gl!;
    const { tile, picture, alpha } = this.uniforms!;
    const { videoWidth, videoHeight } = video;
    gl.uniform2f(tile, rects.width / videoWidth, rects.height / videoHeight);
    gl.uniform2f(picture, rects.pictureX / videoWidth, rects.pictureY / videoHeight);
    gl.uniform2f(alpha, rects.alphaX / videoWidth, rects.alphaY / videoHeight);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
