// Egt::Game::AlphaFamily::BigWinInfoView (NordicRushInfoView/BigWinInfoView.h/.cpp): the major and grand prize
// animations on the info screen (anim_win_major_winner, anim_win_grand_winner). Once an animation has faded in, the
// view covers the screen (IsOpaqueFullScreen) until it ends.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ERoundTags } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IBigWinInfoView, IBigWinInfoViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IBigWinInfoView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const BigWinInfoViewId = 'BigWinInfoView';

const AnimWinMajorWinnerId = 'anim_win_major_winner';
const AnimWinGrandWinnerId = 'anim_win_grand_winner';

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const MajorWinnerAlphaAnimationDuration: tweeny.duration_t = FrameDuration * 21;
const MajorWinnerFullAnimationDuration: tweeny.duration_t = FrameDuration * 109;
const GrandWinnerAlphaAnimationDuration: tweeny.duration_t = FrameDuration * 21;
const GrandWinnerFullAnimationDuration: tweeny.duration_t = FrameDuration * 109;

const ElementsAllIds = [AnimWinMajorWinnerId, AnimWinGrandWinnerId];
const ElementsMajorWinnerIds = [AnimWinMajorWinnerId];
const ElementsGrandWinnerIds = [AnimWinGrandWinnerId];

enum EMode {
  None,
  CoinsEruption,
  MajorPrize,
  GrandPrize,
}

export class BigWinInfoView extends BaseView implements IBigWinInfoView {
  protected readonly m_events = new IBigWinInfoViewEvents();

  private m_mode = EMode.None;
  private m_isOpaqueFullScreen = false;

  private m_sentinel = new sentinel();
  private m_actionMajorWinner = new tweeny.tween_action();
  private m_actionGrandWinner = new tweeny.tween_action();

  constructor() {
    super(BigWinInfoViewId);
  }

  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.RuntimeAdd(IBigWinInfoView, this);
    this.RuntimeAdd(IBigWinInfoView.Events, this.m_events);

    this.InitElementsList(BigWinInfoViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    this.RuntimeRemove(IBigWinInfoView);
    this.RuntimeRemove(IBigWinInfoView.Events);

    super.Deinit();
  }

  Process() {
    super.Process();
    if (Unless(this.m_elementsList.IsLoaded())) return;
  }

  IsOpaqueFullScreen() {
    return true && this.IsVisible() && this.m_isOpaqueFullScreen &&
      ((this.m_mode === EMode.MajorPrize) || (this.m_mode === EMode.GrandPrize));
  }

  private OnElementsListLoaded() {
    this.m_elementsList.SetHidden(true, ElementsAllIds);
    this.InitAnimations();
    this.AdjustBigWinMode();
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    // major winner
    {
      const alphaMajorWinner = tweeny.delay(MajorWinnerAlphaAnimationDuration);
      alphaMajorWinner.on_begin.connect(() => {
        this.m_isOpaqueFullScreen = false;
      });
      alphaMajorWinner.on_end.connect(() => {
        this.m_isOpaqueFullScreen = true;
      });
      this.m_actionMajorWinner =
        tweeny.together([tweeny.delay(MajorWinnerFullAnimationDuration), alphaMajorWinner], this.m_sentinel);
      this.m_actionMajorWinner.on_begin.connect(() => {
        const animWinMajor = this.m_elementsList.Get(AnimWinMajorWinnerId, AnimElement);
        animWinMajor.Stop();
        animWinMajor.Rewind();
        animWinMajor.Play();

        this.m_elementsList.SetHidden(false, ElementsMajorWinnerIds);
      });
      this.m_actionMajorWinner.on_end.connect(() => {
        this.m_isOpaqueFullScreen = false;
        this.m_elementsList.SetHidden(true, ElementsAllIds);

        this.m_events.animatingDone.Post();
      });
    }
    // grand winner
    {
      const alphaGrandWinner = tweeny.delay(GrandWinnerAlphaAnimationDuration);
      alphaGrandWinner.on_begin.connect(() => {
        this.m_isOpaqueFullScreen = false;
      });
      alphaGrandWinner.on_end.connect(() => {
        this.m_isOpaqueFullScreen = true;
      });
      this.m_actionGrandWinner =
        tweeny.together([tweeny.delay(GrandWinnerFullAnimationDuration), alphaGrandWinner], this.m_sentinel);
      this.m_actionGrandWinner.on_begin.connect(() => {
        const animWinGrand = this.m_elementsList.Get(AnimWinGrandWinnerId, AnimElement);
        animWinGrand.Stop();
        animWinGrand.Rewind();
        animWinGrand.Play();

        this.m_elementsList.SetHidden(false, ElementsGrandWinnerIds);
      });
      this.m_actionGrandWinner.on_end.connect(() => {
        this.m_isOpaqueFullScreen = false;
        this.m_elementsList.SetHidden(true, ElementsAllIds);

        this.m_events.animatingDone.Post();
      });
    }
  }

  private AdjustBigWinMode() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    switch (this.m_mode) {
      case EMode.MajorPrize:
        {
          tweeny.start(this.m_actionMajorWinner, 'BigWinInfoView/MajorWinner');
        }
        break;
      case EMode.GrandPrize:
        {
          tweeny.start(this.m_actionGrandWinner, 'BigWinInfoView/GrandWinner');
        }
        break;
      case EMode.None: // [[fallthrough]]
      case EMode.CoinsEruption: // [[fallthrough]]
      default:
        this.m_elementsList.SetHidden(true, ElementsAllIds);
        break;
    }
  }

  SetEnabled(enabled: boolean) {
    this.m_control.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
  }

  SetFocused(focused: boolean) {
    this.m_control.SetFocused(focused);
  }

  SetSkin(skin: string) {
    this.m_control.SetSkin(skin);
  }

  ApplyPhase(_todo_useSpecificType: string) {
  }

  Clear() {
    this.m_mode = EMode.None;
    this.AdjustBigWinMode();
  }

  ShowAnimation(roundTag: ERoundTags) {
    switch (roundTag) {
      case ERoundTags.BigWin:
        this.m_mode = EMode.CoinsEruption;
        this.AdjustBigWinMode();
        break;
      case ERoundTags.MajorSymbolPrize:
        this.m_mode = EMode.MajorPrize;
        this.AdjustBigWinMode();
        break;
      case ERoundTags.GrandSymbolPrize:
        this.m_mode = EMode.GrandPrize;
        this.AdjustBigWinMode();
        break;
      default:
        break;
    }

    this.m_events.animating.Post();
  }
}
