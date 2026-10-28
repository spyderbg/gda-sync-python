// Egt::Game::AlphaFamily::FreeSpinBarView (NordicRushView/Views/FreeSpinBarView.h/.cpp): the free spins' counter (the
// spin played of the spins won), for the free and the coins free rounds.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ICoinsFreeSpinBarView, IFreeSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const FreeSpinBarViewId = 'FreeSpinBarView';
const TextFreeSpinCurrentId = 'text_free_spin_current';
const TextFreeSpinTargetId = 'text_free_spin_target';

export class FreeSpinBarView extends BaseView implements IFreeSpinBarView, ICoinsFreeSpinBarView {
  private m_current = 0;
  private m_target = 0;

  private readonly m_freeSpinEvents = new IControlViewEvents();
  private readonly m_coinsFreeSpinEvents = new IControlViewEvents();

  constructor() {
    super(FreeSpinBarViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IFreeSpinBarView, this);
    this.RuntimeAdd(ICoinsFreeSpinBarView, this);
    this.RuntimeAdd(IFreeSpinBarView.Events, this.m_freeSpinEvents);
    this.RuntimeAdd(ICoinsFreeSpinBarView.Events, this.m_coinsFreeSpinEvents);

    this.InitElementsList(FreeSpinBarViewId, () => this.OnElementsListLoaded());

    super.SetVisible(false);

    return true;
  }

  Deinit() {
    this.RuntimeRemove(IFreeSpinBarView);
    this.RuntimeRemove(ICoinsFreeSpinBarView);
    this.RuntimeRemove(IFreeSpinBarView.Events);
    this.RuntimeRemove(ICoinsFreeSpinBarView.Events);
    this.m_elementsList.Deinit();
  }

  Draw(drawList: DrawList) {
    if (Unless(this.m_control.m_visible)) return;

    if (this.m_elementsList.IsLoaded()) {
      this.AdjustTextValues();
    }

    super.Draw(drawList);
  }

  SetCurrentCounter(current: number) {
    if (current === this.m_current) return;

    this.m_current = current;
  }

  SetTotalCounterTarget(target: number) {
    this.m_target = target;
  }

  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
  }

  SetFocused(focused: boolean) {
    super.SetFocused(focused);
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
  }

  private OnElementsListLoaded() {
  }

  private AdjustTextValues() {
    const currentText = this.m_elementsList.Get(TextFreeSpinCurrentId, TextElement);
    currentText.SetText(String(this.m_current));

    const targetText = this.m_elementsList.Get(TextFreeSpinTargetId, TextElement);
    targetText.SetText(String(this.m_target));
  }
}
