// Egt::Game::AlphaFamily::Stub::StubInfoView (AlphaFamilyAutomationView/Views/StubInfoView.h): the automation's IInfoView.

import type { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IInfoView, type IInfoViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import type { EInfoViewPageType } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.data';
import { StubView } from '../Components/StubView';

export class StubInfoView extends StubView<IInfoView, IInfoViewEvents> implements IInfoView {
  constructor() {
    super(IInfoView);
  }

  ShowRoundInfo(_roundType: RoundType, _show: boolean) {}

  ShowPage(_page: EInfoViewPageType) {
    this.m_events!.pageChanged.Post();
  }

  ShowNextPage() {}

  SetStakes(_bet: number, _lines: number) {}

  SetPaytables(..._paytables: unknown[]) {}

  SetGambleLimits(_limit: number, _attempts: number) {}

  SetCertificationCode(_code: string) {}

  SetLanguage(_language: string) {}

  SetSerialNumber(_serialNumber: string) {}

  SetWinCappingLimit(_limit: number) {}

  SetJackpotMultiplier(_multiplier: number) {}

  ShowCombinations(_combinations: ReelCombinations) {}

  SetGambleCapLimit(_limit: number) {}

  HideWins() {}

  StartAnimation(animId: string) {
    this.m_events!.animationStarted.Post(animId);
  }

  StopAnimation(animId: string) {
    this.m_events!.animationStopped.Post(animId);
  }
}
