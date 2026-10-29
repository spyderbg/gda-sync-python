// Egt::Game::AlphaFamily::BetMenuView (JokerReelsCoins10View/Views/BetMenuView.h/.cpp): the bet per line menu
// and the lines menu above the bet bar. They open one after the other, each element scaling up from its placeholder
// (dummy_menu_scale_closed to dummy_menu_scale_opened) around its menu's bottom, and close the other way.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { RssRect } from '@game/engine/Game/RuntimeExport/IResources';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { PlaceholderFromTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { type IBetMenuView, IBetMenuView as IBetMenuViewToken, IBetMenuViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { MenuView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/MenuView';

const FrameDuration = 33; // 1frames * 33ms;
const ElementAnimDuration = FrameDuration * 9; // 9frames * 33ms;
const BetMenuViewId = 'BetMenuView';

const DummyMenuScaleOpenedId = 'dummy_menu_scale_opened';
const DummyMenuScaleClosedId = 'dummy_menu_scale_closed';
const DummyMenuColorOpenedId = 'dummy_menu_alpha_opened';
const DummyMenuColorClosedId = 'dummy_menu_alpha_closed';

const ImageBackgroundId = 'image_background_1';
const ImageBackgroundFrame1Id = 'image_background_frame_1';
const ImageBetPerLineId = 'image_bet_per_line';
const TextBetValueId = 'text_bet_value';
const ButtonBetDownId = 'button_bet_down';
const ButtonBetUpId = 'button_bet_up';
const ElementsMenu1Ids = [ImageBackgroundId, ImageBackgroundFrame1Id, ImageBetPerLineId, TextBetValueId, ButtonBetDownId, ButtonBetUpId];

const ImageBackground2Id = 'image_background_2';
const ImageBackgroundFrame2Id = 'image_background_frame_2';
const ImageLinesId = 'image_lines';
const TextLinesValueId = 'text_lines_value';
const ElementsMenu2Ids = [ImageBackground2Id, ImageBackgroundFrame2Id, ImageLinesId, TextLinesValueId];

const SoundBetMenuIntroId = 'SOUND_PANEL_SUPREME_BETLINE_MENU_INTRO';
const SoundBetMenuOutroId = 'SOUND_PANEL_SUPREME_BETLINE_MENU_OUTRO';

const contains = (rect: RssRect, x: number, y: number) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;

export class BetMenuView extends BaseView implements IBetMenuView {
  private readonly m_events = new IBetMenuViewEvents();
  private readonly m_menu = new MenuView(this.m_events);
  private m_possibleTotalBets: number[] = [];
  private m_possibleLines: number[] = [];
  private m_selectedTotalBet = 0;
  private m_selectedLines = 0;
  private m_betLimit = 0;
  private m_currency: CurrencyType = 0;
  private m_buttonUpEnabled = false;
  private m_buttonDownEnabled = false;

  constructor() {
    super(BetMenuViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IBetMenuViewToken, this);
    this.RuntimeAdd(IBetMenuViewToken.Events, this.m_events);
    this.InitElementsList(BetMenuViewId, () => this.OnElementsListLoaded());
    this.m_menu.Init(this.GetRuntime());
    return true;
  }

  private OnElementsListLoaded() {
    this.InitAnimations();
    this.AdjustTotalBet();
    this.AdjustButtonUpState();
    this.AdjustButtonDownState();
    this.AdjustVisibleState();
  }

  private InitAnimations() {
    const delayBetweenMenus = FrameDuration; // 1 frame delay

    const dummyMenuScaleOpened = this.m_elementsList.Find(DummyMenuScaleOpenedId, BaseElement);
    const dummyMenuScaleClosed = this.m_elementsList.Find(DummyMenuScaleClosedId, BaseElement);
    const dummyMenuColorOpened = this.m_elementsList.Find(DummyMenuColorOpenedId, BaseElement);
    const dummyMenuColorClosed = this.m_elementsList.Find(DummyMenuColorClosedId, BaseElement);

    const pivot1 = this.m_elementsList.Get(ImageBackgroundId, ImageElement).GetWorldPivot();
    this.m_elementsList.SetWorldPivot(pivot1, ElementsMenu1Ids);
    const pivot2 = this.m_elementsList.Get(ImageBackground2Id, ImageElement).GetWorldPivot();
    this.m_elementsList.SetWorldPivot(pivot2, ElementsMenu2Ids);

    /// setup open animations
    const actionsOpenBetPerLineMenu: tweeny.tween_action[] = [];
    for (const id of ElementsMenu1Ids) {
      const elementMenu1 = this.m_elementsList.Find(id, BaseElement);
      actionsOpenBetPerLineMenu.push(PlaceholderFromTo(elementMenu1, dummyMenuScaleClosed, dummyMenuScaleOpened, ElementAnimDuration, tweeny.ease.back_stop));
      actionsOpenBetPerLineMenu.push(PlaceholderFromTo(elementMenu1, dummyMenuColorClosed, dummyMenuColorOpened, ElementAnimDuration, tweeny.ease.linear));
    }
    const openBetPerLineMenu = tweeny.together(actionsOpenBetPerLineMenu);
    openBetPerLineMenu.on_begin.connect(() => {
      this.m_elementsList.SetHidden(false, ElementsMenu1Ids);
      this.m_elementsList.SetHidden(true, ElementsMenu2Ids);
    });
    const actionsOpenLinesMenu: tweeny.tween_action[] = [];
    for (const id of ElementsMenu2Ids) {
      const elementMenu2 = this.m_elementsList.Find(id, BaseElement);
      actionsOpenLinesMenu.push(PlaceholderFromTo(elementMenu2, dummyMenuScaleClosed, dummyMenuScaleOpened, ElementAnimDuration, tweeny.ease.back_stop));
      actionsOpenLinesMenu.push(PlaceholderFromTo(elementMenu2, dummyMenuColorClosed, dummyMenuColorOpened, ElementAnimDuration, tweeny.ease.linear));
    }
    const openLinesMenu = tweeny.together(actionsOpenLinesMenu);
    openLinesMenu.on_begin.connect(() => {
      this.m_elementsList.SetHidden(false, ElementsMenu2Ids);
    });
    const open = tweeny.together(openBetPerLineMenu, tweeny.sequence([tweeny.delay(delayBetweenMenus), openLinesMenu]));

    /// setup close animations
    const actionsCloseLinesMenu: tweeny.tween_action[] = [];
    for (const id of ElementsMenu2Ids) {
      const elementMenu2 = this.m_elementsList.Find(id, BaseElement);
      actionsCloseLinesMenu.push(PlaceholderFromTo(elementMenu2, dummyMenuScaleOpened, dummyMenuScaleClosed, ElementAnimDuration, tweeny.ease.back_start));
      actionsCloseLinesMenu.push(PlaceholderFromTo(elementMenu2, dummyMenuColorOpened, dummyMenuColorClosed, ElementAnimDuration, tweeny.ease.linear));
    }
    const closeLinesMenu = tweeny.together(actionsCloseLinesMenu);
    closeLinesMenu.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, ElementsMenu2Ids);
      this.m_elementsList.SetHidden(false, ElementsMenu1Ids);
    });
    const actionsCloseBetPerLineMenu: tweeny.tween_action[] = [];
    for (const id of ElementsMenu1Ids) {
      const elementMenu1 = this.m_elementsList.Find(id, BaseElement);
      actionsCloseBetPerLineMenu.push(PlaceholderFromTo(elementMenu1, dummyMenuScaleOpened, dummyMenuScaleClosed, ElementAnimDuration, tweeny.ease.back_start));
      actionsCloseBetPerLineMenu.push(PlaceholderFromTo(elementMenu1, dummyMenuColorOpened, dummyMenuColorClosed, ElementAnimDuration, tweeny.ease.linear));
    }
    const closeBetPerLineMenu = tweeny.together(actionsCloseBetPerLineMenu);
    closeBetPerLineMenu.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, ElementsMenu1Ids);
    });
    const close = tweeny.together(closeLinesMenu, tweeny.sequence([tweeny.delay(delayBetweenMenus), closeBetPerLineMenu]));

    tweeny.start(close, 'BetMenuView:Close');
    tweeny.stop_and_finish(close);

    this.m_menu.SetupAnims(open, close);
    this.m_menu.SetupSounds(SoundBetMenuIntroId, SoundBetMenuOutroId);
  }

  Deinit() {
    this.RuntimeRemove(IBetMenuViewToken);
    this.RuntimeRemove(IBetMenuViewToken.Events);
    this.m_menu.Deinit();
    this.DeinitElementsList();
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
    if (!this.m_menu.IsOpened() || !this.m_elementsList.IsLoaded()) return captured;
    const list = this.m_elementsList;
    if (contains(list.Get(ImageBackgroundId, ImageElement).GetBounds(), x, y) || contains(list.Get(ImageBackground2Id, ImageElement).GetBounds(), x, y)) {
      this.m_menu.ResetOpenTimer();
      captured = true;
    }
    if (list.Get(ButtonBetDownId, ButtonElement).HandleTouchDown({ x, y })) {
      this.m_menu.ResetOpenTimer();
      this.m_events.requestDecreaseBetEvent.Post();
      captured = true;
    }
    if (list.Get(ButtonBetUpId, ButtonElement).HandleTouchDown({ x, y })) {
      this.m_menu.ResetOpenTimer();
      this.m_events.requestIncreaseBetEvent.Post();
      captured = true;
    }
    return captured;
  }

  HandleTouchUp(x: number, y: number) {
    let captured = false;
    if (!this.m_menu.IsOpened() || !this.m_elementsList.IsLoaded()) return captured;
    const list = this.m_elementsList;
    captured ||= contains(list.Get(ImageBackgroundId, ImageElement).GetBounds(), x, y);
    captured ||= contains(list.Get(ImageBackground2Id, ImageElement).GetBounds(), x, y);
    captured = list.Get(ButtonBetDownId, ButtonElement).HandleTouchUp({ x, y }) || captured;
    captured = list.Get(ButtonBetUpId, ButtonElement).HandleTouchUp({ x, y }) || captured;
    return captured;
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
    this.AdjustVisibleState();
  }

  OpenMenu() {
    this.SetVisible(true);
    this.m_menu.OpenMenu();
  }

  CloseMenu() {
    this.m_menu.CloseMenu();
  }

  /** Whether the menu is open, for the views that open it. */
  IsOpened() {
    return this.m_menu.IsOpened();
  }

  SetPossibleTotalBets(bets: number[]) {
    this.m_possibleTotalBets = bets;
  }

  SetSelectedTotalBet(bet: number) {
    this.m_selectedTotalBet = bet;
    this.AdjustTotalBet();
  }

  SetBetLimit(limit: number) {
    this.m_betLimit = limit;
  }

  SetCurrency(type: CurrencyType) {
    if (this.m_currency === type) return;
    this.m_currency = type;
    this.AdjustTotalBet();
  }

  SetPossibleLines(lines: number[]) {
    this.m_possibleLines = lines;
  }

  SetSelectedLines(lines: number) {
    this.m_selectedLines = lines;
    this.AdjustTotalBet();
  }

  SetButtonUpEnabled(enabled: boolean) {
    if (this.m_buttonUpEnabled === enabled) return;
    this.m_buttonUpEnabled = enabled;
    this.AdjustButtonUpState();
  }

  private AdjustButtonUpState() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.Get(ButtonBetUpId, ButtonElement).SetEnabled(this.m_buttonUpEnabled);
  }

  SetButtonDownEnabled(enabled: boolean) {
    if (this.m_buttonDownEnabled === enabled) return;
    this.m_buttonDownEnabled = enabled;
    this.AdjustButtonDownState();
  }

  private AdjustButtonDownState() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.Get(ButtonBetDownId, ButtonElement).SetEnabled(this.m_buttonDownEnabled);
  }

  private AdjustTotalBet() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.Get(TextLinesValueId, TextElement).SetText(String(this.m_selectedLines));
    const value = Math.trunc(this.m_selectedTotalBet / (this.m_selectedLines > 0 ? this.m_selectedLines : 1));

    let formattedValue: string;

    if (this.m_currency === Currency.Credits) {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatCurrency(value);
    } else if (this.m_currency === Currency.CoinsSpinEnergy) {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatCoins(value);
    } else {
      formattedValue = this.RuntimeGetConst(ILocalization).FormatNumber(value);
    }

    this.m_elementsList.Get(TextBetValueId, TextElement).SetText(formattedValue);
  }

  private AdjustVisibleState() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.SetHidden(!this.m_control.m_visible);
  }
}
