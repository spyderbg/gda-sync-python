// Egt::Game::AlphaFamily::InfoView (BurningCrownTetraSpins10InfoView/InfoView.h/.cpp): the help pages on the info
// screen. Its rtf_info element (InfoView.json) draws the RTF page of the current kind of page (InfoViewConfig); Info
// slides the next page in, in the config's order, and an idle non-main page returns to the main one. The page shows
// the game's stakes: each paytable figure's win at the bet per line, the win capping limit, the certification code...

import type { RoundType } from '../../../libs/AlphaFamily/Math/Common/Common.data';
import { RoundType as RoundTypes } from '../../../libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '../../../libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ECurrencyPrize, type IInfoView, IInfoView as IInfoViewToken, IInfoViewEvents, type PaytableCoefficients } from '../../../libs/AlphaFamily/Views/IInfoView.bridge';
import { EInfoViewPageType } from '../../../libs/AlphaFamily/Views/IInfoView.data';
import { BaseView } from '../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { IResources } from '../../../../engine/Game/RuntimeExport/IResources';
import { ILocalization } from '../../../../engine/Game/RuntimeImport/ILocalization';
import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import { Stopwatch } from '../../../../engine/GameCore/Tools/Timers';
import { MoveFromTo, type Position, type TweenAction } from '../../../../engine/GameCore/Tools/Tweeny';
import type { DrawList } from '../../../../engine/GameVideoCtrl/DrawList';
import { ERtfTags, FigureKeyString, type PaytableFiguresTextType, RtfElement } from '../../../../engine/GameVideoCtrl/ViewElements/RtfElement';
import { InfoViewConfig } from './InfoView.data';

const InfoViewId = 'InfoView';
const RtfInfoId = 'rtf_info';

interface InfoViewDataImpl {
  certificationCode: string;
  language: string;
  serialNumber: string;
  betPerLine: number;
  lines: number;
  figureNames: Map<number, string>;
  paytables: Map<ECurrencyPrize, PaytableCoefficients>;
  paytableTexts: PaytableFiguresTextType;
  gambleLimit: string;
  maxGambleAttempts: string;
  jackpotMultiplier: number;
  gambleCapLimit: string;
  winCappingLimit: string;
}

// gameToRtfLanguages: the RTF Tool's language names, of the languages a game is played in.
const gameToRtfLanguages = new Map([
  ['en-GB', 'English'], ['el-GR', 'Greek'], ['bg-BG', 'Bulgarian'], ['cs-CZ', 'Czech'], ['de-DE', 'German'], ['es-ES', 'Spanish'],
  ['fr-FR', 'French'], ['hr-HR', 'Croatian'], ['hu-HU', 'Hungarian'], ['it-IT', 'Italian'], ['mk-MK', 'Macedonian'], ['pl-PL', 'Polish'],
  ['pt-PT', 'Portuguese'], ['ru-RU', 'Russian'], ['ro-RO', 'Romanian'], ['sk-SK', 'Slovak'], ['sl-SI', 'Slovenian'], ['sr-RS', 'Serbian'],
  ['tr-TR', 'Turkish'], ['uk-UA', 'Ukrainian'],
]);

function ConvertGameToRtfLanguage(language: string) {
  return gameToRtfLanguages.get(language) ?? '';
}

/** Each figure's win in the paytables, by its name, count and multiplier: what the RTF's paytable figures show. */
function CreatePaytableFiguresText(betPerLine: number, lines: number, paytables: Map<ECurrencyPrize, PaytableCoefficients>, scatterFigures: Set<number>,
  figureNames: Map<number, string>, gameMultipliers: number[], localization: ILocalization): PaytableFiguresTextType {
  const paytableFiguresText: PaytableFiguresTextType = new Map();
  const formatCreditWinText = (isScatter: boolean, winCoefficient: number, gameMultiplier: number, divider: number) => {
    let winCents = winCoefficient * betPerLine * (isScatter ? lines : 1);
    winCents *= gameMultiplier;
    winCents = Math.trunc(winCents / divider);
    return localization.FormatNumber(winCents);
  };
  const addFormattersForPaytable = (paytable: PaytableCoefficients) => {
    const multipliers = gameMultipliers.length ? gameMultipliers : [1];
    for (const [figureId, figureWinCoefficients] of paytable) {
      figureWinCoefficients.forEach((winCoef, winFigureCount) => {
        if (winCoef === 0) return;
        for (const gameMultiplier of multipliers) {
          const key = { name: figureNames.get(figureId) ?? '', count: winFigureCount, multiplier: gameMultiplier };
          paytableFiguresText.set(FigureKeyString(key), formatCreditWinText(scatterFigures.has(figureId), winCoef, key.multiplier, 1));
        }
      });
    }
  };
  // add formatters for credit wins, then for coin spin wins
  const creditPaytable = paytables.get(ECurrencyPrize.Credits);
  if (creditPaytable) addFormattersForPaytable(creditPaytable);
  const coinSpinPaytable = paytables.get(ECurrencyPrize.CoinsSpinEnergy);
  if (coinSpinPaytable) addFormattersForPaytable(coinSpinPaytable);
  return paytableFiguresText;
}

export class InfoView extends BaseView implements IInfoView {
  private readonly m_events = new IInfoViewEvents();
  private m_config = InfoViewConfig();
  private readonly m_data: InfoViewDataImpl = {
    certificationCode: 'TEST : CUSTOM CERTIFICATION CODE', language: 'English', serialNumber: 'TEST: SERIAL NUMBER', betPerLine: 1, lines: 1,
    figureNames: new Map(), paytables: new Map(), paytableTexts: new Map(), gambleLimit: '', maxGambleAttempts: '', jackpotMultiplier: 0,
    gambleCapLimit: '', winCappingLimit: '',
  };
  private m_currentPage = EInfoViewPageType.Main;
  private m_nextPage = EInfoViewPageType.Undefined;
  private readonly m_currentPageTransform: Position = { x: 0, y: 0 };
  private readonly m_nextPageTransform: Position = { x: 0, y: 0 };
  private m_actionNextPage: TweenAction | null = null;
  private readonly m_infoIdleStopwatch = new Stopwatch();
  private m_shouldUseTimer = false;

  constructor() {
    super(InfoViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IInfoViewToken, this);
    this.RuntimeAdd(IInfoViewToken.Events, this.m_events);
    this.InitElementsList(InfoViewId, () => this.OnElementsListLoaded());
    this.m_infoIdleStopwatch.Pause();
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
    this.m_config = InfoViewConfig(this.RuntimeGet(IResources).GetIData<Record<string, unknown>>('InfoViewConfig'));
  }

  private InitAnimations() {
    this.m_actionNextPage = MoveFromTo(this.m_nextPageTransform, this.GetNextPageDefaultPos(), this.GetNextPageMovedPos(), this.m_config.changePageDuration)
      .OnEnd(() => {
        this.ShowPage(this.m_nextPage);
        this.m_nextPage = EInfoViewPageType.Undefined;
        Object.assign(this.m_currentPageTransform, this.GetCurrentPageDefaultPos());
      });
    Object.assign(this.m_currentPageTransform, this.GetCurrentPageDefaultPos());
  }

  Deinit() {
    this.RuntimeRemove(IInfoViewToken);
    this.RuntimeRemove(IInfoViewToken.Events);
    this.m_actionNextPage?.Stop();
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    this.m_actionNextPage?.Process();
    if (this.m_config.idleReturnToMainMs > 0 && this.m_nextPage === EInfoViewPageType.Undefined && this.m_currentPage !== EInfoViewPageType.Main
      && this.m_infoIdleStopwatch.IsRunning() && this.m_infoIdleStopwatch.Measure() >= this.m_config.idleReturnToMainMs) {
      this.ResetInfoPage();
      this.m_infoIdleStopwatch.Reset();
      this.m_infoIdleStopwatch.Pause();
    }
  }

  private Rtf() {
    return this.m_elementsList.TryGet(RtfInfoId, RtfElement);
  }

  Draw(drawList: DrawList) {
    const rtf = this.Rtf();
    if (!rtf) return;
    // Draw all elements
    if (this.m_currentPage !== EInfoViewPageType.Undefined) {
      drawList.push_transform(this.m_currentPageTransform);
      rtf.DrawPage(this.m_config.infoPageToRtfPage.get(this.m_currentPage) ?? '', drawList);
      drawList.pop_transform();
    }
    if (this.m_nextPage !== EInfoViewPageType.Undefined) {
      drawList.push_transform(this.m_nextPageTransform);
      rtf.DrawPage(this.m_config.infoPageToRtfPage.get(this.m_nextPage) ?? '', drawList);
      drawList.pop_transform();
    }
    for (const element of this.m_elementsList.Elements()) if (element.GetId() !== RtfInfoId) element.Draw(drawList);
  }

  /** The kind of page shown, and the one sliding in, for the page around the game. */
  GetPages() {
    return { current: this.m_currentPage, next: this.m_nextPage };
  }

  ShowRoundInfo(roundType: RoundType, idleChange: boolean) {
    const typeConversion = new Map([[RoundTypes.Main, EInfoViewPageType.Main], [RoundTypes.Coins, EInfoViewPageType.Main], [RoundTypes.Tetra, EInfoViewPageType.Main]]);
    const infoPage = typeConversion.get(roundType) ?? EInfoViewPageType.Main;
    this.m_shouldUseTimer = idleChange && (roundType === RoundTypes.Main || roundType === RoundTypes.Coins);
    if (this.m_shouldUseTimer) {
      this.m_infoIdleStopwatch.Reset();
      this.m_infoIdleStopwatch.Resume();
    } else {
      this.m_infoIdleStopwatch.Pause();
    }
    if (this.m_currentPage === infoPage || this.m_nextPage === infoPage) return;
    this.TransitionToPage(infoPage);
  }

  private TransitionToPage(page: EInfoViewPageType) {
    // transition to page should be absolute
    if (this.m_actionNextPage?.IsRunning()) {
      this.m_actionNextPage.Stop();
      this.m_nextPage = EInfoViewPageType.Undefined;
    }
    if (this.m_currentPage === page || this.m_nextPage === page) return;
    const canAnimate = this.m_elementsList.IsLoaded() && this.m_currentPage !== EInfoViewPageType.Undefined
      && this.m_nextPage === EInfoViewPageType.Undefined && this.m_config.infoPageToRtfPage.has(page);
    if (canAnimate) {
      this.m_nextPage = page;
      this.Rtf()?.RefreshPage(this.m_config.infoPageToRtfPage.get(this.m_nextPage)!);
      this.m_actionNextPage?.Start();
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
    const ordered = this.m_config.orderedInfoPages;
    if (!ordered.length) return;
    const index = ordered.indexOf(this.m_currentPage);
    this.m_nextPage = index < 0 || this.m_currentPage === ordered[ordered.length - 1] ? ordered[0] : ordered[index + 1];
    if (!this.m_elementsList.IsLoaded()) return;
    this.Rtf()?.RefreshPage(this.m_config.infoPageToRtfPage.get(this.m_nextPage) ?? '');
    this.m_actionNextPage?.Start();
  }

  SetStakes(totalBet: number, lines: number) {
    this.m_data.betPerLine = Math.trunc(totalBet / lines);
    this.m_data.lines = lines;
  }

  SetPaytables(paytables: Map<ECurrencyPrize, PaytableCoefficients>, scatterFigures: Set<number>, figureNames: Map<number, string>, gameMultipliers: number[]) {
    this.m_data.figureNames = figureNames;
    this.m_data.paytables = paytables;
    this.m_data.paytableTexts = CreatePaytableFiguresText(this.m_data.betPerLine, this.m_data.lines, paytables, scatterFigures, figureNames,
      gameMultipliers, this.RuntimeGetConst(ILocalization));
    this.AdjustPaytable();
  }

  SetGambleLimits(gambleLimit: number, maxGambleAttempts: number) {
    this.m_data.gambleLimit = this.RuntimeGetConst(ILocalization).FormatCurrency(gambleLimit);
    this.m_data.maxGambleAttempts = String(maxGambleAttempts);
    this.AdjustGambleLimits();
  }

  SetCertificationCode(certificationCode: string) {
    this.Rtf()?.SetCertificationCode(certificationCode);
  }

  SetLanguage(language: string) {
    this.m_data.language = ConvertGameToRtfLanguage(language);
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
    if (!this.m_elementsList.IsLoaded() || !this.m_config.showWinCombination) return;
    const rtf = this.Rtf();
    for (const combination of combinations) {
      const factors = combination.multipliers.data.map(multiplier => multiplier.factor);
      const multiplier = factors.length ? Math.max(...factors) : 1;
      rtf?.ShowWinLine(this.m_data.figureNames.get(combination.symbolId) ?? 'Unknown', combination.symbolCount, multiplier);
    }
  }

  HideWins() {
    this.Rtf()?.HideWins(true);
  }

  StopAnimation(_animId: string) {}

  StartAnimation(_animId: string) {}

  private GetCurrentPageDefaultPos() {
    return { ...this.m_config.currentPageDefault };
  }

  private GetNextPageDefaultPos() {
    return { ...this.m_config.nextPageDefault };
  }

  private GetNextPageMovedPos() {
    return { ...this.m_config.nextPageMoved };
  }

  private AdjustCertificationCode() {
    this.Rtf()?.SetCertificationCode(this.m_data.certificationCode);
  }

  private AdjustCurrentPage() {
    if (!this.m_elementsList.IsLoaded()) return;
    const rtfPage = this.m_config.infoPageToRtfPage.get(this.m_currentPage);
    if (rtfPage) this.Rtf()?.SetPage(rtfPage);
    this.m_events.pageShown.Post();
  }

  private AdjustGambleCapLimit() {
    this.Rtf()?.SetGambleCapLimit(this.m_data.gambleCapLimit);
  }

  private AdjustGambleLimits() {
    this.Rtf()?.SetGambleLimits(this.m_data.gambleLimit, this.m_data.maxGambleAttempts);
  }

  private AdjustJackpotMultiplier() {
    this.Rtf()?.SetJackpotMultiplier(String(this.m_data.jackpotMultiplier));
  }

  private AdjustLanguage() {
    this.Rtf()?.SetLanguage(this.m_data.language);
  }

  private AdjustPaytable() {
    const rtf = this.Rtf();
    if (!rtf) return;
    rtf.SetPaytableTexts(this.m_data.paytableTexts);
    this.SetCurrencyType(rtf, this.GetFittestCurrencyType());
  }

  private GetFittestCurrencyType() {
    const fitness = new Map([
      [ECurrencyPrize.Undefined, 0], [ECurrencyPrize.FreeSpinsEnergy, 1], [ECurrencyPrize.CoinsFreeSpinEnergy, 1], [ECurrencyPrize.Credits, 2],
      [ECurrencyPrize.ExtraSpinsEnergy, 3], [ECurrencyPrize.CoinsSpinEnergy, 4],
    ]);
    let fittest = ECurrencyPrize.Undefined;
    for (const currency of this.m_data.paytables.keys()) fittest = (fitness.get(fittest) ?? 0) < (fitness.get(currency) ?? 0) ? currency : fittest;
    return fittest;
  }

  private SetCurrencyType(rtf: RtfElement, currencyType: ECurrencyPrize) {
    rtf.SetCurrencyType('€'); // EURO SIGN
    if (currencyType === ECurrencyPrize.CoinsSpinEnergy || currencyType === ECurrencyPrize.CoinsFreeSpinEnergy) rtf.AddTag(ERtfTags.eCustomCurrency);
    else rtf.RemoveTag(ERtfTags.eCustomCurrency);
  }

  private AdjustSerialNumber() {
    this.Rtf()?.SetSerialNumber(this.m_data.serialNumber);
  }

  private AdjustWinCappingLimit() {
    this.Rtf()?.SetWinCappingLimit(this.m_data.winCappingLimit);
  }

  private ResetInfoPage() {
    if (!this.m_config.orderedInfoPages.length) return;
    this.m_nextPage = this.m_config.orderedInfoPages[0];
    this.Rtf()?.RefreshPage(this.m_config.infoPageToRtfPage.get(this.m_nextPage) ?? '');
    this.m_actionNextPage?.Start();
  }
}
