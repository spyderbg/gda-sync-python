// Egt::Game::AlphaFamily::StatusLineView (BurningHotCoinsView/Views/StatusLineView.h/.cpp): the panel's status
// line: a message (insert credit, press start, good luck...), or the winning combinations one after another: "LINE n",
// the symbols and the prize.

import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { ELeftStatusLine, ERightStatusLine, EStatusLine } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { CombinationsEqual, type ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { StatusLineVisual } from '../Visuals/StatusLineVisual';
import type { StatusLineViewConfig } from './StatusLineView.data';

const StatusLineViewId = 'StatusLineView';

const elementsNamesListPerMidStatus: Map<EStatusLine, string[]> = new Map([
  [EStatusLine.None, ['image_status_mid_none']],
  [EStatusLine.InsertCredit_NoCredit, ['image_status_mid_insert_credit']],
  [EStatusLine.InsertCredit_LessThenBet, ['image_status_mid_insert_credit_green']],
  [EStatusLine.PressStart, ['image_status_mid_press_start', 'image_status_mid_none']],
  [EStatusLine.PressStart_SelectBet, ['image_status_mid_press_start', 'image_status_mid_select_lines_and_bet']],
  [EStatusLine.SelectBet, ['image_status_mid_select_lines_and_bet', 'image_status_mid_none']],
  [EStatusLine.GoodLuck, ['image_status_mid_good_luck']],
  [EStatusLine.SelectRedBlack, ['image_status_mid_select_red_black']],
  [EStatusLine.ShowWinCombinations, ['image_status_mid_none']],
]);

const elementsNamesListPerLeftStatus: Map<ELeftStatusLine, string[]> = new Map([
  [ELeftStatusLine.None, []],
  [ELeftStatusLine.GambleCompleted, ['image_status_left_completed']],
]);

const elementsNamesListPerRightStatus: Map<ERightStatusLine, string[]> = new Map([
  [ERightStatusLine.None, []],
  [ERightStatusLine.RiskOrCashOut, ['image_status_right_gamble']],
  [ERightStatusLine.GameOver, ['image_status_right_game_over']],
]);

const ElementsAllIds = [
  'image_status_mid_none',
  'image_status_mid_insert_credit',
  'image_status_mid_insert_credit_green',
  'image_status_mid_press_start',
  'image_status_mid_select_lines_and_bet',
  'image_status_mid_good_luck',
  'image_status_mid_select_red_black',

  'image_status_left_completed',

  'image_status_right_gamble',
  'image_status_right_game_over',
];

enum AnimationCommand {
  PlayAnimations,
  PauseAnimations,
  ResumeAnimations,
}

export class StatusLineView extends BaseView implements IStatusLineView {
  protected readonly m_events = new IControlViewEvents();

  private m_statusLines: StatusLineVisual[] = [];

  private m_stateMid = EStatusLine.None;
  private m_combinationsMid: ReelCombinations = [];
  private m_isFastShownMidCombinations = false;
  private m_hasShownLine = false;
  private m_actionMid = new tweeny.tween_action();

  private m_stateRight = ERightStatusLine.None;
  private m_actionRight = new tweeny.tween_action();

  private m_stateLeft = ELeftStatusLine.None;
  private m_actionLeft = new tweeny.tween_action();

  private m_config!: StatusLineViewConfig;

  private m_lastAnimationCommand = AnimationCommand.PlayAnimations;

  private m_sentinel = new sentinel();
  private m_actionDummy = new tweeny.tween_action();

  private m_actionFastTimer = new tweeny.tween_action();

  constructor() {
    super(StatusLineViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IStatusLineView, this);
    this.RuntimeAdd(IStatusLineView.Events, this.m_events);

    this.LoadConfig();
    // when its config's file changes, what it shows is made again from it
    BrowserOnly(() => this.WatchConfig('StatusLineViewConfig', () => this.ReloadConfig()));
    this.InitElementsList(StatusLineViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    BaseVisual.ClearAll(this.m_statusLines);

    this.DeinitElementsList();

    this.RuntimeRemove(IStatusLineView);
    this.RuntimeRemove(IStatusLineView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    // init animations
    this.m_sentinel = make_sentinel();

    // hide all
    this.m_elementsList.SetHidden(true, ElementsAllIds);

    // adjust values
    this.AdjustMidStatus();
    this.AdjustLeftStatus();
    this.AdjustRightStatus();

    switch (this.m_lastAnimationCommand) {
      case AnimationCommand.PauseAnimations:
        this.PauseAnimations();
        break;
      default:
        break;
    }
  }

  Process() {
    super.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    super.Draw(drawList);
  }

  ShowStatus(state: EStatusLine) {
    if (this.m_stateMid === state) return;

    this.m_stateMid = state;

    if (!this.m_elementsList.IsLoaded()) return;
    this.AdjustMidStatus();
  }

  private AdjustMidStatus() {
    if (this.m_actionMid.is_valid()) {
      tweeny.stop_and_finish(this.m_actionMid);
    }

    if (this.m_actionFastTimer.is_valid()) {
      tweeny.stop(this.m_actionFastTimer);
    }

    BaseVisual.ClearAll(this.m_statusLines);

    switch (this.m_stateMid) {
      case EStatusLine.None:
      case EStatusLine.InsertCredit_NoCredit:
      case EStatusLine.InsertCredit_LessThenBet:
      case EStatusLine.PressStart:
      case EStatusLine.PressStart_SelectBet:
      case EStatusLine.SelectBet:
      case EStatusLine.GoodLuck:
      case EStatusLine.SelectRedBlack: {
        const actionsList: tweeny.tween_action[] = [];
        const cycleDuration = this.m_config.cycleDuration ?? 0;
        for (const visibleElementName of elementsNamesListPerMidStatus.get(this.m_stateMid)!) {
          const actionVisibleText = tweeny.delay(cycleDuration, this.m_sentinel);
          actionVisibleText.on_begin.connect(() => {
            this.m_hasShownLine = true;
            this.m_elementsList.SetHidden(false, [visibleElementName]);
          });
          actionVisibleText.on_end.connect(() => {
            this.m_elementsList.SetHidden(true, [visibleElementName]);
          });

          actionsList.push(actionVisibleText);
        }
        const actionMidSequence = tweeny.sequence(actionsList, this.m_sentinel);
        const actionMidLooped = tweeny.repeat(actionMidSequence, this.m_sentinel);
        this.m_actionMid = actionMidLooped;
        break;
      }
      case EStatusLine.ShowWinCombinations: {
        const interval = (this.m_isFastShownMidCombinations ? this.m_config.fastLineInterval : this.m_config.slowLineInterval) ?? 0;
        const lineEnd = (this.m_isFastShownMidCombinations ? this.m_config.fastLineEnd : this.m_config.slowLineEnd) ?? 0;

        if (this.m_isFastShownMidCombinations) {
          const actionFastTimer = tweeny.delay(this.m_combinationsMid.length * (this.m_config.fastLineInterval ?? 0));

          actionFastTimer.on_end.connect(() => {
            this.m_isFastShownMidCombinations = false;
            this.AdjustMidStatus();
          });

          this.m_actionFastTimer = actionFastTimer;
        }

        const actionsList: tweeny.tween_action[] = [];

        this.m_combinationsMid.forEach((combination, index) => {
          // create the combo
          const line = new StatusLineVisual(this.m_elementsList, this.m_config.visualConfig);
          line.SetCombination(combination);
          line.SetVisible(false);
          this.m_statusLines.push(line);

          // control visibility of combos
          const actionVisibleCombo = tweeny.delay(lineEnd, this.m_sentinel);
          actionVisibleCombo.on_begin.connect(() => {
            for (const winLine of this.m_statusLines) {
              winLine.SetVisible(false);
            }
            this.m_statusLines[index].SetVisible(true);
          });
          actionVisibleCombo.on_end.connect(() => {
            this.m_statusLines[index].SetVisible(false);
          });

          const actionComboInterval = tweeny.together([actionVisibleCombo, tweeny.delay(interval, this.m_sentinel)], this.m_sentinel);

          actionsList.push(actionComboInterval);
        });
        this.UpdateMidPoints();

        const actionMidSequence = tweeny.sequence_precise(actionsList, this.m_sentinel);
        const actionMidLooped = tweeny.repeat_precise(actionMidSequence, this.m_sentinel);

        this.m_actionMid = actionMidLooped;
        break;
      }
      default:
        break;
    }

    if (this.m_isFastShownMidCombinations) {
      tweeny.start(this.m_actionFastTimer);
    }

    tweeny.start(this.m_actionMid, 'StatusLineView:ActionMid');
  }

  ShowRightStatus(state: ERightStatusLine) {
    if (this.m_stateRight === state) return;

    this.m_stateRight = state;

    if (!this.m_elementsList.IsLoaded()) return;
    this.AdjustRightStatus();
  }

  /** The state's elements, shown while its action runs: a repeat of the dummy action, forever. */
  private StatusAction(elems: string[]) {
    const action = tweeny.repeat(this.m_actionDummy, this.m_sentinel, 0);
    action.on_begin.connect(() => {
      this.m_elementsList.SetHidden(false, elems);
    });
    action.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, elems);
    });
    return action;
  }

  private AdjustRightStatus() {
    if (this.m_actionRight.is_valid()) {
      tweeny.stop_and_finish(this.m_actionRight);
    }

    this.m_actionRight = this.StatusAction(elementsNamesListPerRightStatus.get(this.m_stateRight) ?? []);

    tweeny.start(this.m_actionRight, 'StatusLineView:ActionRight');
  }

  ShowLeftStatus(state: ELeftStatusLine) {
    if (this.m_stateLeft === state) return;

    this.m_stateLeft = state;

    if (!this.m_elementsList.IsLoaded()) return;
    this.AdjustLeftStatus();
  }

  private AdjustLeftStatus() {
    if (this.m_actionLeft.is_valid()) {
      tweeny.stop_and_finish(this.m_actionLeft);
    }

    this.m_actionLeft = this.StatusAction(elementsNamesListPerLeftStatus.get(this.m_stateLeft) ?? []);

    tweeny.start(this.m_actionLeft, 'StatusLineView:ActionLeft');
  }

  ShowCombinations(combinations: ReelCombinations, fast: boolean) {
    if (this.m_stateMid === EStatusLine.ShowWinCombinations && CombinationsEqual(this.m_combinationsMid, combinations)) return;

    this.m_lastAnimationCommand = AnimationCommand.PlayAnimations;
    this.m_stateMid = EStatusLine.ShowWinCombinations;
    this.m_combinationsMid = combinations;
    this.m_isFastShownMidCombinations = fast;

    if (!this.m_elementsList.IsLoaded()) return;
    this.AdjustMidStatus();
  }

  SetLanguage(language: string) {
    for (const line of this.m_statusLines) {
      line.OnLanguageChanged(language);
    }
  }

  PauseAnimations() {
    this.m_lastAnimationCommand = AnimationCommand.PauseAnimations;

    tweeny.pause(this.m_actionMid);
    tweeny.pause(this.m_actionFastTimer);
    tweeny.pause(this.m_actionRight);
    tweeny.pause(this.m_actionLeft);

    this.FreezeMidWinCombinations();
  }

  ResumeAnimations() {
    this.m_lastAnimationCommand = AnimationCommand.ResumeAnimations;

    tweeny.resume(this.m_actionMid);
    tweeny.resume(this.m_actionRight);
    tweeny.resume(this.m_actionLeft);
    tweeny.resume(this.m_actionFastTimer);
  }

  private FreezeMidWinCombinations() {
    if (this.m_stateMid !== EStatusLine.ShowWinCombinations) return;
    if (this.m_hasShownLine) return;

    this.m_statusLines.forEach((line, i) => {
      line.SetVisible(i === 0);
    });
  }

  GetConfig(): Readonly<StatusLineViewConfig> {
    return this.m_config;
  }

  private UpdateMidPoints() {
    for (const line of this.m_statusLines) {
      line.SetPositionAligned(this.m_config.midPoint ?? { x: 0, y: 0 }, this.m_config.midPointAlignment ?? Alignment.MiddleCenter);
    }
  }

  private LoadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<StatusLineViewConfig>('StatusLineViewConfig');
  }

  /** Reads its config again, when its file changed, and makes again what it shows from it, as when its elements list
   * loads.
   * @browserOnly */
  private ReloadConfig() {
    this.LoadConfig();
    this.OnElementsListLoaded();
  }
}
