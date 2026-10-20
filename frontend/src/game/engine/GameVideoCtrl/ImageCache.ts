// The images the game draws, loaded once per file from the backend (a DDS texture decoded to PNG) and drawn once loaded.

export class ImageCache {
  private readonly images = new Map<string, { image: HTMLImageElement; loaded: boolean; failed: boolean }>();
  /** Files that could not be loaded, for the game's resource problems. */
  readonly failed = new Set<string>();

  constructor(private readonly url: (file: string) => string) {}

  /** The image of a file once loaded; starts loading it on first request. */
  Get(file: string): HTMLImageElement | null {
    let entry = this.images.get(file);
    if (!entry) {
      const image = new Image();
      entry = { image, loaded: false, failed: false };
      this.images.set(file, entry);
      const current = entry;
      image.onload = () => { current.loaded = true; };
      image.onerror = () => { current.failed = true; this.failed.add(file); };
      image.src = this.url(file);
    }
    return entry.loaded ? entry.image : null;
  }

  /** Loads files ahead of their first draw; resolves when all are loaded or failed. */
  Preload(files: string[]) {
    return Promise.all(files.map(file => new Promise<void>(resolve => {
      this.Get(file);
      const entry = this.images.get(file)!;
      if (entry.loaded || entry.failed) return resolve();
      entry.image.addEventListener('load', () => resolve(), { once: true });
      entry.image.addEventListener('error', () => resolve(), { once: true });
    })));
  }

  get size() {
    return this.images.size;
  }

  /** Whether no image is loading. */
  IsIdle() {
    for (const entry of this.images.values()) if (!entry.loaded && !entry.failed) return false;
    return true;
  }

  get loadedCount() {
    let count = 0;
    for (const entry of this.images.values()) if (entry.loaded) count++;
    return count;
  }
}
