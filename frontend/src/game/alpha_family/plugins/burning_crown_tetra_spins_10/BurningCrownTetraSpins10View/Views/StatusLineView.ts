// Egt::Game::AlphaFamily::StatusLineView (BurningCrownTetraSpins10View/Views/StatusLineView.h/.cpp, with
// Visuals/StatusLineVisual): the panel's status line: a message (insert credit, press start, good luck...), or the winning
// combinations one after another: "LINE n", the symbols and the prize.

import type { Point } from '../../../../../engine/Game/RuntimeExport/IResources';
import { IResources } from '../../../../../engine/Game/RuntimeExport/IResources';
import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { ILocalization } from '../../../../../engine/Game/RuntimeImport/ILocalization';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import type { BaseElement } from '../../../../../engine/GameVideoCtrl/ViewElements/BaseElement';
import { Alignment } from '../../../../../engine/GameVideoCtrl/ViewElements/BaseElement';
import { ImageElement } from '../../../../../engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '../../../../../engine/GameVideoCtrl/ViewElements/TextElement';
import { CombinationType, Currency, ELeftStatusLine, ERightStatusLine, EStatusLine } from '../../../../libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombination, ReelCombinations } from '../../../../libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IControlViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IStatusLineView } from '../../../../libs/AlphaFamily/Views/IStatusLineView.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';

const StatusLineViewId = 'StatusLineView';

interface StatusLinePart {
  resId: string;
  offset: Point;
  paddingLeft: number;
  paddingRight: number;
}

interface StatusLineViewConfig {
  cycleDuration: number;
  fastLineEnd: number;
  fastLineInterval: number;
  slowLineEnd: number;
  slowLineInterval: number;
  midPoint: Point;
  visualConfig: {
    combinationLineImage: StatusLinePart;
    combinationLineNumberText: StatusLinePart;
    combinationScatterImage: StatusLinePart;
    combinationSymbolImages: StatusLinePart[];
    combinationPrizeText: StatusLinePart;
  };
}

const MidStatusIds: Partial<Record<EStatusLine, string[]>> = {
  [EStatusLine.InsertCredit_NoCredit]: ['image_status_mid_insert_credit'],
  [EStatusLine.InsertCredit_LessThenBet]: ['image_status_mid_insert_credit_green'],
  [EStatusLine.PressStart]: ['image_status_mid_press_start'],
  [EStatusLine.PressStart_SelectBet]: ['image_status_mid_press_start', 'image_status_mid_select_lines_and_bet'],
  [EStatusLine.SelectBet]: ['image_status_mid_select_lines_and_bet'],
  [EStatusLine.GoodLuck]: ['image_status_mid_good_luck'],
  [EStatusLine.SelectRedBlack]: ['image_status_mid_select_red_black'],
};
const RightStatusIds: Partial<Record<ERightStatusLine, string>> = {
  [ERightStatusLine.RiskOrCashOut]: 'image_status_right_gamble',
  [ERightStatusLine.GameOver]: 'image_status_right_game_over',
};
const LeftStatusIds: Partial<Record<ELeftStatusLine, string>> = { [ELeftStatusLine.GambleCompleted]: 'image_status_left_completed' };
const AllStatusIds = [
  'image_status_mid_insert_credit', 'image_status_mid_insert_credit_green', 'image_status_mid_press_start', 'image_status_mid_select_lines_and_bet',
  'image_status_mid_good_luck', 'image_status_mid_select_red_black', 'image_status_right_gamble', 'image_status_right_game_over',
  'image_status_left_completed',
];

export class StatusLineView extends BaseView implements IStatusLineView {
  private readonly m_events = new IControlViewEvents();
  private m_config!: StatusLineViewConfig;
  private m_status = EStatusLine.None;
  private m_rightStatus = ERightStatusLine.None;
  private m_leftStatus = ELeftStatusLine.None;
  private m_combinations: ReelCombinations = [];
  private m_fast = false;
  private m_start = performance.now();
  private m_paused = false;
  private m_lineImage: ImageElement | null = null;
  private m_scatterImage: ImageElement | null = null;
  private m_lineNumber: TextElement | null = null;
  private m_prize: TextElement | null = null;
  private m_symbols: ImageElement[] = [];

  constructor() {
    super(StatusLineViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IStatusLineView, this);
    this.RuntimeAdd(IStatusLineView.Events, this.m_events);
    this.m_config = this.RuntimeGet(IResources).GetIData<StatusLineViewConfig>('StatusLineViewConfig');
    this.InitElementsList(StatusLineViewId);
    const visual = this.m_config.visualConfig;
    const lineImage = this.m_elementsList.Create(ImageElement, visual.combinationLineImage.resId);
    lineImage.SetAlignment(Alignment.TopLeft).SetHidden(true);
    this.m_lineImage = lineImage;
    const scatterImage = this.m_elementsList.Create(ImageElement, visual.combinationScatterImage.resId);
    scatterImage.SetAlignment(Alignment.TopLeft).SetHidden(true);
    this.m_scatterImage = scatterImage;
    const lineNumber = this.m_elementsList.Create(TextElement);
    lineNumber.SetStyleId(visual.combinationLineNumberText.resId);
    lineNumber.SetAlignment(Alignment.TopLeft).SetHidden(true);
    this.m_lineNumber = lineNumber;
    const prize = this.m_elementsList.Create(TextElement);
    prize.SetStyleId(visual.combinationPrizeText.resId);
    prize.SetAlignment(Alignment.TopLeft).SetHidden(true);
    this.m_prize = prize;
    this.m_symbols = [];
    for (const part of visual.combinationSymbolImages) {
      const symbol = this.m_elementsList.Create(ImageElement, part.resId);
      symbol.SetAlignment(Alignment.TopLeft).SetHidden(true);
      this.m_symbols.push(symbol);
    }
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(IStatusLineView);
    this.RuntimeRemove(IStatusLineView.Events);
    super.Deinit();
  }

  ShowStatus(state: EStatusLine) {
    if (this.m_status !== state || this.m_combinations.length) this.m_start = performance.now();
    this.m_status = state;
    this.m_combinations = [];
  }

  ShowCombinations(combinations: ReelCombinations, fast: boolean) {
    this.m_combinations = combinations;
    this.m_fast = fast;
    this.m_start = performance.now();
  }

  ShowRightStatus(state: ERightStatusLine) {
    this.m_rightStatus = state;
  }

  ShowLeftStatus(state: ELeftStatusLine) {
    this.m_leftStatus = state;
  }

  SetLanguage(_language: string) {}

  PauseAnimations() {
    this.m_paused = true;
  }

  ResumeAnimations() {
    this.m_paused = false;
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    const elapsed = this.m_paused ? 0 : performance.now() - this.m_start;
    // the messages
    this.m_elementsList.SetHidden(true, AllStatusIds);
    const mid = this.m_combinations.length ? [] : MidStatusIds[this.m_status] ?? [];
    if (mid.length) this.m_elementsList.TryGet(mid[Math.floor(elapsed / this.m_config.cycleDuration) % mid.length])?.SetHidden(false);
    const right = RightStatusIds[this.m_rightStatus];
    if (right) this.m_elementsList.TryGet(right)?.SetHidden(false);
    const left = LeftStatusIds[this.m_leftStatus];
    if (left) this.m_elementsList.TryGet(left)?.SetHidden(false);
    super.Draw(drawList);
    // the combination shown now
    if (!this.m_combinations.length) return;
    const interval = this.m_fast ? this.m_config.fastLineInterval : this.m_config.cycleDuration;
    const combination = this.m_combinations[Math.floor(elapsed / interval) % this.m_combinations.length];
    this.DrawCombination(drawList, combination);
  }

  private DrawCombination(drawList: DrawList, combination: ReelCombination) {
    const visual = this.m_config.visualConfig;
    const midPoint = this.m_config.midPoint;
    let x = midPoint.x;
    const place = (element: BaseElement | null, part: StatusLinePart) => {
      if (!element) return;
      x += part.paddingLeft;
      element.SetPosition({ x, y: midPoint.y + part.offset.y }).SetHidden(false);
      element.Draw(drawList);
      element.SetHidden(true);
      x += element.GetSize().w + part.paddingRight;
    };
    if (combination.type === CombinationType.Scatter) {
      place(this.m_scatterImage, visual.combinationScatterImage);
    } else {
      place(this.m_lineImage, visual.combinationLineImage);
      this.m_lineNumber?.SetText(String(combination.id + 1));
      place(this.m_lineNumber, visual.combinationLineNumberText);
    }
    for (const info of combination.symbolViewInfos) place(this.m_symbols[info.symbolId] ?? null, visual.combinationSymbolImages[info.symbolId]);
    this.m_prize?.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(combination.rewards.Get(Currency.Credits)));
    place(this.m_prize, visual.combinationPrizeText);
  }
}
