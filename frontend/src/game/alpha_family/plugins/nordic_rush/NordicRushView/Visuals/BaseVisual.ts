// Egt::Game::AlphaFamily::BaseVisual (NordicRushView/Visuals/BaseVisual.h/.cpp): a part of a view drawn
// from elements it creates in the view's elements list.

import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';

export class BaseVisual {
  private readonly m_elementIds = new Set<string>();
  private m_visible = false;
  private m_subScreenIdx = 0;

  constructor(protected readonly m_elementsList: ElementsList) {}

  Draw(drawList: DrawList) {
    for (const elementId of this.m_elementIds) this.m_elementsList.TryGet(elementId)?.Draw(drawList);
  }

  Process() {}

  Clear() {
    this.m_elementsList.Remove(this.m_elementIds);
    this.m_elementIds.clear();
    this.SetVisible(false);
  }

  GetSubScreenIdx() {
    return this.m_subScreenIdx;
  }

  SetSubScreenIdx(subScreenIdx: number) {
    this.m_subScreenIdx = subScreenIdx;
  }

  IsVisible() {
    return this.m_visible;
  }

  SetVisible(visible: boolean) {
    this.m_visible = visible;
    this.m_elementsList.SetHidden(!visible, this.m_elementIds);
  }

  static DrawAll(visuals: Iterable<BaseVisual>, drawList: DrawList) {
    for (const visual of visuals) visual.Draw(drawList);
  }

  static ClearAll(visuals: BaseVisual[]) {
    for (const visual of visuals) visual.Clear();
    visuals.length = 0;
  }

  protected HasStoredElementId() {
    return this.m_elementIds.size > 0;
  }

  protected GetElementIds(): ReadonlySet<string> {
    return this.m_elementIds;
  }

  protected StoreElementId(elementId: string) {
    this.m_elementIds.add(elementId);
  }

  protected RemoveElementId(elementId: string) {
    this.m_elementIds.delete(elementId);
    this.m_elementsList.Remove(elementId);
  }
}
