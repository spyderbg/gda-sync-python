// The picture of a movie's current frame, for video_ctrl::draw_list::add_movie_image. A "valpha" movie stacks its alpha
// under its picture: the top half of each frame is the picture, the bottom half its alpha as gray. The frame is composed
// into a transparent picture of half the height, on the GPU (WebGL), or else from its pixels.

const VERTEX = `attribute vec2 p; varying vec2 uv;
void main() { uv = vec2(p.x, 1.0 - p.y) ; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FRAGMENT = `precision mediump float; varying vec2 uv; uniform sampler2D frame;
void main() {
  vec3 color = texture2D(frame, vec2(uv.x, uv.y * 0.5)).rgb;
  float alpha = texture2D(frame, vec2(uv.x, 0.5 + uv.y * 0.5)).r;
  gl_FragColor = vec4(color * alpha, alpha);
}`;

export class MovieFrame {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private composedTime = -1;

  /** The picture of the video's current frame, or null before it has one. */
  Get(video: HTMLVideoElement, format: string | undefined): CanvasImageSource | null {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;
    if (format !== 'valpha') return video;
    const width = video.videoWidth;
    const height = Math.floor(video.videoHeight / 2);
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height) this.Create(width, height);
    if (this.composedTime !== video.currentTime) {
      this.composedTime = video.currentTime;
      if (this.gl) this.ComposeGl(video);
      else this.Compose2d(video, width, height);
    }
    return this.canvas;
  }

  private Create(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.composedTime = -1;
    this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
    if (!this.gl || !this.Program(this.gl)) {
      this.gl = null;
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
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

  private ComposeGl(video: HTMLVideoElement) {
    const gl = this.gl!;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private Compose2d(video: HTMLVideoElement, width: number, height: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, 0, height, width, height, 0, 0, width, height);
    const alpha = ctx.getImageData(0, 0, width, height).data;
    ctx.drawImage(video, 0, 0, width, height, 0, 0, width, height);
    const picture = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < alpha.length; i += 4) picture.data[i] = alpha[i - 3];
    ctx.putImageData(picture, 0, 0);
  }
}
