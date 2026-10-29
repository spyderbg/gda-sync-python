// Egt::Game::AlphaFamily::GambleRoundView (JokerReelsCoins10View/Views/GambleRoundView.h/.cpp): the red or black
// gamble's screen: the amount and what it may win, the history of the house's cards, the two cards that slide in, the
// blinking closed card and the house's card with the win.

import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IResources, type Point } from '@game/engine/Game/RuntimeExport/IResources';
import { assert, Unless } from '@game/engine/GameCore/Common/Defensive';
import { Copy, type int, type int64_t, type int8_t, type size_t, static_cast } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { make_sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IGambleRoundView, IGambleRoundViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import type { GambleRoundViewConfig } from './GambleRoundView.data';

const GambleRoundViewId = 'GambleRoundView';

const ImageBackgroundId = 'image_background';
const Image18PlusId = 'image_18+';
const ImageAdmId = 'image_adm';
const ImageHistoryId = 'image_history';
const ImageAmountId = 'image_amount';
const TextAmountId = 'text_amount';
const ImageToWinId = 'image_to_win';
const TextToWinId = 'text_to_win';

const AnimCardBlinkId = 'anim_card_blink';
const AnimCardsDeckId = 'anim_cards_deck';
const AnimCardSlide1Id = 'anim_card_slide1';
const AnimCardSlide2Id = 'anim_card_slide2';

const SoundPlayerLooseId = 'SOUND_GAMBLE_PLAYER_LOSE';
const SoundPlayerWinId = 'SOUND_GAMBLE_PLAYER_WIN';
const SoundCardBlinkId = 'SOUND_LOOP_GAMBLE_CARD_BLINK';

const ImageAceOfSpadesBigId = 'image_ace_of_spades_big';
const ImageAceOfHeartsBigId = 'image_ace_of_hearts_big';
const ImageAceOfClubsBigId = 'image_ace_of_clubs_big';
const ImageAceOfDiamondsBigId = 'image_ace_of_diamonds_big';

const ImageHistoryCard1Id = 'image_history_card_1';
const ImageHistoryCard2Id = 'image_history_card_2';
const ImageHistoryCard3Id = 'image_history_card_3';
const ImageHistoryCard4Id = 'image_history_card_4';
const ImageHistoryCard5Id = 'image_history_card_5';
const ImageHistoryCard6Id = 'image_history_card_6';

const ImageWinId = 'image_win';

const Layer1Ids = [
  ImageBackgroundId,
  Image18PlusId,
  ImageAdmId,
  ImageHistoryId,
  ImageAmountId,
  TextAmountId,
  ImageToWinId,
  TextToWinId,
  AnimCardBlinkId,
  AnimCardsDeckId,
  AnimCardSlide1Id,
  AnimCardSlide2Id,
  ImageAceOfSpadesBigId,
  ImageAceOfHeartsBigId,
  ImageAceOfClubsBigId,
  ImageAceOfDiamondsBigId,
];

const Layer3Ids = [
  ImageWinId,
];

const BigCardsIds = [
  ImageAceOfSpadesBigId,
  ImageAceOfHeartsBigId,
  ImageAceOfClubsBigId,
  ImageAceOfDiamondsBigId,
];

const HistoryCardIds = [
  ImageHistoryCard1Id,
  ImageHistoryCard2Id,
  ImageHistoryCard3Id,
  ImageHistoryCard4Id,
  ImageHistoryCard5Id,
  ImageHistoryCard6Id,
];

const WinCoefficient = 2.0;

enum ESubstate {
  Intro,
  SlideCards,
  Idle,
  Result,
  Outro,
}

export class GambleRoundView extends BaseView implements IGambleRoundView {
  protected readonly m_events = new IGambleRoundViewEvents();

  private m_config!: GambleRoundViewConfig;

  private m_substate = ESubstate.Intro;

  private m_bet: int64_t = 0;
  private m_isWin = false;
  private m_houseCardIndex: int = 0;
  private m_historyHasClosedCard = true;

  private m_history: int8_t[] = [];

  private m_tweenDummy: int = 0;

  private m_sentinel = make_sentinel();

  private m_actionIdle = new tweeny.tween_action();
  private m_actionResult = new tweeny.tween_action();
  private m_actionSlideCards = new tweeny.tween_action();

  private m_cardPoint1: Point = { x: 92, y: 372 };
  private m_cardPoint2: Point = { x: -44, y: 372 };

  private m_cardBlinkPlayback: IAudioPlayback | null = null;

  constructor() {
    super(GambleRoundViewId);
  }

  // IControlView
  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
  }

  SetFocused(focused: boolean) {
    super.SetFocused(focused);
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IGambleRoundView, this);
    this.RuntimeAdd(IGambleRoundView.Events, this.m_events);

    this.InitElementsList(GambleRoundViewId, () => {
      this.OnElementsListLoaded();
    });
    // when its config's file changes, its cards' slides and history are made again from it
    BrowserOnly(() => this.WatchConfig('GambleRoundViewConfig', () => this.ReloadConfig()));

    this.SetVisible(false);
    return true;
  }

  private OnElementsListLoaded() {
    this.LoadConfig();
    this.InitAnimations();

    this.OnVisibleChanged();
    this.OnSubstateChanged();
    this.OnBetChanged();
    this.OnHistoryChanged();
  }

  private LoadConfig() {
    const resources = this.RuntimeGet(IResources);
    this.m_config = resources.GetIData<GambleRoundViewConfig>('GambleRoundViewConfig');

    assert(this.m_config.visibleHistorySize <= static_cast<int>(HistoryCardIds.length));
  }

  /** Reads its config again, when its file changed, and makes its animations (the cards' slides) and its history again
   * from it, once none of the animations whose end the round waits for runs.
   * @browserOnly */
  private ReloadConfig() {
    const animations = [this.m_actionIdle, this.m_actionResult, this.m_actionSlideCards];
    if (animations.some(action => tweeny.is_running(action) || tweeny.is_paused(action))) return false;
    this.LoadConfig();
    this.InitAnimations();
    this.OnHistoryChanged();
    return true;
  }

  Deinit() {
    this.RuntimeRemove(IGambleRoundView);
    this.RuntimeRemove(IGambleRoundView.Events);

    tweeny.stop(this.m_actionIdle);
    tweeny.stop(this.m_actionResult);
    tweeny.stop(this.m_actionSlideCards);

    this.SetCardBlinkSoundEnabled(false);
    this.DeinitElementsList();

    super.Deinit();
  }

  Process() {
    if (!this.m_control.m_enabled) return;

    super.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.m_control.m_visible) return;

    const cardSlide1 = this.m_elementsList.TryGet(AnimCardSlide1Id, AnimElement);
    if (cardSlide1) {
      cardSlide1.SetPosition(this.m_cardPoint1);
    }
    const cardSlide2 = this.m_elementsList.TryGet(AnimCardSlide2Id, AnimElement);
    if (cardSlide2) {
      cardSlide2.SetPosition(this.m_cardPoint2);
    }

    super.Draw(drawList);
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
    this.OnVisibleChanged();
  }

  private OnVisibleChanged() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    if (this.m_control.m_visible === false) {
      this.SetCardBlinkSoundEnabled(false);
      this.HideAllElements();
    }
  }

  // IGambleRoundView
  Clear() {
    this.SetVisible(false);
  }

  SetHistory(history: int8_t[]) {
    this.m_history = history;
    this.OnHistoryChanged();
  }

  SetAttemptsLeft(_attemptsLeft: int) {
    // m_attemptsLeft = attemptsLeft;
  }

  SetBet(bet: int64_t) {
    if (this.m_bet === bet) return;
    this.m_bet = bet;
    this.OnBetChanged();
  }

  private OnBetChanged() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const localization = this.RuntimeGetConst(ILocalization);
    this.m_elementsList.Get(TextAmountId, TextElement).SetText(localization.FormatCurrency(this.m_bet));

    const possibleWin: int64_t = static_cast<int64_t>(Math.trunc(this.m_bet * WinCoefficient));
    this.m_elementsList.Get(TextToWinId, TextElement).SetText(localization.FormatCurrency(possibleWin));
  }

  ShowIntro(_force = false) {
    this.SetSubstate(ESubstate.Intro);
    this.m_events.introFinished.Post();
  }

  ShowSlideCards() {
    this.SetSubstate(ESubstate.SlideCards);
  }

  ShowIdle() {
    this.SetSubstate(ESubstate.Idle);
  }

  ShowResult(win: boolean, houseCard: int) {
    this.SetWin(win, houseCard);
    this.SetSubstate(ESubstate.Result);
  }

  ShowOutro(win: boolean, houseCard: int, _force = false) {
    this.SetWin(win, houseCard);
    this.SetSubstate(ESubstate.Outro);

    this.m_events.outroFinished.Post();
  }

  private SetSubstate(substate: ESubstate) {
    if (this.m_substate === substate) return;
    this.m_substate = substate;
    this.OnSubstateChanged();
  }

  private OnSubstateChanged() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    // ResetElementsList
    {
      // generally show the elements
      this.m_elementsList.SetHidden(false, Layer1Ids);
      this.m_elementsList.SetHidden(false, HistoryCardIds);
      this.m_elementsList.SetHidden(true, [AnimCardBlinkId]);

      // hide the elements which are not in the idle
      this.m_elementsList.SetHidden(true, [AnimCardSlide1Id, AnimCardSlide2Id, ImageWinId]);
      this.m_elementsList.SetHidden(true, BigCardsIds);
    }

    switch (this.m_substate) {
      case ESubstate.Intro:
        {
          this.SetCardBlinkSoundEnabled(false);
          break;
        }
      case ESubstate.SlideCards:
        {
          // prepare the animation
          this.m_elementsList.SetHidden(true, [AnimCardBlinkId, AnimCardsDeckId]);
          this.m_elementsList.SetHidden(false, [AnimCardSlide1Id, AnimCardSlide2Id]);

          tweeny.start(this.m_actionSlideCards, 'GambleRoundView:SlideCards');

          this.m_historyHasClosedCard = true;

          this.OnHistoryChanged();
          this.SetCardBlinkSoundEnabled(false);
          break;
        }
      case ESubstate.Idle:
        {
          tweeny.start(this.m_actionIdle, 'GambleRoundView:Idle');

          const commonGambleAnimCardBlink = this.m_elementsList.Get(AnimCardBlinkId, AnimElement);
          commonGambleAnimCardBlink.Rewind();
          commonGambleAnimCardBlink.SetHidden(false);

          const commonGambleAnimCardsDeck = this.m_elementsList.Get(AnimCardsDeckId, AnimElement);
          commonGambleAnimCardsDeck.Rewind();
          commonGambleAnimCardsDeck.SetHidden(false);

          this.m_elementsList.SetHidden(true, [AnimCardSlide1Id, AnimCardSlide2Id]);

          this.m_historyHasClosedCard = true;

          this.OnHistoryChanged();
          this.SetCardBlinkSoundEnabled(true);
          break;
        }
      case ESubstate.Result:
        {
          this.m_historyHasClosedCard = false;
          this.OnHistoryChanged();
          this.OnWinChanged();
          this.SetCardBlinkSoundEnabled(false);

          tweeny.start(this.m_actionResult, 'GambleRoundView:Result');

          this.RuntimeGet(IAudioApi).Play(this.m_isWin ? SoundPlayerWinId : SoundPlayerLooseId);
          break;
        }
      case ESubstate.Outro:
        {
          this.m_historyHasClosedCard = false;
          this.OnHistoryChanged();
          this.OnWinChanged();
          this.SetCardBlinkSoundEnabled(false);
          break;
        }
      default: break;
    }
  }

  private OnHistoryChanged() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    let posIdx: size_t = 0;

    this.m_elementsList.SetHidden(true, HistoryCardIds);

    if (this.m_historyHasClosedCard) {
      this.m_elementsList.Get(HistoryCardIds[posIdx], ImageElement).SetSelectedImage(4).SetHidden(false); // 4 colors + 1
      posIdx++;
    }
    const visibleHistoryCardsCount: size_t = Math.min(HistoryCardIds.length, this.m_config.visibleHistorySize);
    for (let it = 0; posIdx < visibleHistoryCardsCount && it !== this.m_history.length; posIdx++, ++it) {
      this.m_elementsList.Get(HistoryCardIds[posIdx], ImageElement).SetSelectedImage(this.m_history[it]).SetHidden(false);
    }
  }

  private SetWin(win: boolean, houseCard: int) {
    if ((this.m_isWin === win) && (this.m_houseCardIndex === houseCard)) return;
    this.m_isWin = win;
    this.m_houseCardIndex = houseCard;
  }

  private OnWinChanged() {
    this.m_elementsList.SetHidden(true, [AnimCardBlinkId, ImageAmountId, TextAmountId, ImageToWinId, TextToWinId]);
    this.m_elementsList.SetHidden(false, [BigCardsIds[this.m_houseCardIndex]]);

    this.m_elementsList.Get(ImageWinId, ImageElement).SetHidden(!this.m_isWin);
  }

  ////////////////////////////////////////////////////////////////////////////////

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    this.m_actionIdle = tweeny.tween_to(tweeny.ref(this, 'm_tweenDummy'), 1, 1000, this.m_sentinel);
    this.m_actionIdle.on_end.connect(() => {
      this.m_events.idleFinished.Post();
    });

    this.m_actionResult = tweeny.tween_to(tweeny.ref(this, 'm_tweenDummy'), 1, 1500, this.m_sentinel);
    this.m_actionResult.on_end.connect(() => {
      this.m_events.showResultFinished.Post();
    });

    this.m_actionSlideCards = tweeny.together(
      tweeny.tween_from_to(
        tweeny.ref(this, 'm_cardPoint1'),
        this.m_config.startingCardPoint1,
        this.m_config.targetCardPoint1,
        this.m_config.cardSlide1DurationMS,
        this.m_sentinel,
        tweeny.ease.linear),
      tweeny.tween_from_to(
        tweeny.ref(this, 'm_cardPoint2'),
        this.m_config.startingCardPoint2,
        this.m_config.targetCardPoint2,
        this.m_config.cardSlide2DurationMS,
        this.m_sentinel,
        tweeny.ease.linear));

    this.m_actionSlideCards.on_begin.connect(() => {
      const cardSlide1 = this.m_elementsList.TryGet(AnimCardSlide1Id, AnimElement);
      if (cardSlide1) {
        cardSlide1.Play();
        cardSlide1.SetHidden(false);
      }
      const cardSlide2 = this.m_elementsList.TryGet(AnimCardSlide2Id, AnimElement);
      if (cardSlide2) {
        cardSlide2.Play();
        cardSlide2.SetHidden(false);
      }
    });

    this.m_actionSlideCards.on_end.connect(() => {
      this.m_events.slideCardsFinished.Post();
    });
  }

  private SetCardBlinkSoundEnabled(enabled: boolean) {
    if (enabled) {
      if (!this.m_cardBlinkPlayback || !this.m_cardBlinkPlayback.IsPlaying()) {
        this.m_cardBlinkPlayback = this.RuntimeGet(IAudioApi).Play(SoundCardBlinkId);
      }
    } else {
      if (this.m_cardBlinkPlayback) {
        this.m_cardBlinkPlayback.Stop();
        this.m_cardBlinkPlayback = null;
      }
    }
  }

  private HideAllElements() {
    for (const element of this.m_elementsList.GetElements()) {
      element.SetHidden(true);
    }

    const cardSlide1 = this.m_elementsList.TryGet(AnimCardSlide1Id, AnimElement);
    if (cardSlide1) {
      cardSlide1.Rewind();
      cardSlide1.Stop();

      this.m_cardPoint1 = Copy(this.m_config.startingCardPoint1);
    }
    const cardSlide2 = this.m_elementsList.TryGet(AnimCardSlide2Id, AnimElement);
    if (cardSlide2) {
      cardSlide2.Rewind();
      cardSlide2.Stop();

      this.m_cardPoint2 = Copy(this.m_config.startingCardPoint2);
    }
  }
}

EgtALogCategoryClass(GambleRoundView, 'GambleRoundView');
