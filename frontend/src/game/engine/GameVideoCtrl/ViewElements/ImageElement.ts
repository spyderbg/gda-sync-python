// Egt::GameVideoCtrl::ImageElement (ViewElements/ImageElement.h): an image by RssKey, or one of several (SetSelectedImage).

import type { ViewElementData } from '../../Game/RuntimeExport/IResources';
import { IResources } from '../../Game/RuntimeExport/IResources';
import { Runtime } from '../../GameCore/RuntimeAccess';
import type { DrawList } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import { BaseElement } from './BaseElement';

export class ImageElement extends BaseElement {
  protected keys: string[] = [];
  protected selected = 0;

  Init(runtime: Runtime, key = '') {
    super.Init(runtime, key);
    if (key) this.keys = [key];
  }

  SetElementData(data: ViewElementData) {
    super.SetElementData(data);
    const keys = data.rssKeys ?? (data.rssKey ? [data.rssKey] : []);
    if (keys.length) this.keys = keys;
  }

  SetImage(index: number, rssKey: string) {
    this.keys[index] = rssKey;
    return this;
  }

  GetSelectedImage() {
    return this.selected;
  }

  SetSelectedImage(index: number) {
    this.selected = index;
    return this;
  }

  protected CurrentImage() {
    const key = this.keys[this.selected] ?? this.keys[0];
    if (!key) return null;
    const entry = this.RuntimeGet(IResources).GetImage(key);
    if (!entry) return null;
    const image = this.RuntimeGet(IVideo).GetImages().Get(entry.file);
    return image ? { image, source: entry.source ?? null } : null;
  }

  GetSize() {
    const current = this.CurrentImage();
    if (!current) return { w: 0, h: 0 };
    return current.source ? { w: current.source.w, h: current.source.h } : { w: current.image.naturalWidth, h: current.image.naturalHeight };
  }

  Draw(drawList: DrawList) {
    if (this.hidden) return;
    const current = this.CurrentImage();
    if (!current) return;
    const size = this.GetSize();
    drawList.DrawImage(current.image, current.source, this.GetTransform(), size.w, size.h, this.color);
  }
}
