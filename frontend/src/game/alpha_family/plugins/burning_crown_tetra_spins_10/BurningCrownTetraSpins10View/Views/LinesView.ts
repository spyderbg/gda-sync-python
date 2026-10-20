// Egt::Game::AlphaFamily::LinesView (BurningCrownTetraSpins10View/Views/LinesView.h/.cpp): the main reels' winning
// lines, shown one at a time: fast once (then showFastLinesFinished), then slowly, over and over.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { Delay, type TweenAction } from '../../../../../engine/GameCore/Tools/Tweeny';
import { IAudioApi, type IAudioPlayback } from '../../../../../engine/Game/RuntimeImport/IAudioApi';
import { IResources, type RssRect } from '../../../../../engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../../../../../engine/GameVideoCtrl/DrawList';
import { AnimElement } from '../../../../../engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '../../../../../engine/GameVideoCtrl/ViewElements/ImageElement';
import { CombinationType, type ERoundTags, type SymbolId, type SymbolViewInfos } from '../../../../libs/AlphaFamily/Math/Common/Common.data';
import { CombinationsEqual, type ReelCombination, type ReelCombinations } from '../../../../libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ILinesView, ILinesViewEvents, LineType } from '../../../../libs/AlphaFamily/Views/ILinesView.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { LinesVisual } from '../Visuals/LinesVisual';
import type { LinesVisualConfig } from './ReelsView.data';
import type { ReelSubScreen } from './ReelSubScreen.data';

const LinesViewId = 'LinesView';

interface LinesViewConfig extends LinesVisualConfig {
  autoPlayIdleTimer?: number;
  winFiguresDefaultSoundRssKeys?: Record<SymbolId, string>;
  winFiguresX5SoundRssKeys?: Record<SymbolId, string>;
  subScreen: ReelSubScreen;
}

export class LinesView extends BaseView implements ILinesView {
  private readonly m_events = new ILinesViewEvents();
  private m_config!: LinesViewConfig;
  private m_lines: LinesVisual[] = [];
  private m_combinations: ReelCombinations = [];
  private m_isShowFast = false;
  private m_start: number | null = null;
  private m_current = -1;
  private m_paused = false;
  private m_actionFast: TweenAction | null = null;
  private m_winPlayback: IAudioPlayback | null = null;

  constructor() {
    super(LinesViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ILinesView, this);
    this.RuntimeAdd(ILinesView.Events, this.m_events);
    this.m_config = this.RuntimeGet(IResources).GetIData<LinesViewConfig>('LinesViewConfig');
    this.InitElementsList(LinesViewId);
    return true;
  }

  Deinit() {
    this.ClearLines();
    this.DeinitElementsList();
    this.RuntimeRemove(ILinesView);
    this.RuntimeRemove(ILinesView.Events);
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    BaseVisual.DrawAll(this.m_lines, drawList);
  }

  Process() {
    super.Process();
    this.m_actionFast?.Process();
    if (this.m_start === null || this.m_paused || !this.m_lines.length) return;
    const interval = (this.m_isShowFast ? this.m_config.fastShowInterval : this.m_config.slowShowInterval) ?? 1000;
    const showEnd = (this.m_isShowFast ? this.m_config.fastShowEnd : this.m_config.slowShowEnd) ?? interval;
    const elapsed = performance.now() - this.m_start;
    const index = Math.floor(elapsed / interval) % this.m_lines.length;
    const visible = elapsed % interval < showEnd;
    if (index !== this.m_current) {
      const previous = this.m_lines[this.m_current];
      previous?.SetVisible(false);
      previous?.EnableBlinking(false);
      this.m_current = index;
      this.m_lines[index].SetVisible(true);
      this.m_lines[index].EnableBlinking(!this.m_isShowFast);
      this.PlayLineSound(index);
    } else if (!visible && this.m_lines[index].IsVisible()) {
      this.m_lines[index].SetVisible(false);
      this.m_lines[index].EnableBlinking(false);
    }
  }

  SetWinLineTags(_tags: ERoundTags[]) {}

  ShowWinLine(combination: ReelCombination, _type = LineType.eSteadyForever) {
    this.ShowCombinations([combination], true, false);
  }

  PlayWinLinesSounds(_todo_useSpecificType: string) {}

  PlayBackgroundMusic(_roundName: string) {}

  StopBackgroundMusic(_roundName: string) {}

  ShowCombinations(combinations: ReelCombinations, fast: boolean, _autoPlayEnabled: boolean) {
    if (CombinationsEqual(combinations, this.m_combinations)) return;
    this.ClearLines();
    this.m_combinations = combinations;
    this.m_isShowFast = fast;
    combinations.forEach((comb, i) => {
      if (comb.type === CombinationType.LeftToRight) {
        const config = this.m_config.lines?.[comb.id];
        const squareKey = this.m_config.winSquareRssKeys?.[comb.id];
        if (!config || !squareKey) return;
        const line = this.CreateLineVisual(comb.symbolViewInfos, squareKey, i === 0, fast);
        line.AddLineId(this.m_elementsList.Create(ImageElement, config.imageId).SetPosition(config.offset).SetScale(config.scale).GetId());
        line.AddShadowLineId(this.m_elementsList.Create(ImageElement, config.imageId).SetPosition(config.offset).SetScale(config.scale)
          .SetColor({ r: 160, g: 160, b: 160 }).GetId());
        this.m_lines.push(line);
      } else if (comb.type === CombinationType.Scatter && this.m_config.winSquareScatterRssKey) {
        this.m_lines.push(this.CreateLineVisual(comb.symbolViewInfos, this.m_config.winSquareScatterRssKey, i === 0, fast));
      }
    });
    this.AdjustVisibility();
  }

  UpdateShownCombinations(_autoPlayEnabled: boolean) {}

  StopWinLinesSounds(_reason: string) {
    this.m_winPlayback?.Stop();
    this.m_winPlayback = null;
  }

  StopAllSounds() {
    this.StopWinLinesSounds('StopAllSounds');
  }

  PauseAnimations() {
    this.m_paused = true;
    for (const line of this.m_lines) line.PauseAnimations();
  }

  ResumeAnimations() {
    this.m_paused = false;
    for (const line of this.m_lines) line.ResumeAnimations();
  }

  ClearLines() {
    this.m_actionFast?.Stop();
    BaseVisual.ClearAll(this.m_lines);
    this.m_combinations = [];
    this.m_start = null;
    this.m_current = -1;
  }

  private AdjustVisibility() {
    for (const line of this.m_lines) {
      line.SetLightsVisibility(!this.m_isShowFast);
      line.CreateBlinking(this.m_config.shadowBlinkingInterval ?? 0);
      line.SetVisible(false);
    }
    this.m_start = performance.now();
    this.m_current = -1;
    if (this.m_isShowFast) {
      this.m_actionFast?.Stop();
      this.m_actionFast = Delay(this.m_lines.length * (this.m_config.fastShowInterval ?? 1000));
      this.m_actionFast.OnEnd(() => {
        this.m_isShowFast = false;
        this.AdjustVisibility();
        this.m_events.showFastLinesFinished.Post();
        this.m_events.showCombinationsFinished.Post();
      });
      this.m_actionFast.Start();
    }
  }

  /** A line's sound: its symbol's, while the lines show fast. */
  private PlayLineSound(index: number) {
    if (!this.m_isShowFast) return;
    const combination = this.m_combinations.filter(comb => comb.type === CombinationType.LeftToRight || comb.type === CombinationType.Scatter)[index];
    const soundId = combination ? this.m_config.winFiguresDefaultSoundRssKeys?.[combination.symbolId] : '';
    if (soundId) this.m_winPlayback = this.RuntimeGet(IAudioApi).Play(soundId);
  }

  private CreateLineVisual(symbolViewInfos: SymbolViewInfos, imageId: string, first: boolean, fast: boolean) {
    const line = new LinesVisual(this.m_elementsList);
    const subScreen = this.m_config.subScreen;
    for (const viewInfo of symbolViewInfos) {
      const offset = this.m_config.winSquareOffsets?.[viewInfo.coord.rowId];
      if (!offset) continue;
      const squarePosition = { x: subScreen.reelAreaX + subScreen.reelStepX * viewInfo.coord.reelId + offset.x, y: subScreen.reelAreaY + subScreen.reelStepY * viewInfo.coord.rowId + offset.y };
      const square = this.m_elementsList.Create(ImageElement, imageId).SetPosition(squarePosition);
      line.AddSquareId(square.GetId(), () => this.CalculateSquareCutBounds(square.GetBounds()), first);
      line.AddShadowSquareId(this.m_elementsList.Create(ImageElement, imageId).SetPosition(squarePosition).SetColor({ r: 160, g: 160, b: 160 }).GetId());
      if (!this.m_config.squareLightsRssKey) continue;
      const lightsOffset = this.m_config.squareLightsOffset ?? { x: 0, y: 0 };
      line.AddLightId(this.m_elementsList.Create(AnimElement, this.m_config.squareLightsRssKey)
        .SetPosition({ x: squarePosition.x + lightsOffset.x, y: squarePosition.y + lightsOffset.y }).GetId());
    }
    line.SetLightsVisibility(!fast);
    return line;
  }

  private CalculateSquareCutBounds(bounds: RssRect): RssRect {
    const inset = this.m_config.winSquareCutInset ?? { x: 0, y: 0, w: 0, h: 0 };
    return { x: bounds.x + inset.x, y: bounds.y + inset.y, w: bounds.w - inset.w, h: bounds.h - inset.h };
  }
}
