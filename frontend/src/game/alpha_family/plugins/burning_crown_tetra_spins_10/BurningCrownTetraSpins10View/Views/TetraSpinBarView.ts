// Egt::Game::AlphaFamily::TetraSpinBarView (BurningCrownTetraSpins10View/Views/TetraSpinBarView.h/.cpp): "TETRA GAMES
// x OF y".

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import { TextElement } from '../../../../../engine/GameVideoCtrl/ViewElements/TextElement';
import { IControlViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ITetraSpinBarView } from '../../../../libs/AlphaFamily/Views/BarsView.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';

const TetraSpinBarViewId = 'TetraSpinBarView';
const TextTetraSpinCurrentId = 'text_tetra_spin_current';
const TextTetraSpinTargetId = 'text_tetra_spin_target';

export class TetraSpinBarView extends BaseView implements ITetraSpinBarView {
  private readonly m_tetraSpinEvents = new IControlViewEvents();
  private m_current = 0;
  private m_target = 0;

  constructor() {
    super(TetraSpinBarViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ITetraSpinBarView, this);
    this.RuntimeAdd(ITetraSpinBarView.Events, this.m_tetraSpinEvents);
    this.InitElementsList(TetraSpinBarViewId);
    super.SetVisible(false);
    return true;
  }

  Deinit() {
    this.RuntimeRemove(ITetraSpinBarView);
    this.RuntimeRemove(ITetraSpinBarView.Events);
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    this.m_elementsList.TryGet(TextTetraSpinCurrentId, TextElement)?.SetText(String(this.m_current));
    this.m_elementsList.TryGet(TextTetraSpinTargetId, TextElement)?.SetText(String(this.m_target));
    super.Draw(drawList);
  }

  SetCurrentCounter(current: number) {
    this.m_current = current;
  }

  SetTotalCounterTarget(target: number) {
    this.m_target = target;
  }

  ClearCounter() {
    this.m_target = 0;
    this.m_current = 0;
  }
}
