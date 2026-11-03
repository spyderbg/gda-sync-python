import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { GameBackgroundView } from './Views/GameBackgroundView';

const TetraSuffix = '_tetra';

// Paired elements keep their authored transforms. Only their bindings and
// drawing change; reload callbacks rebuild cached controls and credit tweens.
export class PanelElementsList extends ElementsList {
  private tetra = false;

  IsTetraLayout() { return this.CurrentLayout(); }

  private CurrentLayout() {
    const background = this.RuntimeGet(IGameBackgroundView);
    if (!(background instanceof GameBackgroundView)) throw new Error('Burning Crown panel requires its game background');
    return background.IsTetraLayout();
  }

  LoadFromResource() {
    this.tetra = this.CurrentLayout();
    return super.LoadFromResource();
  }

  UpdateFromResource() {
    this.tetra = this.CurrentLayout();
    return super.UpdateFromResource();
  }

  IsDirty() { return super.IsDirty() || this.tetra !== this.CurrentLayout(); }

  private BoundId(id: string) {
    return this.IsTetraLayout() && super.TryGet(id + TetraSuffix) ? id + TetraSuffix : id;
  }

  Get<T extends BaseElement = BaseElement>(id: string, Type?: new () => T): T {
    const element = super.Get(this.BoundId(id), Type);
    if (element.GetElementData().hidden) element.SetHidden(true);
    return element;
  }

  TryGet<T extends BaseElement = BaseElement>(id: string, Type?: new () => T): T | null {
    const element = super.TryGet(this.BoundId(id), Type);
    if (element?.GetElementData().hidden) element.SetHidden(true);
    return element;
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    const tetra = this.IsTetraLayout();
    for (const element of this.GetElements()) {
      const id = element.GetId();
      const alternate = id.endsWith(TetraSuffix);
      const paired = alternate ? super.TryGet(id.slice(0, -TetraSuffix.length)) : super.TryGet(id + TetraSuffix);
      if (paired && alternate !== tetra) continue;
      if (element.GetElementData().hidden) continue;
      element.Draw(drawList);
    }
  }
}
