export interface ImageArea { x: number; y: number; width: number; height: number }
export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }

/** Compare at native size, aligned at the top left. Ignore invisible RGB, but include alpha changes and missing pixels. */
export function pixelDifferences(left: PixelImage, right: PixelImage) {
  const width = Math.max(left.width, right.width), height = Math.max(left.height, right.height);
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inLeft = x < left.width && y < left.height, inRight = x < right.width && y < right.height;
      if (!inLeft && !inRight) continue;
      const offset = y * width + x;
      if (!inLeft || !inRight) { values[offset] = 255; continue; }
      const a = (y * left.width + x) * 4, b = (y * right.width + x) * 4;
      const alphaA = left.data[a + 3], alphaB = right.data[b + 3];
      let difference = Math.abs(alphaA - alphaB);
      for (let channel = 0; channel < 3; channel++) {
        difference = Math.max(difference, Math.abs(left.data[a + channel] * alphaA / 255 - right.data[b + channel] * alphaB / 255));
      }
      values[offset] = Math.round(difference);
    }
  }
  return { width, height, values };
}

/** Dark blue is unchanged; cyan, yellow and red show increasing absolute difference above tolerance. */
export function differenceHeatmap(values: Uint8Array, tolerance: number) {
  const pixels = new Uint8ClampedArray(values.length * 4);
  for (let index = 0; index < values.length; index++) {
    const offset = index * 4, value = values[index];
    let red = 12, green = 20, blue = 48;
    if (value > tolerance) {
      const strength = value / 255;
      red = Math.min(255, strength * 3 * 255);
      green = strength < 1 / 3 ? strength * 3 * 255 : Math.max(0, (1 - strength) * 1.5 * 255);
      blue = Math.max(0, (1 - strength * 3) * 255);
    }
    pixels[offset] = red; pixels[offset + 1] = green; pixels[offset + 2] = blue; pixels[offset + 3] = 255;
  }
  return pixels;
}

export function differenceStats(values: Uint8Array, width: number, area: ImageArea, tolerance: number) {
  let changed = 0, maximum = 0;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) {
      const value = values[y * width + x];
      maximum = Math.max(maximum, value);
      if (value <= tolerance) continue;
      changed++;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { changed, maximum, bounds: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null };
}
