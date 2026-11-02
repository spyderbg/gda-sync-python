// video_ctrl::image_data (hat_libs video_ctrl): a resource image as a debug tool draws it, its texture and its part of
// the texture. The browser's texture is the URL its file loads from (a DDS file decoded to PNG by the backend).

import type { IResources, RssRect } from '@game/engine/Game/RuntimeExport/IResources';

export interface ImageData {
  src: string;
  /** The image's part of the file; all of it when null. */
  rect: RssRect | null;
}

/** The image of an rss key, as the C++ tools' image getters read it from the resources; null when it has none. */
export function GetImageData(resources: IResources, rssKey: string): ImageData | null {
  const image = resources.GetImage(rssKey);
  if (!image) return null;
  return { src: resources.FileUrl(image.file), rect: image.source ?? null };
}
