import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IResources, type ElementsListData, type Point } from '@game/engine/Game/RuntimeExport/IResources';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IVideo } from '@game/engine/GameVideoCtrl/RuntimeExport/IVideo';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { EWinBarState } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IInfoSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import type { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ThemeLayout } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/ThemeLayout';
import { GameBackgroundView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/Views/GameBackgroundView';
import { CreditBarView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/Views/CreditBarView';
import { BetBarView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/Views/BetBarView';
import { CreditsWinBarView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/Views/CreditsWinBarView';
import { InfoSwButtonView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/SwButtons/InfoSwButtonView';
import { BetUpSwButtonView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/SwButtons/BetUpSwButtonView';
import { ExitGameSwButtonView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/SwButtons/ExitGameSwButtonView';
import { SoundVolumeSwButtonView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/SwButtons/SoundVolumeSwButtonView';
import { LanguageSwButtonView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/SwButtons/LanguageSwButtonView';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';

export function run(layouts: Record<string, ElementsListData>) {
  let checks = 0;
  const check = (condition: boolean, message: string) => {
    ++checks;
    if (!condition) throw new Error(message);
  };
  const equal = (actual: unknown, expected: unknown, message: string) =>
    check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const runtime = new Runtime();
  runtime.Add(IResources, {
    GetElementsList: (id: string) => layouts[id] ?? { name: id, elements: [] },
    GetElementsListFile: (id: string) => `${id}.json`,
    GetImage: (id: string) => ({ file: id }),
  } as unknown as IResources);
  runtime.Add(IVideo, {
    GetImages: () => ({ Get: () => ({ naturalWidth: 40, naturalHeight: 20 }) }),
  } as unknown as IVideo);
  runtime.Add(ILocalization, { FormatCurrency: (value: number) => String(value) } as ILocalization);
  runtime.Add(IAudioApi, { GetVolumePresetCount: () => 4, Play: () => {} } as unknown as IAudioApi);

  const background = new GameBackgroundView();
  background.Init(runtime);
  const credit = new CreditBarView();
  const bet = new BetBarView();
  const win = new CreditsWinBarView();
  const info = new InfoSwButtonView();
  const home = new ExitGameSwButtonView();
  const sound = new SoundVolumeSwButtonView();
  const language = new LanguageSwButtonView();
  const views = [credit, bet, win, info, home, sound, language, new BetUpSwButtonView()];
  views.forEach(view => view.Init(runtime));
  const list = (view: BaseView) => (view as unknown as { m_elementsList: ElementsList }).m_elementsList;
  const layout = (view: BaseView) => (view as unknown as { m_themeLayout: ThemeLayout }).m_themeLayout;
  // The element a view binds for an id in its current theme.
  const bound = <T extends BaseElement = BaseElement>(view: BaseView, id: string, Type?: new () => T) => list(view).Get(layout(view).ElementId(id), Type);
  const point = (view: BaseView, id: string) => {
    const area = bound(view, id, ButtonElement).GetTouchArea();
    return { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  };
  const click = (view: BaseView, p: Point) => {
    const handled = view.HandleTouchDown(p.x, p.y);
    view.HandleTouchUp(p.x, p.y);
    return handled;
  };
  const drawn: string[] = [];
  // Observe the real lists' selected elements; rendering itself belongs to DrawList.
  const observe = (view: BaseView) => {
    for (const element of list(view).GetElements()) {
      element.Draw = () => { if (element.IsVisible()) drawn.push(element.GetId()); };
    }
  };
  views.forEach(observe);
  // As the view manager does (IViewManager.SetTheme): each view applies its theme at once.
  const setTheme = (theme: ThemeType) => {
    background.SetTheme(theme);
    views.forEach(view => view.SetTheme(theme));
    views.forEach(view => view.Process());
  };
  const draw = (view: BaseView) => {
    drawn.length = 0;
    view.Draw({} as DrawList);
    return [...drawn];
  };
  credit.SetValueNow(12345);
  bet.SetValueNow(250);
  win.SetValueNow(6789);
  win.SetLabelState(EWinBarState.WinnerPaid);
  credit.Maximize(true);
  const mainInfo = point(info, 'button_info');
  check(click(info, mainInfo), 'main Info takes input at its JSON position');
  let pressed = 0;
  runtime.Get(IInfoSwButtonView.Events).buttonPressedEvent.RegisterInstant({}, () => ++pressed);
  const mainCredit = list(credit).Get('text_amount');

  for (const tetra of [true, false, true, false]) {
    setTheme(tetra ? ThemeType.Tetra : ThemeType.Main);
    const suffix = tetra ? '_tetra' : '';
    for (const view of views) {
      const source = layouts[view.GetName()];
      for (const item of source.elements.filter(item => !item.id?.endsWith('_tetra'))) {
        const active = bound(view, item.id!);
        equal(active.GetId(), item.id + suffix, 'bind the matching real element');
        const authored = source.elements.find(candidate => candidate.id === item.id + suffix)!;
        equal(active.GetPosition(), authored.position, 'use the JSON position without offsets');
        if (authored.scale) equal(active.GetScale(), authored.scale, 'use the JSON scale');
      }
      const ids = draw(view);
      check(ids.every(id => id.endsWith('_tetra') === tetra), 'draw only the active layout');
    }
    equal(bound(credit, 'text_amount', TextElement).GetText(), '12345', 'credit follows the active binding');
    equal(bound(bet, 'text_bet_amount', TextElement).GetText(), '250', 'bet follows the active binding');
    equal(bound(win, 'text_win_amount', TextElement).GetText(), '6789', 'win follows the active binding');
    equal(bound(win, 'image_win_label', ImageElement).GetSelectedImage(), EWinBarState.WinnerPaid, 'win label state survives switching');
    if (tetra) check(!click(info, mainInfo), 'inactive main Info does not take input');
    const before = pressed;
    check(click(info, point(info, 'button_info')), 'active Info takes input');
    equal(pressed, before + 1, 'one event per active click');
    if (tetra) {
      equal(draw(sound), [], 'JSON-hidden Tetra sound is not drawn');
      equal(draw(language), [], 'JSON-hidden Tetra language is not drawn');
      check(!click(sound, point(sound, 'button_volume_l0')), 'JSON-hidden Tetra sound does not take input');
      check(!click(language, point(language, 'button_language')), 'JSON-hidden Tetra language does not take input');
    }
  }
  check(list(credit).Get('text_amount') === mainCredit, 'switching keeps the original main element');

  credit.Minimize(false);
  const oldAnimation = (credit as unknown as { m_actionMinimize: tweeny.tween_action }).m_actionMinimize;
  check(tweeny.is_running(oldAnimation), 'credit animation starts on the main element');
  setTheme(ThemeType.Tetra);
  check(!tweeny.is_running(oldAnimation), 'switching releases the old layout animation');
  equal(bound(credit, 'text_amount').GetPosition(), bound(credit, 'text_amount_min').GetPosition(), 'credit animation settles at the Tetra JSON position');
  setTheme(ThemeType.Main);
  credit.Maximize(true);

  check(click(credit, point(credit, 'button_hide_credits')), 'main credit can be hidden');
  setTheme(ThemeType.Tetra);
  check(!draw(credit).includes('text_amount_tetra'), 'credit privacy survives switching to Tetra');
  check(click(credit, point(credit, 'button_show_credits')), 'Tetra credit can be shown again');
  check(draw(credit).includes('text_amount_tetra'), 'Tetra amount visible after showing');

  // The Tetra state hides/disables the exit view; its actual alternate element
  // remains drawn as in the artwork without allowing an unfinished match to exit.
  home.SetEnabled(false);
  home.SetVisible(false);
  check(draw(home).includes('button_exit_game_tetra'), 'Tetra Home is drawn');
  check(!click(home, point(home, 'button_exit_game')), 'Tetra Home cannot exit the match');
  const homeAlternate = layouts.ExitGameSwButtonView.elements.find(item => item.id === 'button_exit_game_tetra')!;
  homeAlternate.position = { x: 329, y: 949 };
  home.ReloadElementsList();
  observe(home);
  equal(bound(home, 'button_exit_game').GetPosition(), homeAlternate.position, 'visible Tetra Home reloads JSON while the exit control is hidden');

  const alternate = layouts.InfoSwButtonView.elements.find(item => item.id === 'button_info_tetra')!;
  alternate.position = { x: 721, y: 843 };
  info.ReloadElementsList();
  equal(bound(info, 'button_info').GetPosition(), alternate.position, 'a JSON edit directly changes Tetra placement');
  check(click(info, point(info, 'button_info')), 'input follows the edited JSON position');
  home.SetVisible(true);
  home.SetEnabled(true);
  setTheme(ThemeType.Main);
  equal(point(info, 'button_info'), mainInfo, 'Tetra edits leave main placement unchanged');
  check(draw(home).includes('button_exit_game'), 'main Home is restored');
  check(bound(home, 'button_exit_game', ButtonElement).IsEnabled(), 'main Home is enabled again');
  equal(bound(credit, 'text_amount').GetPosition(), mainCredit.GetElementData().position, 'credit tweens remain attached to the main layout');

  // Older resource sets with no paired elements keep the normal shared binding.
  layouts.Legacy = { name: 'Legacy', elements: [{ id: 'shared', type: 'Image', position: { x: 19, y: 23 } }] };
  const legacyList = new ElementsList();
  legacyList.Init(runtime, 'Legacy');
  legacyList.LoadFromResource();
  const theme = { value: ThemeType.Tetra };
  const legacy = new ThemeLayout(legacyList, tweeny.ref(theme, 'value'));
  legacy.Apply();
  equal(legacyList.Get(legacy.ElementId('shared')).GetPosition(), { x: 19, y: 23 }, 'unpaired legacy elements remain usable');
  check(legacyList.Get('shared').IsVisible(), 'unpaired legacy elements stay shown in Tetra');

  // A variant for any theme, by the theme's suffix (ThemeSuffix), and the theme the layout refers to as it changes.
  layouts.Themed = { name: 'Themed', elements: [
    { id: 'x', type: 'Image', position: { x: 1, y: 1 } },
    { id: 'x_hold_and_spin', type: 'Image', position: { x: 2, y: 2 } },
    { id: 'y_tetra', type: 'Image', position: { x: 3, y: 3 } },
  ] };
  const themedList = new ElementsList();
  themedList.Init(runtime, 'Themed');
  themedList.LoadFromResource();
  const themed = new ThemeLayout(themedList, tweeny.ref(theme, 'value'));
  theme.value = ThemeType.HoldAndSpin;
  themed.Apply();
  equal(themed.ElementId('x'), 'x_hold_and_spin', 'the layout follows the theme it refers to');
  check(!themedList.Get('x').IsVisible() && themedList.Get('x_hold_and_spin').IsVisible(), 'a theme shows its own variant in the element\'s place');
  check(!themedList.Get('y_tetra').IsVisible(), 'another theme\'s variant is hidden, even without its element');
  theme.value = ThemeType.Tetra;
  themed.Apply();
  equal(themed.ElementId('x'), 'x', 'a theme without a variant binds the element itself');
  check(themedList.Get('x').IsVisible() && !themedList.Get('x_hold_and_spin').IsVisible() && themedList.Get('y_tetra').IsVisible(),
    'the element shows when the theme has no variant of it');
  themedList.Deinit();
  views.forEach(view => view.Deinit());
  legacyList.Deinit();
  background.Deinit();
  return checks;
}
