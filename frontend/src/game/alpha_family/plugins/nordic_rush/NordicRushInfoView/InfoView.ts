// Egt::Game::AlphaFamily::InfoView (NordicRushInfoView/InfoView.h/.cpp): the help pages on the info
// screen. Its rtf_info element (InfoView.json) draws the RTF page of the current kind of page (InfoViewConfig); Info
// slides the next page in, in the config's order, and an idle non-main page returns to the main one. The page shows
// the game's stakes: each paytable figure's win at the bet per line, the win capping limit, the certification code...
// Two more elements lists are drawn with the pages: a background (InfoView_Background) under every page, and the main
// page's prizes (InfoView_Page_Wintable: the grand, major, minor and mini coins' wins at the stake, FormatPrize).

import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ECurrencyPrize, type FigureId, type IInfoView, IInfoView as IInfoViewToken, IInfoViewEvents, type PaytableCoefficients } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { EInfoViewPageType } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.data';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { uint32_t } from '@game/engine/GameCore/Common/Types';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { transformf, vec3 } from '@game/hat_libs/egt_math/transform';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { move_from_to } from '@game/hat_libs/tweeny_extend/tweeny_extend_transform/tweeny_extend_transform';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ERtfTags, type FigureKey, FigureKeyString, type PaytableFiguresTextType, RtfElement } from '@game/engine/GameVideoCtrl/ViewElements/RtfElement';
import type { InfoViewConfig } from './InfoView.data';

const InfoViewId = 'InfoView';

const RtfInfoId = 'rtf_info';
const OverlayPageWintableId = 'InfoView_Page_Wintable';
const OverlayBackgroundId = 'InfoView_Background';

// overlay page wintable
const ImageGrandPanelId = 'image_grand_panel';
const ImageGrandPrizeId = 'image_grand_prize';
const TextGrandValueId = 'text_grand_value';

const ImageMajorPanelId = 'image_major_panel';
const ImageMajorPrizeId = 'image_major_prize';
const TextMajorValueId = 'text_major_value';

const ImageMinorPanelId = 'image_minor_panel';
const ImageMinorPrizeId = 'image_minor_prize';
const TextMinorValueId = 'text_minor_value';

const ImageMiniPanelId = 'image_mini_panel';
const ImageMiniPrizeId = 'image_mini_prize';
const TextMiniValueId = 'text_mini_value';

const roundTypeToInfoPage = new Map<RoundType, EInfoViewPageType>([
  [RoundType.Main, EInfoViewPageType.Main],
  [RoundType.Coins, EInfoViewPageType.Main],
  [RoundType.Free, EInfoViewPageType.Free],
  [RoundType.CoinsFree, EInfoViewPageType.Free],
  [RoundType.Extra, EInfoViewPageType.Extra],
  [RoundType.ExtraFree, EInfoViewPageType.ExtraFree],
  [RoundType.Wheel, EInfoViewPageType.CoinWheel]]);
const infoPageToAdditionalElementsListId = new Map<EInfoViewPageType, string>([
  [EInfoViewPageType.Undefined, ''],
  [EInfoViewPageType.Main, OverlayPageWintableId],
  [EInfoViewPageType.Bonus1, ''],
  [EInfoViewPageType.Bonus2, ''],
  [EInfoViewPageType.Free, ''],
  [EInfoViewPageType.Extra, ''],
  [EInfoViewPageType.ExtraFree, ''],
  [EInfoViewPageType.Coin, ''],
  [EInfoViewPageType.CoinWheel, ''],
  [EInfoViewPageType.Gamble, '']]);

interface InfoViewDataImpl {
  certificationCode: string;
  language: string;
  serialNumber: string;
  betPerLine: number;
  lines: number;
  figureNames: Map<FigureId, string>;
  paytables: Map<ECurrencyPrize, PaytableCoefficients>;
  paytableTexts: PaytableFiguresTextType;
  gambleLimit: string;
  maxGambleAttempts: string;
  jackpotMultiplier: number;
  gambleCapLimit: string;
  winCappingLimit: string;
}

const gameToRtfLanguages: Map<string, string> = new Map([
  ['en-GB', 'English'],
  ['el-GR', 'Greek'],
  ['aa-ER', 'Afar'],
  // ['UNKNOWN-Abkhazian', 'Abkhazian'],
  ['af-ZA', 'Afrikaans'],
  // ['UNKNOWN-Akan', 'Akan'],
  ['am-ET', 'Amharic'],
  // ['UNKNOWN-Aragonese', 'Aragonese'],
  // ['UNKNOWN-Arabic', 'Arabic'],
  // ['UNKNOWN-Assamese', 'Assamese'],
  // ['UNKNOWN-Avar', 'Avar'],
  ['ay-BO', 'Aymara'],
  ['az-AZ', 'Azerbaijani'],
  // ['UNKNOWN-Bashkir', 'Bashkir'],
  ['be-BY', 'Belarusian'],
  ['bg-BG', 'Bulgarian'],
  // ['UNKNOWN-Bihari', 'Bihari'],
  ['bi-VU', 'Bislama'],
  // ['UNKNOWN-Bambara', 'Bambara'],
  ['bn-BD', 'Bengali'],
  // ['UNKNOWN-Tibetan', 'Tibetan'],
  // ['UNKNOWN-Breton', 'Breton'],
  ['bs-BA', 'Bosnian'],
  ['ca-AD', 'Catalan'],
  // ['UNKNOWN-Chechen', 'Chechen'],
  ['ch-GU', 'Chamorro'],
  // ['UNKNOWN-Corsican', 'Corsican'],
  // ['UNKNOWN-Cree', 'Cree'],
  ['cs-CZ', 'Czech'],
  // ['UNKNOWN-Chuvash', 'Chuvash'],
  // ['UNKNOWN-Welsh', 'Welsh'],
  ['da-DK', 'Danish'],
  ['de-DE', 'German'],
  ['dv-MV', 'Divehi'],
  ['dz-BT', 'Dzongkha'],
  // ['UNKNOWN-Ewe', 'Ewe'],
  // ['UNKNOWN-Esperanto', 'Esperanto'],
  ['es-ES', 'Spanish'],
  ['et-EE', 'Estonian'],
  // ['UNKNOWN-Basque', 'Basque'],
  ['fa-IR', 'Persian'],
  // ['UNKNOWN-Peul', 'Peul'],
  ['fi-FI', 'Finnish'],
  ['fj-FJ', 'Fijian'],
  ['fo-FO', 'Faroese'],
  ['fr-FR', 'French'],
  // ['UNKNOWN-West Frisian', 'West Frisian'],
  ['ga-IE', 'Irish'],
  // ['UNKNOWN-Scottish Gaelic', 'Scottish Gaelic'],
  // ['UNKNOWN-Galician', 'Galician'],
  ['gn-AR', 'Guarani'],
  // ['UNKNOWN-Gujarati', 'Gujarati'],
  ['gv-IM', 'Manx'],
  // ['UNKNOWN-Hausa', 'Hausa'],
  ['he-IL', 'Hebrew'],
  ['hi-IN', 'Hindi'],
  // ['UNKNOWN-Hiri Motu', 'Hiri Motu'],
  ['hr-HR', 'Croatian'],
  ['ht-HT', 'Haitian'],
  ['hu-HU', 'Hungarian'],
  ['hy-AM', 'Armenian'],
  // ['UNKNOWN-Herero', 'Herero'],
  // ['UNKNOWN-Interlingua', 'Interlingua'],
  ['id-ID', 'Indonesian'],
  // ['UNKNOWN-Interlingue', 'Interlingue'],
  // ['UNKNOWN-Igbo', 'Igbo'],
  // ['UNKNOWN-Sichuan Yi', 'Sichuan Yi'],
  // ['UNKNOWN-Inupiak', 'Inupiak'],
  // ['UNKNOWN-Ido', 'Ido'],
  ['is-IS', 'Icelandic'],
  ['it-IT', 'Italian'],
  // ['UNKNOWN-Inuktitut', 'Inuktitut'],
  // ['UNKNOWN-Javanese', 'Javanese'],
  ['ja-JP', 'Japanese'],
  ['ka-GE', 'Georgian'],
  ['kg-CD', 'Kongo'],
  // ['UNKNOWN-Kikuyu', 'Kikuyu'],
  // ['UNKNOWN-Kuanyama', 'Kuanyama'],
  ['kk-KZ', 'Kazakh'],
  ['kl-GL', 'Greenlandic'],
  ['km-KH', 'Cambodian'],
  // ['UNKNOWN-Kannada', 'Kannada'],
  ['ko-KR', 'Korean'],
  // ['UNKNOWN-Kanuri', 'Kanuri'],
  // ['UNKNOWN-Kashmiri', 'Kashmiri'],
  ['ku-IQ', 'Kurdish'],
  // ['UNKNOWN-Komi', 'Komi'],
  // ['UNKNOWN-Cornish', 'Cornish'],
  // ['UNKNOWN-Kirghiz', 'Kirghiz'],
  ['la-VA', 'Latin'],
  ['lb-LU', 'Luxembourgish'],
  // ['UNKNOWN-Ganda', 'Ganda'],
  // ['UNKNOWN-Limburgian', 'Limburgian'],
  ['ln-CD', 'Lingala'],
  // ['UNKNOWN-Laotian', 'Laotian'],
  ['lt-LT', 'Lithuanian'],
  ['lu-CD', 'Luba-Katanga'],
  ['lv-LV', 'Latvian'],
  ['mg-MG', 'Malagasy'],
  ['mh-MH', 'Marshallese'],
  ['mi-NZ', 'Maori'],
  ['mk-MK', 'Macedonian'],
  // ['UNKNOWN-Malayalam', 'Malayalam'],
  ['mn-MN', 'Mongolian'],
  ['ro-MD', 'Moldovan'],
  // ['UNKNOWN-Marathi', 'Marathi'],
  ['ms-SG', 'Malay'],
  ['mt-MT', 'Maltese'],
  ['my-MM', 'Burmese'],
  ['na-NR', 'Nauruan'],
  ['nb-NO', 'Norwegian Bokmål'],
  ['nd-ZW', 'North Ndebele'],
  ['ne-NP', 'Nepali'],
  // ['UNKNOWN-Ndonga', 'Ndonga'],
  ['nl-NL', 'Dutch'],
  ['nn-NO', 'Norwegian Nynorsk'],
  ['no-NO', 'Norwegian'],
  ['nr-ZA', 'South Ndebele'],
  // ['UNKNOWN-Navajo', 'Navajo'],
  ['ny-MW', 'Chichewa'],
  // ['UNKNOWN-Occitan', 'Occitan'],
  // ['UNKNOWN-Ojibwa', 'Ojibwa'],
  // ['UNKNOWN-Oromo', 'Oromo'],
  // ['UNKNOWN-Oriya', 'Oriya'],
  // ['UNKNOWN-Ossetian / Ossetic', 'Ossetian / Ossetic'],
  ['pa-AW', 'Panjabi / Punjabi'],
  // ['UNKNOWN-Pali', 'Pali'],
  ['pl-PL', 'Polish'],
  ['ps-AF', 'Pashto'],
  ['pt-PT', 'Portuguese'],
  ['qu-BO', 'Quechua'],
  // ['UNKNOWN-Raeto Romance', 'Raeto Romance'],
  ['rn-BI', 'Kirundi'],
  ['ru-RU', 'Russian'],
  ['ro-RO', 'Romanian'],
  // ['UNKNOWN-Rwandi', 'Rwandi'],
  // ['UNKNOWN-Sanskrit', 'Sanskrit'],
  // ['UNKNOWN-Sardinian', 'Sardinian'],
  // ['UNKNOWN-Sindhi', 'Sindhi'],
  // ['UNKNOWN-Northern Sami', 'Northern Sami'],
  ['sg-CF', 'Sango'],
  // ['UNKNOWN-Serbo-Croatian', 'Serbo-Croatian'],
  ['si-LK', 'Sinhalese'],
  ['sk-SK', 'Slovak'],
  ['sl-SI', 'Slovenian'],
  ['sm-WS', 'Samoan'],
  ['sn-ZW', 'Shona'],
  ['so-SO', 'Somalia'],
  ['sq-AL', 'Albanian'],
  ['sr-RS', 'Serbian'],
  ['ss-ZA', 'Swati'],
  ['st-ZA', 'Southern Sotho'],
  // ['UNKNOWN-Sundanese', 'Sundanese'],
  ['sv-SE', 'Swedish'],
  ['sw-CD', 'Swahili'],
  ['ta-SG', 'Tamil'],
  // ['UNKNOWN-Telugu', 'Telugu'],
  ['tg-TJ', 'Tajik'],
  ['th-TH', 'Thai'],
  ['ti-ER', 'Tigrinya'],
  ['tk-TM', 'Turkmen'],
  // ['UNKNOWN-Tagalog / Filipino', 'Tagalog / Filipino'],
  ['tn-ZA', 'Tswana'],
  ['to-TO', 'Tonga'],
  ['tr-TR', 'Turkish'],
  ['ts-ZA', 'Tsonga'],
  // ['UNKNOWN-Tatar', 'Tatar'],
  // ['UNKNOWN-Twi', 'Twi'],
  // ['UNKNOWN-Tahitian', 'Tahitian'],
  // ['UNKNOWN-Uyghur', 'Uyghur'],
  ['uk-UA', 'Ukrainian'],
  ['ur-PK', 'Urdu'],
  ['uz-UZ', 'Uzbek'],
  ['ve-ZA', 'Venda'],
  ['vi-VN', 'Vietnamese'],
  // ['UNKNOWN-Volapük', 'Volapük'],
  // ['UNKNOWN-Walloon', 'Walloon'],
  // ['UNKNOWN-Wolof', 'Wolof'],
  ['xh-ZA', 'Xhosa'],
  // ['UNKNOWN-Yiddish', 'Yiddish'],
  // ['UNKNOWN-Yoruba', 'Yoruba'],
  // ['UNKNOWN-Zhuang', 'Zhuang'],
  ['zh-CN', 'Chinese'],
  ['zu-ZA', 'Zulu'],
]);

function ConvertGameToRtfLanguage(language: string) {
  if (gameToRtfLanguages.has(language)) {
    return gameToRtfLanguages.get(language)!;
  }
  return '';
}

function CreatePaytableFiguresText(betPerLine: number, lines: number, paytables: Map<ECurrencyPrize, PaytableCoefficients>,
  scatterFigures: Set<FigureId>, figureNames: Map<FigureId, string>, gameMultipliers: uint32_t[], localization: ILocalization): PaytableFiguresTextType {
  const paytableFiguresText: PaytableFiguresTextType = new Map(); // figureLookups,
  const formatCreditWinText = (isScatter: boolean, winCoefficient: number, betPerLine: number, linesCount: number, gameMultiplier: number, devider: number) => {
    let winCents = winCoefficient * betPerLine * (isScatter ? linesCount : 1);
    winCents *= gameMultiplier;
    winCents = Math.trunc(winCents / devider);

    return localization.FormatNumber(winCents);
  };

  const addFormattersForPaytable = (figureLookups: PaytableFiguresTextType, paytable: PaytableCoefficients, scatterFigures: Set<FigureId>,
    figureNames: Map<FigureId, string>, gameMultipliers: uint32_t[]) => {
    const noMultipliers: uint32_t[] = [1];
    const multipliers = gameMultipliers.length === 0 ? noMultipliers : gameMultipliers;
    for (const [figureId, figureWinCoefficients] of paytable) {
      for (let winFigureCount: uint32_t = 0; winFigureCount < figureWinCoefficients.length; ++winFigureCount) {
        const winCoef = figureWinCoefficients[winFigureCount];
        const skipWin = winCoef === 0;
        if (skipWin) {
          continue;
        }

        for (const gameMultiplier of multipliers) {
          const figureKey: FigureKey = { name: figureNames.get(figureId)!, count: winFigureCount, multiplier: gameMultiplier };
          const divider = 1;

          const isScatter = scatterFigures.has(figureId);
          const winText = formatCreditWinText(isScatter, winCoef, betPerLine, lines, figureKey.multiplier, divider);
          figureLookups.set(FigureKeyString(figureKey), winText);
        }
      }
    }
  };

  // add formatters for credit wins
  if (paytables.has(ECurrencyPrize.Credits)) {
    addFormattersForPaytable(paytableFiguresText, paytables.get(ECurrencyPrize.Credits)!, scatterFigures, figureNames, gameMultipliers);
  }

  // add formatters for coin spin wins
  if (paytables.has(ECurrencyPrize.CoinsSpinEnergy)) {
    addFormattersForPaytable(paytableFiguresText, paytables.get(ECurrencyPrize.CoinsSpinEnergy)!, scatterFigures, figureNames, gameMultipliers);
  }

  return paytableFiguresText;
}

export class InfoView extends BaseView implements IInfoView {
  private readonly m_events = new IInfoViewEvents();
  private m_config: InfoViewConfig = {
    currentPageDefault: { x: 0, y: 0 }, currentPageMoved: { x: 0, y: 0 }, nextPageDefault: { x: 0, y: 0 }, nextPageMoved: { x: 0, y: 0 }, changePageDuration: 0,
    idleReturnToMainMs: 30000, infoPageToRtfPage: {}, orderedInfoPages: [], showWinCombination: false,
  };

  private readonly m_data: InfoViewDataImpl = {
    certificationCode: '', language: '', serialNumber: '', betPerLine: 1, lines: 1, figureNames: new Map(), paytables: new Map(),
    paytableTexts: new Map(), gambleLimit: '', maxGambleAttempts: '', jackpotMultiplier: 0, gambleCapLimit: '', winCappingLimit: '',
  };

  private readonly m_additionalElementsLists = new Map<string, ElementsList>();

  private m_currentPage = EInfoViewPageType.Undefined;
  private m_nextPage = EInfoViewPageType.Undefined;

  private readonly m_currentPageTransform = transformf.identity();
  private readonly m_nextPageTransform = transformf.identity();

  private m_sentinel = new sentinel();
  private m_actionNextPage = new tweeny.tween_action();
  private readonly m_infoIdleStopwatch = new Stopwatch();

  private m_shouldUseTimer = true;

  constructor() {
    super(InfoViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IInfoViewToken, this);
    this.RuntimeAdd(IInfoViewToken.Events, this.m_events);

    this.InitElementsList(InfoViewId, () => {
      this.OnElementsListLoaded();
    });
    this.InitElementsListsExtended();

    this.m_data.language = 'English';
    this.m_data.certificationCode = 'TEST : CUSTOM CERTIFICATION CODE';
    this.m_data.serialNumber = 'TEST: SERIAL NUMBER';
    this.m_data.betPerLine = 1;
    this.m_data.lines = 1;
    this.m_data.figureNames = new Map();
    this.m_currentPage = EInfoViewPageType.Main;
    this.m_nextPage = EInfoViewPageType.Undefined;

    this.SetVisible(true);
    return true;
  }

  private OnElementsListLoaded() {
    this.LoadConfig();
    this.InitAnimations();

    this.AdjustCertificationCode();
    this.AdjustCurrentPage();
    this.AdjustGambleCapLimit();
    this.AdjustGambleLimits();
    this.AdjustJackpotMultiplier();
    this.AdjustLanguage();
    this.AdjustPaytable();
    this.AdjustSerialNumber();
    this.AdjustWinCappingLimit();
  }

  private LoadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<InfoViewConfig>('InfoViewConfig');
  }

  private InitAnimations() {
    const changePageDuration = this.m_config.changePageDuration;

    this.m_sentinel = make_sentinel();
    this.m_actionNextPage = move_from_to(this.m_nextPageTransform, this.GetNextPageDefaultPos(), this.GetNextPageMovedPos(), changePageDuration, this.m_sentinel);
    this.m_actionNextPage.on_end.connect(() => {
      this.ShowPage(this.m_nextPage);
      this.m_nextPage = EInfoViewPageType.Undefined;
      this.m_currentPageTransform.set_position(this.GetCurrentPageDefaultPos());
    });
  }

  Deinit() {
    this.RuntimeRemove(IInfoViewToken);
    this.RuntimeRemove(IInfoViewToken.Events);

    tweeny.stop(this.m_actionNextPage);

    this.DeinitElementsListsExtended();
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();

    if (this.m_config.idleReturnToMainMs > 0 && this.m_nextPage === EInfoViewPageType.Undefined
      && this.m_currentPage !== EInfoViewPageType.Main && this.m_infoIdleStopwatch.IsRunning()) {
      const idleMs = this.m_infoIdleStopwatch.Measure();
      if (idleMs >= this.m_config.idleReturnToMainMs) {
        this.ResetInfoPage();
        this.m_infoIdleStopwatch.Reset();
        this.m_infoIdleStopwatch.Pause();
      }
    }
    // background
    {
      const elementsList = this.m_additionalElementsLists.get(OverlayBackgroundId);
      if (elementsList) {
        if (elementsList.IsDirty()) {
          this.ReloadElementsListExtended(OverlayBackgroundId);
        }
        elementsList.Update();
      }
    }

    // current page overlay
    {
      const infoPage = infoPageToAdditionalElementsListId.get(this.m_currentPage)!;
      const elementsList = this.m_additionalElementsLists.get(infoPage);
      if (elementsList) {
        if (elementsList.IsDirty()) {
          this.ReloadElementsListExtended(infoPage);
        }
        elementsList.Update();
      }
    }
    // next page overlay
    {
      const infoPage = infoPageToAdditionalElementsListId.get(this.m_nextPage)!;
      const elementsList = this.m_additionalElementsLists.get(infoPage);
      if (elementsList) {
        if (elementsList.IsDirty()) {
          this.ReloadElementsListExtended(infoPage);
        }
        elementsList.Update();
      }
    }
  }

  /** The additional elements lists' files are watched too (C++'s lists watch their files themselves). */
  HandleFileChanged(filepath: string) {
    super.HandleFileChanged(filepath);
    for (const elementsList of this.m_additionalElementsLists.values()) elementsList.HandleFileChanged(filepath);
  }

  Draw(drawList: DrawList) {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const rtf = this.m_elementsList.TryGet(RtfInfoId, RtfElement);
    if (!rtf) return;

    // Draw constant background
    this.m_additionalElementsLists.get(OverlayBackgroundId)?.Draw(drawList);

    // Draw all elements
    if (this.m_currentPage !== EInfoViewPageType.Undefined) {
      drawList.push_transform(this.m_currentPageTransform);
      rtf.DrawPage(this.m_config.infoPageToRtfPage[this.m_currentPage]!, drawList);
      this.m_additionalElementsLists.get(infoPageToAdditionalElementsListId.get(this.m_currentPage)!)?.Draw(drawList);
      drawList.pop_transform();
    }
    // draw both pages during the page changes
    if (this.m_nextPage !== EInfoViewPageType.Undefined) {
      drawList.push_transform(this.m_nextPageTransform);
      rtf.DrawPage(this.m_config.infoPageToRtfPage[this.m_nextPage]!, drawList);
      this.m_additionalElementsLists.get(infoPageToAdditionalElementsListId.get(this.m_nextPage)!)?.Draw(drawList);
      drawList.pop_transform();
    }
  }

  IsOpaqueFullScreen() {
    return true;
  }

  /** The kind of page shown, and the one sliding in, for the page around the game.
   * @browserOnly */
  GetPages() {
    return { current: this.m_currentPage, next: this.m_nextPage };
  }

  ShowRoundInfo(roundType: RoundType, idleChange: boolean) {
    const it = roundTypeToInfoPage.get(roundType);
    const infoPage = (it !== undefined ? it : EInfoViewPageType.Main);
    this.m_shouldUseTimer = idleChange && (roundType === RoundType.Main || roundType === RoundType.Coins);
    if (this.m_shouldUseTimer) {
      this.m_infoIdleStopwatch.Reset();
      this.m_infoIdleStopwatch.Resume();
    } else {
      this.m_infoIdleStopwatch.Pause();
    }

    if (this.m_currentPage === infoPage) return;
    if (this.m_nextPage === infoPage) return;

    this.TransitionToPage(infoPage);
  }

  private TransitionToPage(page: EInfoViewPageType) {
    // transition to page should be absolute
    if (tweeny.is_running(this.m_actionNextPage)) {
      tweeny.stop(this.m_actionNextPage);
      this.m_nextPage = EInfoViewPageType.Undefined;
    }

    if (this.m_currentPage === page) return;
    if (this.m_nextPage === page) return;

    const canAnimate = this.m_elementsList.IsLoaded() && this.m_currentPage !== EInfoViewPageType.Undefined
      && this.m_nextPage === EInfoViewPageType.Undefined && page in this.m_config.infoPageToRtfPage;

    if (canAnimate) {
      this.m_nextPage = page;
      const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
      rtf.RefreshPage(this.m_config.infoPageToRtfPage[this.m_nextPage]!);
      tweeny.start(this.m_actionNextPage, 'InfoView::TransitionToPage');
    } else {
      this.ShowPage(page);
    }
  }

  ShowPage(page: EInfoViewPageType) {
    this.m_currentPage = page;

    this.AdjustCurrentPage();
  }

  ShowNextPage() {
    if (this.m_shouldUseTimer) {
      this.m_infoIdleStopwatch.Reset();
      this.m_infoIdleStopwatch.Resume();
    }

    const orderedInfoPages = this.m_config.orderedInfoPages;
    if (orderedInfoPages.length === 0) return;
    const currentPageIndex = orderedInfoPages.indexOf(this.m_currentPage);
    this.m_nextPage = currentPageIndex < 0 || this.m_currentPage === orderedInfoPages[orderedInfoPages.length - 1]
      ? orderedInfoPages[0]
      : orderedInfoPages[currentPageIndex + 1];

    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.RefreshPage(this.m_config.infoPageToRtfPage[this.m_nextPage]!);
    tweeny.start(this.m_actionNextPage, 'InfoView::ShowNextPage');
  }

  SetStakes(totalBet: number, lines: number) {
    this.m_data.betPerLine = Math.trunc(totalBet / lines);
    this.m_data.lines = lines;

    this.AdjustPaytable();
    this.AdjustPageWintablePrizes();
  }

  SetPaytables(paytables: Map<ECurrencyPrize, PaytableCoefficients>, scatterFigures: Set<FigureId>, figureNames: Map<FigureId, string>,
    gameMultipliers: uint32_t[]) {
    this.m_data.figureNames = figureNames;
    this.m_data.paytables = paytables;
    this.m_data.paytableTexts = CreatePaytableFiguresText(this.m_data.betPerLine, this.m_data.lines, paytables, scatterFigures, this.m_data.figureNames,
      gameMultipliers, this.RuntimeGetConst(ILocalization));

    this.AdjustPaytable();
  }

  SetGambleLimits(gambleLimit: number, maxGambleAttempts: number) {
    this.m_data.gambleLimit = this.RuntimeGetConst(ILocalization).FormatCurrency(gambleLimit);
    this.m_data.maxGambleAttempts = String(maxGambleAttempts);

    this.AdjustGambleLimits();
  }

  SetCertificationCode(certificationCode: string) {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetCertificationCode(certificationCode);
  }

  SetLanguage(language: string) {
    const rtfLanguage = ConvertGameToRtfLanguage(language);
    this.m_data.language = rtfLanguage;

    this.AdjustLanguage();
  }

  SetSerialNumber(serialNumber: string) {
    this.m_data.serialNumber = serialNumber;
    this.AdjustSerialNumber();
  }

  SetWinCappingLimit(winCappingLimit: number) {
    this.m_data.winCappingLimit = this.RuntimeGetConst(ILocalization).FormatNumber(winCappingLimit);

    this.AdjustWinCappingLimit();
  }

  SetJackpotMultiplier(jackpotMultiplier: number) {
    this.m_data.jackpotMultiplier = jackpotMultiplier;
    this.AdjustJackpotMultiplier();
  }

  SetGambleCapLimit(gambleCapLimit: number) {
    this.m_data.gambleCapLimit = this.RuntimeGetConst(ILocalization).FormatNumber(gambleCapLimit);

    this.AdjustGambleCapLimit();
  }

  ShowCombinations(combinations: ReelCombinations) {
    if (!this.m_elementsList.IsLoaded()) return;
    if (!this.m_config.showWinCombination) return;

    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);

    for (const combination of combinations) {
      let multiplier: uint32_t = 1;
      for (const item of combination.multipliers.data) {
        if (multiplier < item.factor) multiplier = item.factor;
      }

      const figureName = this.m_data.figureNames.has(combination.symbolId) ? this.m_data.figureNames.get(combination.symbolId)! : 'Unknown';

      rtf.ShowWinLine(figureName, combination.symbolCount, multiplier);
    }
  }

  HideWins() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.HideWins(true);
  }

  StopAnimation(animId: string) {
    if (animId !== '') {
      this.m_events.animationStopped.Post(animId);
    }
  }

  StartAnimation(animId: string) {
    if (animId !== '') {
      this.m_events.animationStarted.Post(animId);
    }
  }

  // page overlay with element lists
  private InitElementsListsExtended() {
    // background
    {
      const elementsList = new ElementsList();
      this.m_additionalElementsLists.set(OverlayBackgroundId, elementsList);
      elementsList.Init(this.GetRuntime(), OverlayBackgroundId);
      elementsList.SetOnElementsListLoadedCallback(null);
      elementsList.LoadFromResource(); // (C++ loads it on its first draw)
    }

    // page wintable
    {
      const elementsList = new ElementsList();
      this.m_additionalElementsLists.set(OverlayPageWintableId, elementsList);
      elementsList.Init(this.GetRuntime(), OverlayPageWintableId);
      elementsList.SetOnElementsListLoadedCallback(() => {
        this.OnAdditionalElementsListPageWintableLoaded();
      });
      elementsList.LoadFromResource(); // (C++ loads it on its first draw)
    }
  }

  private ReloadElementsListExtended(id: string) {
    const elementsList = this.m_additionalElementsLists.get(id);
    if (elementsList === undefined) return;

    elementsList.Deinit();
    elementsList.Init(this.GetRuntime(), id);
    elementsList.LoadFromResource();

    if (id === OverlayPageWintableId) {
      this.AdjustPageWintablePrizes();
    }
  }

  private DeinitElementsListsExtended() {
    for (const elementsList of this.m_additionalElementsLists.values()) {
      elementsList.Deinit();
    }
  }

  private OnAdditionalElementsListPageWintableLoaded() {
    this.AdjustPageWintablePrizes();
  }

  FormatPrize(figId: FigureId, count: number) {
    let winBase = 0;
    if (this.m_data.paytables.has(ECurrencyPrize.Credits)) {
      const paytable = this.m_data.paytables.get(ECurrencyPrize.Credits)!;
      const winCoefficients = paytable.get(figId);
      if (winCoefficients !== undefined) {
        winBase = winCoefficients[count];
      }
    } else if (this.m_data.paytables.has(ECurrencyPrize.CoinsSpinEnergy)) {
      const paytable = this.m_data.paytables.get(ECurrencyPrize.CoinsSpinEnergy)!;
      const winCoefficients = paytable.get(figId);
      if (winCoefficients !== undefined) {
        winBase = winCoefficients[count];
      }
    }
    const prizeInCents = winBase * this.m_data.betPerLine * this.m_data.lines;
    return this.RuntimeGetConst(ILocalization).FormatNumber(prizeInCents);
  }

  private AdjustPageWintablePrizes() {
    const elementsList = this.m_additionalElementsLists.get(OverlayPageWintableId);
    if (elementsList === undefined) return;
    if (Unless(elementsList.IsLoaded())) return;

    elementsList.Get(TextGrandValueId, TextElement).SetText(this.FormatPrize(37, 3));
    elementsList.Get(TextMajorValueId, TextElement).SetText(this.FormatPrize(36, 2));
    elementsList.Get(TextMinorValueId, TextElement).SetText(this.FormatPrize(35, 1));
    elementsList.Get(TextMiniValueId, TextElement).SetText(this.FormatPrize(34, 1));
  }

  private GetCurrentPageDefaultPos() {
    return vec3(this.m_config.currentPageDefault.x, this.m_config.currentPageDefault.y, 0);
  }

  private GetNextPageDefaultPos() {
    return vec3(this.m_config.nextPageDefault.x, this.m_config.nextPageDefault.y, 0);
  }

  private GetNextPageMovedPos() {
    return vec3(this.m_config.nextPageMoved.x, this.m_config.nextPageMoved.y, 0);
  }

  private AdjustCertificationCode() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetCertificationCode(this.m_data.certificationCode);
  }

  private AdjustCurrentPage() {
    if (!this.m_elementsList.IsLoaded()) return;

    const rtfPage = this.m_config.infoPageToRtfPage[this.m_currentPage]!;

    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetPage(rtfPage);
  }

  private AdjustGambleCapLimit() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetGambleCapLimit(this.m_data.gambleCapLimit);
  }

  private AdjustGambleLimits() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetGambleLimits(this.m_data.gambleLimit, this.m_data.maxGambleAttempts);
  }

  private AdjustJackpotMultiplier() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetJackpotMultiplier(String(this.m_data.jackpotMultiplier));
  }

  private AdjustLanguage() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetLanguage(this.m_data.language);
  }

  private AdjustPaytable() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetPaytableTexts(this.m_data.paytableTexts);

    const fittestCurrencyToShow = this.GetFittestCurrencyType();
    this.SetCurrencyType(rtf, fittestCurrencyToShow);
  }

  private GetFittestCurrencyType() {
    const fitness: Map<ECurrencyPrize, number> = new Map([
      [ECurrencyPrize.Undefined, 0],
      [ECurrencyPrize.FreeSpinsEnergy, 1],
      [ECurrencyPrize.CoinsFreeSpinEnergy, 1],
      [ECurrencyPrize.Credits, 2],
      [ECurrencyPrize.ExtraSpinsEnergy, 3],
      [ECurrencyPrize.CoinsSpinEnergy, 4],
    ]);

    let fittest = ECurrencyPrize.Undefined;
    for (const currency of this.m_data.paytables.keys()) {
      fittest = fitness.get(fittest)! < fitness.get(currency)! ? currency : fittest;
    }
    return fittest;
  }

  private SetCurrencyType(rtf: RtfElement, currencyType: ECurrencyPrize) {
    const creditsSymbol = '€'; // EURO SIGN
    rtf.SetCurrencyType(creditsSymbol);

    switch (currencyType) {
      case ECurrencyPrize.CoinsSpinEnergy:
      case ECurrencyPrize.CoinsFreeSpinEnergy:
        rtf.AddTag(ERtfTags.eCustomCurrency);
        break;
      default:
        rtf.RemoveTag(ERtfTags.eCustomCurrency);
        break;
    }
  }

  private AdjustSerialNumber() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetSerialNumber(this.m_data.serialNumber);
  }

  private AdjustWinCappingLimit() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);
    rtf.SetWinCappingLimit(this.m_data.winCappingLimit);
  }

  private ResetInfoPage() {
    if (this.m_config.orderedInfoPages.length === 0) return;

    this.m_nextPage = this.m_config.orderedInfoPages[0];

    const rtf = this.m_elementsList.Get(RtfInfoId, RtfElement);

    rtf.RefreshPage(this.m_config.infoPageToRtfPage[this.m_nextPage]!);
    tweeny.start(this.m_actionNextPage, 'InfoView::ShowNextPage');
  }
}
