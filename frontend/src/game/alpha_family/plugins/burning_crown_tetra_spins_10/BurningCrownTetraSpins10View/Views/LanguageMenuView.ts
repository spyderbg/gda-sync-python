// Egt::Game::AlphaFamily::LanguageMenuView (BurningCrownTetraSpins10View/Views/LanguageMenuView.h/.cpp): the language
// menu above the language button. English, then a frame later Italian, scale up from their closed placeholders and fade
// in; they close the other way.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { PlaceholderFromTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { type ILanguageMenuView, ILanguageMenuView as ILanguageMenuViewToken, ILanguageMenuViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { MenuView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/MenuView';

const FrameDuration = 33; // 1frames * 33ms;
const ElementAnimDuration = FrameDuration * 9; // 9frames * 33ms;
const LanguageMenuViewId = 'LanguageMenuView';
const LocaleEnglish = 'en-GB';
const LocaleItalian = 'it-IT';
const ButtonEnglishId = 'button_english';
const ImageFrameEnglishId = 'image_frame_english';
const ButtonItalianId = 'button_italian';
const ImageFrameItalianId = 'image_frame_italian';
const ElementsAllIds = [ButtonEnglishId, ImageFrameEnglishId, ButtonItalianId, ImageFrameItalianId];
const ButtonItalianOpenedId = 'button_italian_opened';
const ButtonItalianClosedId = 'button_italian_closed';
const ImageFrameItalianOpenedId = 'image_frame_italian_opened';
const ImageFrameItalianClosedId = 'image_frame_italian_closed';
const ButtonEnglishOpenedId = 'button_english_opened';
const ButtonEnglishClosedId = 'button_english_closed';
const ImageFrameEnglishOpenedId = 'image_frame_english_opened';
const ImageFrameEnglishClosedId = 'image_frame_english_closed';
const ButtonColorOpenedId = 'button_color_opened';
const ButtonColorClosedId = 'button_color_closed';
const ImageColorOpenedId = 'image_color_opened';
const ImageColorClosedId = 'image_color_closed';
const SoundLanguageMenuIntroId = 'SOUND_PANEL_SUPREME_LANGUAGE_MENU_INTRO';
const SoundLanguageMenuOutroId = 'SOUND_PANEL_SUPREME_LANGUAGE_MENU_OUTRO';

export class LanguageMenuView extends BaseView implements ILanguageMenuView {
  private readonly m_events = new ILanguageMenuViewEvents();
  private readonly m_menu = new MenuView(this.m_events);
  private m_currentLanguage = LocaleEnglish;
  private m_possibleLanguages: string[] = [];

  constructor() {
    super(LanguageMenuViewId);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    this.AdjustVisibleState();
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ILanguageMenuViewToken, this);
    this.RuntimeAdd(ILanguageMenuViewToken.Events, this.m_events);
    this.InitElementsList(LanguageMenuViewId, () => this.OnElementsListLoaded());
    this.m_menu.Init(this.GetRuntime());
    return true;
  }

  private OnElementsListLoaded() {
    this.InitAnimations();
    this.AdjustPossibleLanguagesState();
    this.AdjustVisibleState();
  }

  private InitAnimations() {
    const delayBetweenLanguages = FrameDuration; // 1 frame delay

    const buttonEnglish = this.m_elementsList.Find(ButtonEnglishId, ButtonElement);
    const buttonItalian = this.m_elementsList.Find(ButtonItalianId, ButtonElement);

    const buttonColorOpened = this.m_elementsList.Find(ButtonColorOpenedId, ButtonElement);
    const buttonColorClosed = this.m_elementsList.Find(ButtonColorClosedId, ButtonElement);
    const imageColorOpened = this.m_elementsList.Find(ImageColorOpenedId, ImageElement);
    const imageColorClosed = this.m_elementsList.Find(ImageColorClosedId, ImageElement);

    const buttonItalianOpened = this.m_elementsList.Find(ButtonItalianOpenedId, ButtonElement);
    const buttonItalianClosed = this.m_elementsList.Find(ButtonItalianClosedId, ButtonElement);
    const buttonFrameItalian = this.m_elementsList.Find(ImageFrameItalianId, ImageElement);
    const buttonFrameItalianOpened = this.m_elementsList.Find(ImageFrameItalianOpenedId, ImageElement);
    const buttonFrameItalianClosed = this.m_elementsList.Find(ImageFrameItalianClosedId, ImageElement);

    const buttonEnglishOpened = this.m_elementsList.Find(ButtonEnglishOpenedId, ButtonElement);
    const buttonEnglishClosed = this.m_elementsList.Find(ButtonEnglishClosedId, ButtonElement);
    const buttonFrameEnglish = this.m_elementsList.Find(ImageFrameEnglishId, ImageElement);
    const buttonFrameEnglishOpened = this.m_elementsList.Find(ImageFrameEnglishOpenedId, ImageElement);
    const buttonFrameEnglishClosed = this.m_elementsList.Find(ImageFrameEnglishClosedId, ImageElement);

    const openFirstLanguage = tweeny.together([
      PlaceholderFromTo(buttonEnglish, buttonEnglishClosed, buttonEnglishOpened, ElementAnimDuration, tweeny.ease.back_stop),
      PlaceholderFromTo(buttonEnglish, buttonColorClosed, buttonColorOpened, ElementAnimDuration, tweeny.ease.linear),
      PlaceholderFromTo(buttonFrameEnglish, buttonFrameEnglishClosed, buttonFrameEnglishOpened, ElementAnimDuration, tweeny.ease.back_stop),
      PlaceholderFromTo(buttonFrameEnglish, imageColorClosed, imageColorOpened, ElementAnimDuration, tweeny.ease.linear),
    ]);
    openFirstLanguage.on_begin.connect(() => {
      this.m_elementsList.Get(ButtonEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ImageFrameEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ButtonItalianId, BaseElement).SetHidden(true);
      this.m_elementsList.Get(ImageFrameItalianId, BaseElement).SetHidden(true);
    });
    const openSecondLanguage = tweeny.together([
      PlaceholderFromTo(buttonItalian, buttonItalianClosed, buttonItalianOpened, ElementAnimDuration, tweeny.ease.back_stop),
      PlaceholderFromTo(buttonItalian, buttonColorClosed, buttonColorOpened, ElementAnimDuration, tweeny.ease.linear),
      PlaceholderFromTo(buttonFrameItalian, buttonFrameItalianClosed, buttonFrameItalianOpened, ElementAnimDuration, tweeny.ease.back_stop),
      PlaceholderFromTo(buttonFrameItalian, imageColorClosed, imageColorOpened, ElementAnimDuration, tweeny.ease.linear),
    ]);
    openSecondLanguage.on_begin.connect(() => {
      this.m_elementsList.Get(ButtonEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ImageFrameEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ButtonItalianId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ImageFrameItalianId, BaseElement).SetHidden(false);
    });
    const open = tweeny.together([openFirstLanguage, tweeny.sequence([tweeny.delay(delayBetweenLanguages), openSecondLanguage])]);

    const closeSecondLanguage = tweeny.together([
      PlaceholderFromTo(buttonItalian, buttonItalianOpened, buttonItalianClosed, ElementAnimDuration, tweeny.ease.back_start),
      PlaceholderFromTo(buttonItalian, buttonColorOpened, buttonColorClosed, ElementAnimDuration, tweeny.ease.linear),
      PlaceholderFromTo(buttonFrameItalian, buttonFrameItalianOpened, buttonFrameItalianClosed, ElementAnimDuration, tweeny.ease.back_start),
      PlaceholderFromTo(buttonFrameItalian, imageColorOpened, imageColorClosed, ElementAnimDuration, tweeny.ease.linear),
    ]);
    closeSecondLanguage.on_end.connect(() => {
      this.m_elementsList.Get(ButtonEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ImageFrameEnglishId, BaseElement).SetHidden(false);
      this.m_elementsList.Get(ButtonItalianId, BaseElement).SetHidden(true);
      this.m_elementsList.Get(ImageFrameItalianId, BaseElement).SetHidden(true);
    });

    const closeFirstLanguage = tweeny.together([
      PlaceholderFromTo(buttonEnglish, buttonEnglishOpened, buttonEnglishClosed, ElementAnimDuration, tweeny.ease.back_start),
      PlaceholderFromTo(buttonEnglish, buttonColorOpened, buttonColorClosed, ElementAnimDuration, tweeny.ease.linear),
      PlaceholderFromTo(buttonFrameEnglish, buttonFrameEnglishOpened, buttonFrameEnglishClosed, ElementAnimDuration, tweeny.ease.back_start),
      PlaceholderFromTo(buttonFrameEnglish, imageColorOpened, imageColorClosed, ElementAnimDuration, tweeny.ease.linear),
    ]);
    closeFirstLanguage.on_end.connect(() => {
      this.m_elementsList.Get(ButtonEnglishId, BaseElement).SetHidden(true);
      this.m_elementsList.Get(ImageFrameEnglishId, BaseElement).SetHidden(true);
      this.m_elementsList.Get(ButtonItalianId, BaseElement).SetHidden(true);
      this.m_elementsList.Get(ImageFrameItalianId, BaseElement).SetHidden(true);
    });
    const close = tweeny.together(closeSecondLanguage, tweeny.sequence([tweeny.delay(delayBetweenLanguages), closeFirstLanguage]));
    close.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, ElementsAllIds);
    });

    tweeny.start(close, 'LanguageMenuView:Close');
    tweeny.stop_and_finish(close);

    this.m_menu.SetupAnims(open, close);
    this.m_menu.SetupSounds(SoundLanguageMenuIntroId, SoundLanguageMenuOutroId);
  }

  Deinit() {
    this.m_menu.Deinit();
    this.DeinitElementsList();
    this.RuntimeRemove(ILanguageMenuViewToken);
    this.RuntimeRemove(ILanguageMenuViewToken.Events);
    super.Deinit();
  }

  Process() {
    super.Process();
    this.m_menu.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.m_control.m_visible) return;
    super.Draw(drawList);
  }

  HandleTouchDown(x: number, y: number) {
    let captured = false;
    if (!this.m_elementsList.IsLoaded() || !this.m_menu.IsOpened()) return captured;
    if (this.m_elementsList.Get(ButtonEnglishId, ButtonElement).HandleTouchDown({ x, y })) {
      this.m_events.requestLanguageChange.Post(LocaleEnglish);
      captured = true;
      this.CloseMenu();
    } else if (this.m_elementsList.Get(ButtonItalianId, ButtonElement).HandleTouchDown({ x, y })) {
      this.m_events.requestLanguageChange.Post(LocaleItalian);
      captured = true;
      this.CloseMenu();
    }
    return captured;
  }

  HandleTouchUp(x: number, y: number) {
    let captured = false;
    if (!this.m_elementsList.IsLoaded() || !this.m_menu.IsOpened()) return captured;
    captured = this.m_elementsList.Get(ButtonEnglishId, ButtonElement).HandleTouchUp({ x, y }) || captured;
    captured = this.m_elementsList.Get(ButtonItalianId, ButtonElement).HandleTouchUp({ x, y }) || captured;
    return captured;
  }

  OpenMenu() {
    this.SetVisible(true);
    this.m_menu.OpenMenu();
  }

  CloseMenu() {
    this.m_menu.CloseMenu();
  }

  SetLanguage(language: string) {
    this.m_currentLanguage = language;
  }

  GetLanguage() {
    return this.m_currentLanguage;
  }

  SetPossibleLanguages(languages: string[]) {
    this.m_possibleLanguages = languages;
    this.AdjustPossibleLanguagesState();
  }

  private AdjustPossibleLanguagesState() {
    if (!this.m_elementsList.IsLoaded()) return;
    if (this.m_possibleLanguages.includes(LocaleEnglish)) this.m_elementsList.Get(ButtonEnglishId, ButtonElement).SetEnabled(true);
    if (this.m_possibleLanguages.includes(LocaleItalian)) this.m_elementsList.Get(ButtonItalianId, ButtonElement).SetEnabled(true);
  }

  private AdjustVisibleState() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.SetHidden(!this.m_control.m_visible);
  }
}
