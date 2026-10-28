// Egt::Game::AlphaFamily::HoldAndSpinRoundInfoView (NordicRushInfoView/HoldAndSpinRoundInfoView.h/.cpp): the hold and
// spin round on the info screen: its intro (the four prizes move from the help page's places to the collected ones), the
// shields collected while it plays, the comets that fly up from the coins on the reels into the shield, adding their free
// spins, and its outro (the tube lights up and a comet takes the free spins won down). While it plays it covers the
// screen (IsOpaqueFullScreen), but for its intro's and outro's fades.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { IResources, type Point } from '@game/engine/Game/RuntimeExport/IResources';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IVideoManager } from '@game/engine/GameVideoCtrl/RuntimeExport/IVideoManager';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import {
  FadeFromToUint8, FadeIn, FadeOut, MoveTo, PlaceholderFromTo, ScaleFromTo, ZoomIn, ZoomOut,
} from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import type { SymbolViewInfo, SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import {
  ECurrencyPrize, type FigureId, IHoldAndSpinRoundInfoView, IHoldAndSpinRoundInfoViewEvents, type PaytableCoefficients,
} from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import type { WinFiguresViewConfig } from '../NordicRushView/Views/WinFiguresView.data';

const HoldAndSpinRoundInfoViewId = 'HoldAndSpinRoundInfoView';

// intro
const AnimIntroBackgroundId = 'anim_intro_background';
// main loop
const AnimMainBackgroundId = 'anim_main_background';
const AnimShieldId = 'anim_shield';
// outro
const AnimTubeIntroBackgroundId = 'anim_tube_intro_background';

const ImageAllPrizesInEuroId = 'image_infotext_all_prizes_in_euro';
const ImageAllPrizesInCoinsId = 'image_infotext_all_prizes_in_coins';
const ImageMalfunctionVoidsId = 'image_infotext_malfunction';

const ImageGrandPanelId = 'image_grand_panel';
const DummyHelpGrandPanelId = 'image_help_grand_panel';
const DummyCollectedGrandPanelId = 'image_collected_grand_panel';
const ImageGrandPrizeId = 'image_grand_prize';
const DummyHelpGrandPrizeId = 'image_help_grand_prize';
const DummyCollectedGrandPrizeId = 'image_collected_grand_prize';
const TextGrandValueId = 'text_grand_value';
const DummyHelpGrandValueId = 'text_help_grand_value';
const DummyCollectedGrandValueId = 'text_collected_grand_value';

const ImageMajorPanelId = 'image_major_panel';
const DummyHelpMajorPanelId = 'image_help_major_panel';
const DummyCollectedMajorPanelId = 'image_collected_major_panel';
const ImageMajorPrizeId = 'image_major_prize';
const DummyHelpMajorPrizeId = 'image_help_major_prize';
const DummyCollectedMajorPrizeId = 'image_collected_major_prize';
const TextMajorValueId = 'text_major_value';
const DummyHelpMajorValueId = 'text_help_major_value';
const DummyCollectedMajorValueId = 'text_collected_major_value';

const ImageMinorPanelId = 'image_minor_panel';
const DummyHelpMinorPanelId = 'image_help_minor_panel';
const DummyCollectedMinorPanelId = 'image_collected_minor_panel';
const ImageMinorPrizeId = 'image_minor_prize';
const DummyHelpMinorPrizeId = 'image_help_minor_prize';
const DummyCollectedMinorPrizeId = 'image_collected_minor_prize';
const TextMinorValueId = 'text_minor_value';
const DummyHelpMinorValueId = 'text_help_minor_value';
const DummyCollectedMinorValueId = 'text_collected_minor_value';

const ImageMiniPanelId = 'image_mini_panel';
const DummyHelpMiniPanelId = 'image_help_mini_panel';
const DummyCollectedMiniPanelId = 'image_collected_mini_panel';
const ImageMiniPrizeId = 'image_mini_prize';
const DummyHelpMiniPrizeId = 'image_help_mini_prize';
const DummyCollectedMiniPrizeId = 'image_collected_mini_prize';
const TextMiniValueId = 'text_mini_value';
const DummyHelpMiniValueId = 'text_help_mini_value';
const DummyCollectedMiniValueId = 'text_collected_mini_value';

const TextCollectedShieldsValueId = 'text_collected_shields';

const AnimTubeLightId = 'anim_tube_light';
const TextFreeSpinsWonValueId = 'text_free_spins_won';
const ImageFreeSpinsId = 'image_free_spins';
const AnimCometInitialExplosionId = 'anim_comet_inital_explosion';
const AnimCometFlightId = 'anim_comet_flight';
const AnimCometEndExplosionId = 'anim_comet_end_explosion';
const DummyCometFlightStartId = 'anim_comet_flight_start';
const DummyCometFlightEndId = 'anim_comet_flight_end';
const DummyCometTargetPosId = 'dummy_comet_target_pos';

const ElementsIntroIds = [
  AnimIntroBackgroundId,
  ImageMalfunctionVoidsId,
  ImageGrandPanelId,
  ImageGrandPrizeId,
  TextGrandValueId,
  ImageMajorPanelId,
  ImageMajorPrizeId,
  TextMajorValueId,
  ImageMinorPanelId,
  ImageMinorPrizeId,
  TextMinorValueId,
  ImageMiniPanelId,
  ImageMiniPrizeId,
  TextMiniValueId,
  TextCollectedShieldsValueId];
const ElementsMainIds = [
  AnimMainBackgroundId,
  ImageMalfunctionVoidsId,
  ImageGrandPanelId,
  ImageGrandPrizeId,
  TextGrandValueId,
  ImageMajorPanelId,
  ImageMajorPrizeId,
  TextMajorValueId,
  ImageMinorPanelId,
  ImageMinorPrizeId,
  TextMinorValueId,
  ImageMiniPanelId,
  ImageMiniPrizeId,
  TextMiniValueId,
  TextCollectedShieldsValueId];
const ElementsOutroIds = [
  AnimTubeIntroBackgroundId,
  ImageMalfunctionVoidsId,
  ImageGrandPanelId,
  ImageGrandPrizeId,
  TextGrandValueId,
  ImageMajorPanelId,
  ImageMajorPrizeId,
  TextMajorValueId,
  ImageMinorPanelId,
  ImageMinorPrizeId,
  TextMinorValueId,
  ImageMiniPanelId,
  ImageMiniPrizeId,
  TextMiniValueId,
  TextCollectedShieldsValueId];
const ElementsAllIds = [
  AnimIntroBackgroundId,
  AnimMainBackgroundId,
  AnimTubeIntroBackgroundId,
  ImageAllPrizesInEuroId,
  ImageAllPrizesInCoinsId,
  ImageMalfunctionVoidsId,
  AnimShieldId,
  ImageGrandPanelId,
  ImageGrandPrizeId,
  TextGrandValueId,
  ImageMajorPanelId,
  ImageMajorPrizeId,
  TextMajorValueId,
  ImageMinorPanelId,
  ImageMinorPrizeId,
  TextMinorValueId,
  ImageMiniPanelId,
  ImageMiniPrizeId,
  TextMiniValueId,
  TextCollectedShieldsValueId,
  AnimTubeLightId,
  TextFreeSpinsWonValueId,
  ImageFreeSpinsId,
  AnimCometInitialExplosionId,
  AnimCometFlightId,
  AnimCometEndExplosionId];

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const IntroAlphaDuration: tweeny.duration_t = 17 * FrameDuration;
const IntroDuration: tweeny.duration_t = 116 * FrameDuration;
const IntroMovingPrizesDuration: tweeny.duration_t = 22 * FrameDuration;
const IntroCollectedFadeInDuration: tweeny.duration_t = (42 - 23) * FrameDuration;
const IntroCollectedFadeInDelay: tweeny.duration_t = 23 * FrameDuration;
const IntroCollectedZoomInOutDuration: tweeny.duration_t = (74 - 43) * FrameDuration;
const IntroCollectedZoomInOutDelay: tweeny.duration_t = 43 * FrameDuration;

// animations duration
const OutroDuration: tweeny.duration_t = 3000;
const OutroShieldToTubeAnimationDuration: tweeny.duration_t = 21 * FrameDuration;
const OutroCometFlightAnimationDuration: tweeny.duration_t = 36 * FrameDuration;
const OutroMovingPrizesDuration: tweeny.duration_t = 0; // IntroMovingPrizesDuration;
// tweeny movements duration
const OutroCometFlightDuration: tweeny.duration_t = 17 * FrameDuration;
const OutroCollectedZoomOutDuration: tweeny.duration_t = 11 * FrameDuration;
const OutroCollectedFadeOutDuration: tweeny.duration_t = 11 * FrameDuration;
const OutroFreeSpinsZoomInDuration: tweeny.duration_t = 5 * FrameDuration;
const OutroFreeSpinsFadeInDuration: tweeny.duration_t = 5 * FrameDuration;
// postponed/delayed start
const OutroAnimCometInitialExplosionDelay: tweeny.duration_t = OutroShieldToTubeAnimationDuration;
const OutroFreeSpinsDelay: tweeny.duration_t = 11 * FrameDuration;
const OutroAnimTubeLightDelay: tweeny.duration_t = OutroAnimCometInitialExplosionDelay + 5 * FrameDuration;
const OutroCometFlightDelay: tweeny.duration_t = OutroAnimCometInitialExplosionDelay + 5 * FrameDuration;
const OutroMovingPrizesDelay: tweeny.duration_t = OutroDuration - OutroMovingPrizesDuration;
const OutroAlphaDelay: tweeny.duration_t = OutroMovingPrizesDelay;

const CollectedScaleDefault: Point = { x: 1.0, y: 1.0 };
const CollectedScaleZoomed: Point = { x: 1.1, y: 1.1 };

const AlphaVisible = 255;
const AlphaTransparent = 0;

enum EMode {
  None,
  Intro,
  Main,
  Outro,
  Comets,
}

type CometAction = tweeny.tween_action;

export class HoldAndSpinRoundInfoView extends BaseView implements IHoldAndSpinRoundInfoView {
  protected readonly m_events = new IHoldAndSpinRoundInfoViewEvents();

  private m_sentinel = new sentinel();

  private m_actionIntro = new tweeny.tween_action();
  private m_actionMain = new tweeny.tween_action();
  private m_actionOutro = new tweeny.tween_action();
  private m_cometActions: CometAction[] = [];
  private m_cometEffectIds: string[] = [];
  private m_nextCometToStart = 0;
  private m_finishedComets = 0;
  private m_fastForwardComets = false;

  private readonly m_data = {
    totalBet: 1,
    paytables: new Map<ECurrencyPrize, PaytableCoefficients>(),
    currencyType: ECurrencyPrize.Undefined,
  };

  private m_mode = EMode.None;
  private m_oldMode = EMode.None;
  private m_isOpaqueFullScreen = false;

  private m_cometInfos: SymbolViewInfos = [];
  private m_shieldsCollected = 0;
  private m_freeSpinsWon = 0;
  private m_endCounter = 0;

  constructor() {
    super(HoldAndSpinRoundInfoViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;
    this.RuntimeAdd(IHoldAndSpinRoundInfoView, this);
    this.RuntimeAdd(IHoldAndSpinRoundInfoView.Events, this.m_events);

    this.Clear();
    this.InitElementsList(HoldAndSpinRoundInfoViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionIntro);
    tweeny.stop(this.m_actionMain);
    tweeny.stop(this.m_actionOutro);
    this.StopComets();

    this.DeinitElementsList();

    this.RuntimeRemove(IHoldAndSpinRoundInfoView);
    this.RuntimeRemove(IHoldAndSpinRoundInfoView.Events);

    super.Deinit();
  }

  HandleFileChanged(path: string) {
    super.HandleFileChanged(path);

    this.AdjustCollected();
    this.AdjustFreeSpins();
    this.AdjustPrizes();
    this.AdjustMode();
    this.SetElementsToIntroPosition();
  }

  IsOpaqueFullScreen() {
    return true && this.IsVisible() &&
      ((this.m_mode === EMode.Main) || (this.m_mode === EMode.Comets) || (this.m_mode === EMode.Intro && this.m_isOpaqueFullScreen) ||
        (this.m_mode === EMode.Outro && this.m_isOpaqueFullScreen));
  }

  // IControlView
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

  // IHoldAndSpinRoundInfoView
  ShowIntro() {
    if (this.m_mode === EMode.Intro) return;
    this.m_oldMode = this.m_mode;
    this.m_mode = EMode.Intro;
    this.AdjustMode();
  }

  ShowMain() {
    if (this.m_mode === EMode.Main) return;
    this.m_oldMode = this.m_mode;
    this.m_mode = EMode.Main;
    this.AdjustMode();
  }

  ShowOutro() {
    if (this.m_mode === EMode.Outro) return;
    this.m_oldMode = this.m_mode;
    this.m_mode = EMode.Outro;
    this.AdjustMode();
  }

  ShowComets(infos: SymbolViewInfos) {
    this.m_oldMode = this.m_mode;
    this.m_mode = EMode.Comets;
    this.m_cometInfos = [...infos];
    this.AdjustMode();
  }

  RequestFastForwardComets() {
    if (this.m_mode !== EMode.Comets) return;

    this.m_fastForwardComets = true;
    this.StartAllPendingComets();
  }

  Clear() {
    this.m_mode = EMode.None;
    this.m_shieldsCollected = 0;
    this.m_freeSpinsWon = 0;
    this.m_endCounter = 0;
    this.m_isOpaqueFullScreen = false;

    if (Unless(this.m_elementsList.IsLoaded())) return;

    tweeny.stop(this.m_actionIntro);
    tweeny.stop(this.m_actionMain);
    tweeny.stop(this.m_actionOutro);
    this.StopComets();

    this.HideMembers();
    this.AdjustCollected();
    this.AdjustFreeSpins();
    this.SetElementsToIntroPosition();
    // m_elementsList.SetHidden(false, {ElementsHelpIds.begin(), ElementsHelpIds.end()});
  }

  SetCollectedShields(count: number) {
    this.m_shieldsCollected = count;
    this.AdjustCollected();
  }

  SetStakes(totalBet: number, _lines: number) {
    this.m_data.totalBet = totalBet;
    this.AdjustPrizes();
  }

  SetPaytables(
    paytables: Map<ECurrencyPrize, PaytableCoefficients>,
    _scatterFigures: Set<FigureId>,
    _figureNames: Map<FigureId, string>,
    _gameMultipliers: number[]) {
    this.m_data.paytables = paytables;

    this.AdjustPrizes();

    const fittestCurrencyToShow = this.GetFittestCurrencyType();
    this.SetCurrencyType(fittestCurrencyToShow);
  }

  private OnElementsListLoaded() {
    // adjust values
    this.HideMembers();
    this.InitAnimations();
    this.AdjustCollected();
    this.AdjustFreeSpins();
    this.AdjustPrizes();
    this.AdjustMode();
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();
    // grand
    const imageGrandPanel = this.m_elementsList.Find(ImageGrandPanelId, ImageElement);
    const imageGrandPanelHelp = this.m_elementsList.Find(DummyHelpGrandPanelId, ImageElement);
    const imageGrandPanelCollected = this.m_elementsList.Find(DummyCollectedGrandPanelId, ImageElement);

    const imageGrandPrize = this.m_elementsList.Find(ImageGrandPrizeId, ImageElement);
    const imageGrandPrizeHelp = this.m_elementsList.Find(DummyHelpGrandPrizeId, ImageElement);
    const imageGrandPrizeCollected = this.m_elementsList.Find(DummyCollectedGrandPrizeId, ImageElement);

    const textGrandValue = this.m_elementsList.Find(TextGrandValueId, TextElement);
    const textGrandValueHelp = this.m_elementsList.Find(DummyHelpGrandValueId, TextElement);
    const textGrandValueCollected = this.m_elementsList.Find(DummyCollectedGrandValueId, TextElement);

    // major
    const imageMajorPanel = this.m_elementsList.Find(ImageMajorPanelId, ImageElement);
    const imageMajorPanelHelp = this.m_elementsList.Find(DummyHelpMajorPanelId, ImageElement);
    const imageMajorPanelCollected = this.m_elementsList.Find(DummyCollectedMajorPanelId, ImageElement);

    const imageMajorPrize = this.m_elementsList.Find(ImageMajorPrizeId, ImageElement);
    const imageMajorPrizeHelp = this.m_elementsList.Find(DummyHelpMajorPrizeId, ImageElement);
    const imageMajorPrizeCollected = this.m_elementsList.Find(DummyCollectedMajorPrizeId, ImageElement);

    const textMajorValue = this.m_elementsList.Find(TextMajorValueId, TextElement);
    const textMajorValueHelp = this.m_elementsList.Find(DummyHelpMajorValueId, TextElement);
    const textMajorValueCollected = this.m_elementsList.Find(DummyCollectedMajorValueId, TextElement);

    // minor
    const imageMinorPanel = this.m_elementsList.Find(ImageMinorPanelId, ImageElement);
    const imageMinorPanelHelp = this.m_elementsList.Find(DummyHelpMinorPanelId, ImageElement);
    const imageMinorPanelCollected = this.m_elementsList.Find(DummyCollectedMinorPanelId, ImageElement);

    const imageMinorPrize = this.m_elementsList.Find(ImageMinorPrizeId, ImageElement);
    const imageMinorPrizeHelp = this.m_elementsList.Find(DummyHelpMinorPrizeId, ImageElement);
    const imageMinorPrizeCollected = this.m_elementsList.Find(DummyCollectedMinorPrizeId, ImageElement);

    const textMinorValue = this.m_elementsList.Find(TextMinorValueId, TextElement);
    const textMinorValueHelp = this.m_elementsList.Find(DummyHelpMinorValueId, TextElement);
    const textMinorValueCollected = this.m_elementsList.Find(DummyCollectedMinorValueId, TextElement);

    // mini
    const imageMiniPanel = this.m_elementsList.Find(ImageMiniPanelId, ImageElement);
    const imageMiniPanelHelp = this.m_elementsList.Find(DummyHelpMiniPanelId, ImageElement);
    const imageMiniPanelCollected = this.m_elementsList.Find(DummyCollectedMiniPanelId, ImageElement);

    const imageMiniPrize = this.m_elementsList.Find(ImageMiniPrizeId, ImageElement);
    const imageMiniPrizeHelp = this.m_elementsList.Find(DummyHelpMiniPrizeId, ImageElement);
    const imageMiniPrizeCollected = this.m_elementsList.Find(DummyCollectedMiniPrizeId, ImageElement);

    const textMiniValue = this.m_elementsList.Find(TextMiniValueId, TextElement);
    const textMiniValueHelp = this.m_elementsList.Find(DummyHelpMiniValueId, TextElement);
    const textMiniValueCollected = this.m_elementsList.Find(DummyCollectedMiniValueId, TextElement);

    // collected
    const textCollectedValue = this.m_elementsList.Find(TextCollectedShieldsValueId, TextElement);
    // free spins
    const textFreeSpinsValue = this.m_elementsList.Find(TextFreeSpinsWonValueId, TextElement);
    const imageFreeSpins = this.m_elementsList.Find(ImageFreeSpinsId, ImageElement);
    // intro
    const introAlpha = tweeny.delay(IntroAlphaDuration, this.m_sentinel);
    introAlpha.on_begin.connect(() => {
      this.m_isOpaqueFullScreen = false;
    });
    introAlpha.on_end.connect(() => {
      this.m_isOpaqueFullScreen = true;
    });
    this.m_actionIntro = tweeny.together(
      [tweeny.delay(IntroDuration, this.m_sentinel),
        introAlpha,
        PlaceholderFromTo(
          imageGrandPanel, imageGrandPanelHelp, imageGrandPanelCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          imageGrandPrize, imageGrandPrizeHelp, imageGrandPrizeCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          textGrandValue, textGrandValueHelp, textGrandValueCollected, IntroMovingPrizesDuration),

        PlaceholderFromTo(
          imageMajorPanel, imageMajorPanelHelp, imageMajorPanelCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          imageMajorPrize, imageMajorPrizeHelp, imageMajorPrizeCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          textMajorValue, textMajorValueHelp, textMajorValueCollected, IntroMovingPrizesDuration),

        PlaceholderFromTo(
          imageMinorPanel, imageMinorPanelHelp, imageMinorPanelCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          imageMinorPrize, imageMinorPrizeHelp, imageMinorPrizeCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          textMinorValue, textMinorValueHelp, textMinorValueCollected, IntroMovingPrizesDuration),

        PlaceholderFromTo(
          imageMiniPanel, imageMiniPanelHelp, imageMiniPanelCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(
          imageMiniPrize, imageMiniPrizeHelp, imageMiniPrizeCollected, IntroMovingPrizesDuration),
        PlaceholderFromTo(textMiniValue, textMiniValueHelp, textMiniValueCollected, IntroMovingPrizesDuration),

        tweeny.sequence(
          [tweeny.delay(IntroCollectedFadeInDelay),
            FadeFromToUint8(textCollectedValue, AlphaTransparent, AlphaVisible, IntroCollectedFadeInDuration)],
          this.m_sentinel),
        tweeny.sequence(
          [tweeny.delay(IntroCollectedZoomInOutDelay),
            ScaleFromTo( // zoom in
              textCollectedValue,
              CollectedScaleDefault,
              CollectedScaleZoomed,
              IntroCollectedZoomInOutDuration / 2),
            ScaleFromTo( // zoom out
              textCollectedValue,
              CollectedScaleZoomed,
              CollectedScaleDefault,
              IntroCollectedZoomInOutDuration / 2)],
          this.m_sentinel)],
      this.m_sentinel);
    this.m_actionIntro.on_begin.connect(() => {
      this.HideMembers();
      this.SetElementsToIntroPosition();
      const animBackground = this.m_elementsList.Get(AnimIntroBackgroundId, AnimElement);
      animBackground.Stop();
      animBackground.Rewind();
      animBackground.Play();

      this.m_elementsList.SetHidden(false, ElementsIntroIds);
      this.m_elementsList.Get(TextCollectedShieldsValueId, TextElement).SetAlpha(AlphaTransparent);
      //
      const isPrizeInCoins: boolean = this.m_data.currencyType === ECurrencyPrize.CoinsSpinEnergy;
      this.m_elementsList.Get(ImageAllPrizesInCoinsId, ImageElement).SetHidden(!isPrizeInCoins);
      this.m_elementsList.Get(ImageAllPrizesInEuroId, ImageElement).SetHidden(isPrizeInCoins);
    });

    this.m_actionMain = tweeny.delay(0, this.m_sentinel);
    this.m_actionMain.on_begin.connect(() => {
      this.HideMembers();
      this.SetElementsToMainPosition();
      const animBackground = this.m_elementsList.Get(AnimMainBackgroundId, AnimElement);
      animBackground.Stop();
      animBackground.Rewind();
      animBackground.Play();

      this.m_elementsList.SetHidden(false, ElementsMainIds);
      this.m_elementsList.Get(TextCollectedShieldsValueId, TextElement).SetAlpha(AlphaVisible);
      //
      const isPrizeInCoins: boolean = this.m_data.currencyType === ECurrencyPrize.CoinsSpinEnergy;
      this.m_elementsList.Get(ImageAllPrizesInCoinsId, ImageElement).SetHidden(!isPrizeInCoins);
      this.m_elementsList.Get(ImageAllPrizesInEuroId, ImageElement).SetHidden(isPrizeInCoins);
    });

    // outro animation
    {
      const actionFreeSpinValue = tweeny.together([
        FadeIn(textFreeSpinsValue, OutroFreeSpinsFadeInDuration),
        ZoomIn(textFreeSpinsValue, OutroFreeSpinsZoomInDuration),
        FadeIn(imageFreeSpins, OutroFreeSpinsFadeInDuration),
        ZoomIn(imageFreeSpins, OutroFreeSpinsZoomInDuration),
      ]);
      actionFreeSpinValue.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, [TextFreeSpinsWonValueId, ImageFreeSpinsId]);
      });

      const actionCometInitialExplosion = tweeny.delay(OutroShieldToTubeAnimationDuration);
      actionCometInitialExplosion.on_begin.connect(() => {
        const animExplosion = this.m_elementsList.Get(AnimCometInitialExplosionId, AnimElement);
        animExplosion.Stop();
        animExplosion.Rewind();
        animExplosion.Play();
        animExplosion.SetHidden(false);
      });
      actionCometInitialExplosion.on_end.connect(() => {
        const animExplosion = this.m_elementsList.Get(AnimCometInitialExplosionId, AnimElement);
        animExplosion.SetHidden(true);
      });

      const actionLightTube = tweeny.delay(OutroShieldToTubeAnimationDuration);
      actionLightTube.on_begin.connect(() => {
        const animTubeLight = this.m_elementsList.Get(AnimTubeLightId, AnimElement);
        animTubeLight.Stop();
        animTubeLight.Rewind();
        animTubeLight.Play();
        animTubeLight.SetHidden(false);
      });
      actionLightTube.on_end.connect(() => {
        const animTubeLight = this.m_elementsList.Get(AnimTubeLightId, AnimElement);
        animTubeLight.SetHidden(true);
      });

      const actionOutroAlpha = tweeny.delay(OutroAlphaDelay, this.m_sentinel);
      actionOutroAlpha.on_begin.connect(() => {
        this.m_isOpaqueFullScreen = true;
      });
      actionOutroAlpha.on_end.connect(() => {
        this.m_isOpaqueFullScreen = false;
      });

      const animCometFlight = this.m_elementsList.Find(AnimCometFlightId, AnimElement);
      const animCometFlightStart = this.m_elementsList.Find(DummyCometFlightStartId, AnimElement);
      const animCometFlightEnd = this.m_elementsList.Find(DummyCometFlightEndId, AnimElement);
      const actionCometFlight = tweeny.together(
        [tweeny.delay(OutroCometFlightAnimationDuration),
          PlaceholderFromTo(
            animCometFlight, animCometFlightStart, animCometFlightEnd, OutroCometFlightDuration)],
        this.m_sentinel);
      actionCometFlight.on_begin.connect(() => {
        const animCometFlight = this.m_elementsList.Get(AnimCometFlightId, AnimElement);
        animCometFlight.Stop();
        animCometFlight.Rewind();
        animCometFlight.Play();
        animCometFlight.SetHidden(false);

        this.m_events.outroFinished.Post();
      });
      actionCometFlight.on_end.connect(() => {
        const animCometFlight = this.m_elementsList.Get(AnimCometFlightId, AnimElement);
        animCometFlight.SetHidden(true);
      });

      this.m_actionOutro = tweeny.together(
        [
          tweeny.delay(OutroDuration, this.m_sentinel), // the full time of the outro animation
          actionOutroAlpha,
          FadeOut(textCollectedValue, OutroCollectedFadeOutDuration),
          ZoomOut(textCollectedValue, OutroCollectedZoomOutDuration),
          tweeny.sequence([tweeny.delay(OutroFreeSpinsDelay), actionFreeSpinValue]),
          tweeny.sequence([tweeny.delay(OutroAnimCometInitialExplosionDelay), actionCometInitialExplosion]),
          tweeny.sequence([tweeny.delay(OutroAnimTubeLightDelay), actionLightTube]),
          tweeny.sequence([tweeny.delay(OutroCometFlightDelay), actionCometFlight]),
        ],
        this.m_sentinel);
      this.m_actionOutro.on_begin.connect(() => {
        this.HideMembers();
        this.SetElementsToMainPosition();
        const animTubeIntro = this.m_elementsList.Get(AnimTubeIntroBackgroundId, AnimElement);
        animTubeIntro.Stop();
        animTubeIntro.Rewind();
        animTubeIntro.Play();

        this.m_elementsList.SetHidden(false, ElementsOutroIds);
        this.m_elementsList.SetAlpha(AlphaVisible, ElementsOutroIds);
        //
        const isPrizeInCoins: boolean = this.m_data.currencyType === ECurrencyPrize.CoinsSpinEnergy;
        this.m_elementsList.Get(ImageAllPrizesInCoinsId, ImageElement).SetHidden(!isPrizeInCoins);
        this.m_elementsList.Get(ImageAllPrizesInEuroId, ImageElement).SetHidden(isPrizeInCoins);
      });
    }
    // finish events
    this.m_actionIntro.on_end.connect(() => {
      this.m_events.introFinished.Post();
      this.m_isOpaqueFullScreen = false;
    });
    this.m_actionMain.on_end.connect(() => {
      this.m_events.mainFinished.Post();
      this.m_isOpaqueFullScreen = false;
    });
    this.m_actionOutro.on_end.connect(() => {
      this.m_isOpaqueFullScreen = false;
      this.Clear();
    });
  }

  private CreateComets() {
    this.StopComets();

    const config = this.RuntimeGet(IResources).GetIData<WinFiguresViewConfig>('WinFiguresViewConfig');

    const subScreens = config.subScreensConfig;
    const winFigures = config.winFiguresConfig.winFigures;

    const shieldAnimDuration: tweeny.duration_t = Math.trunc(this.m_elementsList.Get(AnimShieldId, AnimElement).GetDuration() + 0.5);
    const endExplAnimDuration: tweeny.duration_t =
      Math.trunc(this.m_elementsList.Get(AnimCometEndExplosionId, AnimElement).GetDuration() + 0.5);
    const target = this.m_elementsList.Get(DummyCometTargetPosId, BaseElement).GetPosition();
    const pivot: Point = { x: 200.0, y: 500.0 };
    const resolution = this.RuntimeGetConst(IVideoManager).GetMainResolution();
    const oy = resolution.h;
    const orderedCometInfos = [...this.m_cometInfos];
    orderedCometInfos.sort((lhs: SymbolViewInfo, rhs: SymbolViewInfo) => {
      if (lhs.coord.reelId !== rhs.coord.reelId) {
        return lhs.coord.reelId - rhs.coord.reelId;
      }
      if (lhs.coord.rowId !== rhs.coord.rowId) {
        return lhs.coord.rowId - rhs.coord.rowId;
      }
      return lhs.symbolId - rhs.symbolId;
    });

    for (const viewInfo of orderedCometInfos) {
      const it = winFigures.find(figureInfo => {
        return figureInfo.id === viewInfo.symbolId;
      });

      if (it === undefined) continue;
      if ((it.effectId ?? '') === '') continue;
      if (AssertUnless(IsValidIndex(subScreens.subScreens, 0))) continue;

      const subScreen = subScreens.subScreens[0];
      const x = subScreen.reelAreaX + subScreen.reelStepX * viewInfo.coord.reelId +
        subScreen.reelStepX / 2;
      const y = subScreen.reelAreaY + subScreen.reelStepY * viewInfo.coord.rowId +
        subScreen.reelStepY / 2 + oy;
      const pos: Point = { x, y };
      const deg = Math.atan2(x - target.x, target.y - y) * 180 / Math.PI;

      const effect = this.m_elementsList.CreatePtr(AnimElement, it.effectId!);
      effect.SetPivot({ x: pivot.x, y: pivot.y });
      effect.SetPosition({ x: pos.x - pivot.x, y: pos.y - pivot.y });
      effect.SetRotation(deg);
      effect.SetHidden(true);

      const effectId = effect.GetId();
      const effectValue = it.effectValue ?? 0;
      this.m_cometEffectIds.push(effectId);

      const move = MoveTo(effect, { x: target.x - pivot.x, y: target.y - pivot.y }, 750);
      move.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, [effectId]);
      });
      move.on_end.connect(() => {
        this.m_elementsList.Remove(effectId);

        this.m_freeSpinsWon += effectValue;
        this.AdjustCollected();
        this.AdjustFreeSpins();

        if (!this.m_fastForwardComets) {
          this.StartNextComet();
        }
      });

      const shield = tweeny.delay(shieldAnimDuration);
      shield.on_begin.connect(() => {
        const animShield = this.m_elementsList.Get(AnimShieldId, AnimElement);
        animShield.Stop();
        animShield.Rewind();
        animShield.Play();
      });

      const endExpl = tweeny.delay(endExplAnimDuration);
      endExpl.on_begin.connect(() => {
        const animShield = this.m_elementsList.Get(AnimCometEndExplosionId, AnimElement);
        animShield.Stop();
        animShield.Rewind();
        animShield.Play();
        animShield.SetHidden(false);
        this.m_endCounter++;
      });
      endExpl.on_end.connect(() => {
        this.m_endCounter--;
        if (this.m_endCounter === 0) {
          this.m_elementsList.SetHidden(true, [AnimCometEndExplosionId]);
        }
      });

      const comet = tweeny.sequence(move, tweeny.together(shield, endExpl));
      comet.on_end.connect(() => {
        ++this.m_finishedComets;

        if (this.m_finishedComets === this.m_cometActions.length) {
          this.m_events.cometsAnimDone.Post();
        }
      });

      this.m_cometActions.push(comet);
    }

    if (this.m_cometActions.length === 0) {
      this.m_events.cometsAnimDone.Post();
    }
  }

  private StartNextComet() {
    if (this.m_nextCometToStart >= this.m_cometActions.length) return;

    const cometAction = this.m_cometActions[this.m_nextCometToStart++];
    tweeny.start(cometAction, 'HoldAndSpinRoundInfoView:Comets');
  }

  private StartAllPendingComets() {
    while (this.m_nextCometToStart < this.m_cometActions.length) {
      this.StartNextComet();
    }
  }

  private StopComets() {
    for (const cometAction of this.m_cometActions) {
      tweeny.stop(cometAction);
    }

    for (const effectId of this.m_cometEffectIds) {
      this.m_elementsList.Remove(effectId);
    }

    this.m_cometActions = [];
    this.m_cometEffectIds = [];
    this.m_nextCometToStart = 0;
    this.m_finishedComets = 0;
    this.m_fastForwardComets = false;
    this.m_endCounter = 0;

    if (this.m_elementsList.IsLoaded()) {
      this.m_elementsList.SetHidden(true, [AnimCometEndExplosionId]);
    }
  }

  private HideMembers() {
    this.m_elementsList.SetHidden(true, ElementsAllIds);
  }

  private SetElementsToIntroPosition() {
    this.m_elementsList.Get(ImageGrandPanelId).SetFromDummy(this.m_elementsList.Find(DummyHelpGrandPanelId, BaseElement));
    this.m_elementsList.Get(ImageGrandPrizeId).SetFromDummy(this.m_elementsList.Find(DummyHelpGrandPrizeId, BaseElement));
    this.m_elementsList.Get(TextGrandValueId).SetFromDummy(this.m_elementsList.Find(DummyHelpGrandValueId, TextElement));

    this.m_elementsList.Get(ImageMajorPanelId).SetFromDummy(this.m_elementsList.Find(DummyHelpMajorPanelId, BaseElement));
    this.m_elementsList.Get(ImageMajorPrizeId).SetFromDummy(this.m_elementsList.Find(DummyHelpMajorPrizeId, BaseElement));
    this.m_elementsList.Get(TextMajorValueId).SetFromDummy(this.m_elementsList.Find(DummyHelpMajorValueId, TextElement));

    this.m_elementsList.Get(ImageMinorPanelId).SetFromDummy(this.m_elementsList.Find(DummyHelpMinorPanelId, BaseElement));
    this.m_elementsList.Get(ImageMinorPrizeId).SetFromDummy(this.m_elementsList.Find(DummyHelpMinorPrizeId, BaseElement));
    this.m_elementsList.Get(TextMinorValueId).SetFromDummy(this.m_elementsList.Find(DummyHelpMinorValueId, TextElement));

    this.m_elementsList.Get(ImageMiniPanelId).SetFromDummy(this.m_elementsList.Find(DummyHelpMiniPanelId, BaseElement));
    this.m_elementsList.Get(ImageMiniPrizeId).SetFromDummy(this.m_elementsList.Find(DummyHelpMiniPrizeId, BaseElement));
    this.m_elementsList.Get(TextMiniValueId).SetFromDummy(this.m_elementsList.Find(DummyHelpMiniValueId, TextElement));
  }

  private SetElementsToMainPosition() {
    this.m_elementsList.Get(ImageGrandPanelId).SetFromDummy(this.m_elementsList.Find(DummyCollectedGrandPanelId, BaseElement));
    this.m_elementsList.Get(ImageGrandPrizeId).SetFromDummy(this.m_elementsList.Find(DummyCollectedGrandPrizeId, BaseElement));
    this.m_elementsList.Get(TextGrandValueId).SetFromDummy(this.m_elementsList.Find(DummyCollectedGrandValueId, TextElement));

    this.m_elementsList.Get(ImageMajorPanelId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMajorPanelId, BaseElement));
    this.m_elementsList.Get(ImageMajorPrizeId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMajorPrizeId, BaseElement));
    this.m_elementsList.Get(TextMajorValueId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMajorValueId, TextElement));

    this.m_elementsList.Get(ImageMinorPanelId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMinorPanelId, BaseElement));
    this.m_elementsList.Get(ImageMinorPrizeId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMinorPrizeId, BaseElement));
    this.m_elementsList.Get(TextMinorValueId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMinorValueId, TextElement));

    this.m_elementsList.Get(ImageMiniPanelId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMiniPanelId, BaseElement));
    this.m_elementsList.Get(ImageMiniPrizeId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMiniPrizeId, BaseElement));
    this.m_elementsList.Get(TextMiniValueId).SetFromDummy(this.m_elementsList.Find(DummyCollectedMiniValueId, TextElement));
  }

  private GetFittestCurrencyType() {
    const fitness = new Map<ECurrencyPrize, number>([
      [ECurrencyPrize.Undefined, 0],
      [ECurrencyPrize.FreeSpinsEnergy, 1],
      [ECurrencyPrize.CoinsFreeSpinEnergy, 1],
      [ECurrencyPrize.Credits, 2],
      [ECurrencyPrize.ExtraSpinsEnergy, 3],
      [ECurrencyPrize.CoinsSpinEnergy, 4],
    ]);

    let fittest = ECurrencyPrize.Undefined;
    for (const currency of this.m_data.paytables.keys()) {
      fittest = (fitness.get(fittest)! < fitness.get(currency)!) ? currency : fittest;
    }
    return fittest;
  }

  private SetCurrencyType(currency: ECurrencyPrize) {
    this.m_data.currencyType = currency;
  }

  private AdjustCollected() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    this.m_elementsList.Get(TextCollectedShieldsValueId, TextElement).SetText(String(this.m_shieldsCollected));
  }

  private AdjustFreeSpins() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    this.m_elementsList.Get(TextFreeSpinsWonValueId, TextElement).SetText(String(this.m_freeSpinsWon));
  }

  private AdjustPrizes() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const formatPrize = (_figId: FigureId, _count: number): string => {
      let winBase = 0;
      if (this.m_data.paytables.has(ECurrencyPrize.Credits)) {
        const paytable = this.m_data.paytables.get(ECurrencyPrize.Credits)!;
        const winCoefficients = paytable.get(_figId);
        if (winCoefficients !== undefined) {
          winBase = winCoefficients[_count];
        }
      } else if (this.m_data.paytables.has(ECurrencyPrize.CoinsSpinEnergy)) {
        const paytable = this.m_data.paytables.get(ECurrencyPrize.CoinsSpinEnergy)!;
        const winCoefficients = paytable.get(_figId);
        if (winCoefficients !== undefined) {
          winBase = winCoefficients[_count];
        }
      }
      const prizeInCents = winBase * this.m_data.totalBet;
      return this.RuntimeGetConst(ILocalization).FormatNumber(prizeInCents);
    };
    this.m_elementsList.Get(TextGrandValueId, TextElement).SetText(formatPrize(37, 3));
    this.m_elementsList.Get(TextMajorValueId, TextElement).SetText(formatPrize(36, 2));
    this.m_elementsList.Get(TextMinorValueId, TextElement).SetText(formatPrize(35, 1));
    this.m_elementsList.Get(TextMiniValueId, TextElement).SetText(formatPrize(34, 1));
  }

  private AdjustMode() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    switch (this.m_oldMode) {
      case EMode.Intro: tweeny.stop_and_finish(this.m_actionIntro); break;
      case EMode.Main: tweeny.stop_and_finish(this.m_actionMain); break;
      case EMode.Outro: tweeny.stop_and_finish(this.m_actionOutro); break;
      case EMode.Comets: this.StopComets(); break;

      case EMode.None: // fallthrough
      default: break;
    }

    switch (this.m_mode) {
      case EMode.Intro: tweeny.start(this.m_actionIntro, 'HoldAndSpinRoundInfoView:Intro'); break;
      case EMode.Main: tweeny.start(this.m_actionMain, 'HoldAndSpinRoundInfoView:Main'); break;
      case EMode.Outro: tweeny.start(this.m_actionOutro, 'HoldAndSpinRoundInfoView:Outro'); break;
      case EMode.Comets:
        this.HideMembers();
        this.SetElementsToMainPosition();
        this.m_elementsList.SetHidden(false, ElementsMainIds);
        this.m_elementsList.SetHidden(false, [TextFreeSpinsWonValueId]);
        this.m_elementsList.SetHidden(true, [TextCollectedShieldsValueId]);
        {
          const isPrizeInCoins: boolean = this.m_data.currencyType === ECurrencyPrize.CoinsSpinEnergy;
          this.m_elementsList.Get(ImageAllPrizesInCoinsId, ImageElement).SetHidden(!isPrizeInCoins);
          this.m_elementsList.Get(ImageAllPrizesInEuroId, ImageElement).SetHidden(isPrizeInCoins);
        }
        this.CreateComets();
        this.StartNextComet();
        break;

      case EMode.None: // fallthrough
      default: this.HideMembers(); break;
    }

    return;
  }
}
