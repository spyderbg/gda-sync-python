// Egt::Game::AlphaFamily::TetraRoundView (BurningCrownTetraSpins10View/Views/TetraRoundView.h/.cpp): the tetra round's
// four sub screens of five reels, their lines, win figures, flying crowns, dimming and wins.

import type { Point, RssRect } from '@game/engine/Game/RuntimeExport/IResources';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { CombinationType, type Reels, type SymbolGrid, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ITetraRoundView, ITetraRoundViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BaseVisual } from '../Visuals/BaseVisual';
import { DimSubScreenVisual } from '../Visuals/DimSubScreenVisual';
import { FlyingSymbolsVisual } from '../Visuals/FlyingSymbolsVisual';
import { LinesVisual } from '../Visuals/LinesVisual';
import { ReelVisual } from '../Visuals/ReelVisual';
import { WinFigureVisual } from '../Visuals/WinFiguresVisual';
import { WinValueVisual } from '../Visuals/WinValueVisual';
import type { BaseReelsView } from './BaseReelsView';
import { ECategory, type ReelsViewConfig } from './ReelsView.data';

const TetraRoundViewId = 'TetraRoundView';
const SoundFlyingCrownId = 'SOUND_TETRA_FLYING_CROWN';
const SoundLineId = 'SOUND_TETRA_LINE';
const SoundWinId = 'SOUND_TETRA_WIN';
const SoundWinCreditId = 'SOUND_TETRA_WIN_CREDIT';

interface LinesAnimation {
  blink: tweeny.tween_action;
  showTimer: tweeny.tween_action; // one full pass over the lines of the sub screen
  showFast: boolean;
  finishedPosted: boolean;
  pendingClear: boolean; // clear once the line on screen has played out
}

export class TetraRoundView extends BaseView implements ITetraRoundView, BaseReelsView {
  protected readonly m_events = new ITetraRoundViewEvents();
  protected m_stopFigures: SymbolGrid = [];
  protected m_config!: ReelsViewConfig;
  protected m_reels: ReelVisual[] = [];
  protected m_flyingSymbols: FlyingSymbolsVisual[] = [];
  protected m_lines: LinesVisual[] = [];
  protected m_winFigures: WinFigureVisual[] = [];
  protected m_dimSubScreens: DimSubScreenVisual[] = [];
  protected m_winValues: WinValueVisual[] = [];
  protected m_linesAnimations: LinesAnimation[] = []; // [sub screen index]
  protected m_sentinel = new sentinel();
  protected m_lastTickTime: number | null = null;
  protected m_allStopDelay: Stopwatch | null = null;
  protected m_dimmedDelay: Stopwatch | null = null;
  protected m_flyingSymbolTimer: Stopwatch | null = null;
  protected m_pendingAllReelingSound = false;
  protected m_allReelingPlayback: IAudioPlayback | null = null;
  protected m_attractionPlayback: IAudioPlayback | null = null;

  constructor() {
    super(TetraRoundViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ITetraRoundView, this);
    this.RuntimeAdd(ITetraRoundView.Events, this.m_events);
    this.LoadConfig();
    this.m_linesAnimations = this.m_config.subScreensConfig.subScreens.map(() => ({
      blink: new tweeny.tween_action(), showTimer: new tweeny.tween_action(), showFast: false, finishedPosted: false, pendingClear: false,
    }));
    this.m_sentinel = make_sentinel();
    this.InitElementsList(TetraRoundViewId);
    super.SetVisible(false);
    this.m_config.subScreensConfig.subScreens.forEach((_, subScreenIdx) => {
      const dimVisual = new DimSubScreenVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.dimSubScreenConfig);
      dimVisual.SetSubScreenIdx(subScreenIdx);
      this.m_dimSubScreens.push(dimVisual);
      const winValueVisual = new WinValueVisual(this.m_elementsList);
      winValueVisual.SetSubScreenIdx(subScreenIdx);
      this.m_winValues.push(winValueVisual);
    });
    return true;
  }

  Deinit() {
    this.Clear();
    this.m_linesAnimations = [];
    for (const visuals of [this.m_reels, this.m_flyingSymbols, this.m_lines, this.m_winFigures, this.m_dimSubScreens, this.m_winValues]) BaseVisual.ClearAll(visuals);
    this.DeinitElementsList();
    this.RuntimeRemove(ITetraRoundView);
    this.RuntimeRemove(ITetraRoundView.Events);
    super.Deinit();
  }

  Process() {
    const tick = this.m_config.reelingParamsConfig.tickDuration;
    if (this.m_lastTickTime !== null) {
      const now = performance.now();
      if (now - this.m_lastTickTime > 1000) this.m_lastTickTime = now - tick;
      while (this.m_lastTickTime + tick < now) {
        this.m_lastTickTime += tick;
        for (const reel of this.m_reels) reel.Process();
      }
    }
    if (this.m_allStopDelay && this.m_allStopDelay.Measure() > this.m_config.reelingParamsConfig.allStoppedDelay) {
      this.m_events.allReelsStopEvent.Post();
      this.m_allReelingPlayback?.Stop();
      this.m_allReelingPlayback = null;
      this.m_pendingAllReelingSound = false;
      this.m_allStopDelay = null;
    }
    if (this.m_dimmedDelay && this.m_dimmedDelay.Measure() > 50) {
      this.m_events.dimFinished.Post();
      this.m_dimmedDelay = null;
    }
    if (this.m_flyingSymbolTimer && this.m_flyingSymbolTimer.Measure() > (this.m_config.flyingSymbolsConfig.flyingTimeMS ?? 0)) {
      this.m_flyingSymbolTimer = null;
      this.m_events.flyAnimationEndEvent.Post();
    }
    super.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    BaseVisual.DrawAll(this.m_reels, drawList);
    BaseVisual.DrawAll(this.m_flyingSymbols, drawList);
    BaseVisual.DrawAll(this.m_winFigures, drawList);
    BaseVisual.DrawAll(this.m_lines, drawList);
    BaseVisual.DrawAll(this.m_dimSubScreens, drawList);
    BaseVisual.DrawAll(this.m_winValues, drawList);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    if (!visible) this.StopAttractionSound();
    for (const winValue of this.m_winValues) winValue.SetVisible(visible);
  }

  SetupFakeReels(_subScreenIdx: number, reels: Reels) {
    const subScreens = this.m_config.subScreensConfig.subScreens.length;
    if (!subScreens) return;
    const size = reels.length;
    for (let idx = 0; idx < subScreens; idx++) {
      for (let reelIdx = 0; reelIdx < size; reelIdx++) {
        const i = idx * size + reelIdx;
        if (!this.m_reels[i]) {
          const reel = new ReelVisual(this.m_elementsList, i, this, this.m_config.subScreensConfig);
          reel.SetIdx(reelIdx);
          reel.SetSubScreenIdx(idx);
          reel.SetWildId(this.m_config.reelingParamsConfig.wildSymbolId);
          this.m_reels[i] = reel;
        }
      }
    }
    this.m_reels.length = size * subScreens;
    for (let idx = 0; idx < subScreens; idx++) reels.forEach((reel, reelIndex) => this.m_reels[idx * size + reelIndex].SetFakeSymbols(reel));
  }

  StartReeling() {
    if (this.GetStoppedReelIds().length < this.m_reels.length) return; // not all reels have stopped
    this.m_stopFigures = [];
    this.ClearAllFlyingSymbols();
    this.m_events.startReelingEvent.Post();
    this.m_lastTickTime = performance.now();
    for (const reel of this.m_reels) reel.StartReeling();
    this.m_linesAnimations.forEach((_, subScreenIdx) => this.ClearCombinations(subScreenIdx));
    for (const winValue of this.m_winValues) winValue.Clear();
    for (const dimVisual of this.m_dimSubScreens) dimVisual.SetDimmed(false);
    this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.startReelingSoundId);
  }

  SetStopFigures(subScreenIdx: number, symbolGrid: SymbolGrid) {
    const subScreensSize = this.GetReelsCount(subScreenIdx);
    symbolGrid.forEach((column, i) => {
      this.m_reels[subScreenIdx * subScreensSize + i]?.SetStopSymbols(column);
      this.m_stopFigures.push([...column]);
    });
  }

  SetSymbolsAroundStop(subScreenIdx: number, before: SymbolGrid, after: SymbolGrid) {
    const subScreensSize = this.GetReelsCount(subScreenIdx);
    before.forEach((column, i) => this.m_reels[subScreenIdx * subScreensSize + i]?.SetSymbolsBeforeStop(column));
    after.forEach((column, i) => this.m_reels[subScreenIdx * subScreensSize + i]?.SetSymbolsAfterStop(column));
  }

  StartNormalReelingStop(subScreenIdx: number, reelIdx: number) {
    this.m_reels[subScreenIdx * this.GetReelsCount(subScreenIdx) + reelIdx]?.NormalStop();
  }

  StartFastReelingStop(subScreenIdx: number) {
    for (const reel of this.m_reels) if (reel.GetSubScreenIdx() === subScreenIdx) reel.FastStop();
    this.m_pendingAllReelingSound = true;
    this.m_events.allReelsStopEvent.Post();
  }

  ShowCombinations(subScreenIdx: number, combinations: ReelCombinations, fast: boolean, _autoPlay: boolean) {
    const subScreen = this.m_config.subScreensConfig.subScreens[subScreenIdx];
    if (!subScreen || !this.m_linesAnimations[subScreenIdx]) return;
    this.ClearCombinations(subScreenIdx);
    const linesConfig = this.m_config.linesConfig;
    this.m_linesAnimations[subScreenIdx].showFast = fast;
    combinations.forEach((comb, i) => {
      if (comb.type === CombinationType.LeftToRight) {
        const config = linesConfig.lines?.[comb.id];
        const squareKey = linesConfig.winSquareRssKeys?.[comb.id];
        if (!config || !squareKey) return;
        const line = this.CreateLineVisual(subScreenIdx, comb.symbolViewInfos, squareKey, i === 0, fast);
        const position = { x: subScreen.reelAreaX + config.offset.x, y: subScreen.reelAreaY + config.offset.y };
        line.AddLineId(this.m_elementsList.Create(ImageElement, config.imageId).SetPosition(position).SetScale(config.scale).GetId());
        line.AddShadowLineId(this.m_elementsList.Create(ImageElement, config.imageId).SetPosition(position).SetScale(config.scale)
          .SetColor({ r: 160, g: 160, b: 160 }).GetId());
        this.m_lines.push(line);
      } else if (comb.type === CombinationType.Scatter && linesConfig.winSquareScatterRssKey) {
        this.m_lines.push(this.CreateLineVisual(subScreenIdx, comb.symbolViewInfos, linesConfig.winSquareScatterRssKey, i === 0, fast));
      }
    });
    this.CreateWinFigures(subScreenIdx, combinations);
    if (combinations.length) this.RuntimeGet(IAudioApi).Play(SoundWinId);
    this.AdjustLinesVisibility(subScreenIdx);
  }

  StartFastCombinationsStop(subScreenIdx: number) {
    if (!this.m_linesAnimations[subScreenIdx]) return;
    if (!this.m_lines.some(line => line.GetSubScreenIdx() === subScreenIdx)) {
      this.ClearCombinations(subScreenIdx);
      return;
    }
    this.m_linesAnimations[subScreenIdx].pendingClear = true;
  }

  ClearCombinations(subScreenIdx: number) {
    this.ClearLines(subScreenIdx);
    this.ClearWinFigures(subScreenIdx);
  }

  SetDimmed(subScreenIdx: number, dimmed: boolean) {
    this.m_dimSubScreens[subScreenIdx]?.SetDimmed(dimmed);
    this.m_dimmedDelay = new Stopwatch();
  }

  SetWinValue(subScreenIdx: number, credits: number) {
    const winValue = this.m_winValues[subScreenIdx];
    if (!winValue) return;
    winValue.SetWinValue(credits);
    winValue.SetVisible(true);
    if (credits > 0) this.RuntimeGet(IAudioApi).Play(SoundWinCreditId);
  }

  Clear() {}

  private ClearFlyingSymbols(subScreenIdx: number, reelIdx: number) {
    this.m_flyingSymbols = this.m_flyingSymbols.filter(visual => {
      if (visual.GetEndSubScreen() !== subScreenIdx || visual.GetIdx() !== reelIdx) return true;
      visual.Clear();
      return false;
    });
  }

  private ClearAllFlyingSymbols() {
    BaseVisual.ClearAll(this.m_flyingSymbols);
  }

  SetTetraFlyingSymbols(subScreenIdx: number, symbolGrid: SymbolGrid) {
    const subScreensSize = this.GetReelsCount(subScreenIdx);
    const flyingSymbolData = this.m_config.flyingSymbolsConfig.flyingSymbolData ?? [];
    const flyingTime = this.m_config.flyingSymbolsConfig.flyingTimeMS ?? 0;
    const subScreens = this.m_config.subScreensConfig.subScreens;
    const visibleCols = this.m_config.subScreensConfig.visibleCols;
    symbolGrid.forEach((column, i) => {
      const idx = subScreenIdx * subScreensSize + i;
      column.forEach((symbolId, symbolIndex) => {
        const data = flyingSymbolData.find(item => item.id === symbolId);
        if (!data) return;
        // a crown that was on the previous screen's same cell has flown here already
        if (idx >= visibleCols && this.m_stopFigures[idx - visibleCols]?.[symbolIndex] === symbolId) return;
        const start = subScreens[subScreenIdx];
        const from = { x: start.reelAreaX + start.reelStepX * i + start.reelStepX / 2, y: start.reelAreaY + start.reelStepY * symbolIndex + start.reelStepY / 2 };
        for (let index = subScreenIdx + 1; index < subScreens.length; ++index) {
          const end = subScreens[index];
          const to = { x: end.reelAreaX + end.reelStepX * i + end.reelStepX / 2, y: end.reelAreaY + end.reelStepY * symbolIndex + end.reelStepY / 2 };
          const visual = new FlyingSymbolsVisual(this.m_elementsList);
          visual.AddAnimation([from, to], data, flyingTime);
          visual.SetStartingSubScreen(subScreenIdx);
          visual.SetEndSubScreen(index);
          visual.SetIdx(i);
          this.m_flyingSymbols.push(visual);
        }
      });
    });
  }

  StartFlyingAnimation(subScreenIdx: number) {
    let hasStartedAnimation = false;
    for (const visual of this.m_flyingSymbols) hasStartedAnimation = visual.StartAnimation(subScreenIdx) || hasStartedAnimation;
    if (hasStartedAnimation) {
      this.RuntimeGet(IAudioApi).Play(SoundFlyingCrownId);
      this.m_flyingSymbolTimer = new Stopwatch();
    } else {
      this.m_events.flyAnimationEndEvent.Post();
    }
  }

  private CreateLineVisual(subScreenIdx: number, symbolViewInfos: SymbolViewInfos, imageId: string, first: boolean, fast: boolean) {
    const line = new LinesVisual(this.m_elementsList);
    line.SetSubScreenIdx(subScreenIdx);
    const subScreen = this.m_config.subScreensConfig.subScreens[subScreenIdx];
    const linesConfig = this.m_config.linesConfig;
    for (const viewInfo of symbolViewInfos) {
      const offset = linesConfig.winSquareOffsets?.[viewInfo.coord.rowId];
      if (!offset) continue;
      const squarePosition: Point = { x: subScreen.reelAreaX + subScreen.reelStepX * viewInfo.coord.reelId + offset.x, y: subScreen.reelAreaY + subScreen.reelStepY * viewInfo.coord.rowId + offset.y };
      const square = this.m_elementsList.Create(ImageElement, imageId).SetPosition(squarePosition);
      line.AddSquareId(square.GetId(), () => this.CalculateSquareCutBounds(square.GetBounds()), first);
      line.AddShadowSquareId(this.m_elementsList.Create(ImageElement, imageId).SetPosition(squarePosition).SetColor({ r: 160, g: 160, b: 160 }).GetId());
      if (!linesConfig.squareLightsRssKey) continue;
      const lightsOffset = linesConfig.squareLightsOffset ?? { x: 0, y: 0 };
      const light = this.m_elementsList.Create(AnimElement, linesConfig.squareLightsRssKey)
        .SetPosition({ x: squarePosition.x + lightsOffset.x, y: squarePosition.y + lightsOffset.y }).SetScale(linesConfig.squareLightsScale);
      line.AddLightId(light.GetId());
    }
    line.SetLightsVisibility(!fast);
    return line;
  }

  private CalculateSquareCutBounds(bounds: RssRect): RssRect {
    const inset = this.m_config.linesConfig.winSquareCutInset ?? { x: 0, y: 0, w: 0, h: 0 };
    return { x: bounds.x + inset.x, y: bounds.y + inset.y, w: bounds.w - inset.w, h: bounds.h - inset.h };
  }

  private GetSubScreenLines(subScreenIdx: number) {
    return this.m_lines.filter(line => line.GetSubScreenIdx() === subScreenIdx);
  }

  private AdjustLinesVisibility(subScreenIdx: number) {
    const animation = this.m_linesAnimations[subScreenIdx];

    if (animation.blink.is_valid()) {
      tweeny.stop_and_finish(animation.blink);
    }

    const linesConfig = this.m_config.linesConfig;

    const interval = (animation.showFast ? linesConfig.fastShowInterval : linesConfig.slowShowInterval) ?? 0;
    const showEnd = (animation.showFast ? linesConfig.fastShowEnd : linesConfig.slowShowEnd) ?? 0;

    const lines = this.GetSubScreenLines(subScreenIdx);

    // one full pass over the lines, in whichever mode we are in - a fast pass hands over to the slow
    // cycling, and either way the round is told the combinations have been shown once
    if (!animation.finishedPosted) {
      const showInterval = (animation.showFast ? linesConfig.fastShowInterval : linesConfig.slowShowInterval) ?? 0;
      const actionEndTime = tweeny.delay(lines.length * showInterval, this.m_sentinel);

      actionEndTime.on_end.connect(() => {
        const state = this.m_linesAnimations[subScreenIdx];
        state.finishedPosted = true;

        if (state.showFast) {
          state.showFast = false;
          this.AdjustLinesVisibility(subScreenIdx);
        }

        this.m_events.showCombinationsFinished.Post(subScreenIdx);
      });

      animation.showTimer = actionEndTime;
    }

    const actionsList: tweeny.tween_action[] = [];

    for (const line of lines) {
      line.SetLightsVisibility(!animation.showFast);
      line.CreateBlinking(linesConfig.shadowBlinkingInterval ?? 0);

      const actionVisibleCombo = tweeny.delay(showEnd, this.m_sentinel);
      const blink = !animation.showFast;
      actionVisibleCombo.on_begin.connect(() => {
        line.SetVisible(true);
        line.EnableBlinking(blink);

        if (!this.m_linesAnimations[subScreenIdx].finishedPosted) {
          this.RuntimeGet(IAudioApi).Play(SoundLineId);
        }
      });
      actionVisibleCombo.on_end.connect(() => {
        line.SetVisible(false);
        line.EnableBlinking(false);

        if (this.m_linesAnimations[subScreenIdx].pendingClear) {
          this.ClearCombinations(subScreenIdx);
        }
      });

      const actionComboInterval = tweeny.together([actionVisibleCombo, tweeny.delay(interval, this.m_sentinel)], this.m_sentinel);

      actionsList.push(actionComboInterval);
    }

    const actionSequence = tweeny.sequence_precise(actionsList, this.m_sentinel);
    const actionLooped = tweeny.repeat_precise(actionSequence, this.m_sentinel);

    animation.blink = actionLooped;

    tweeny.start(animation.blink, 'TetraRoundView:LinesBlink');

    if (!animation.finishedPosted) {
      tweeny.start(animation.showTimer);
    }
  }

  private ClearLines(subScreenIdx: number) {
    const animation = this.m_linesAnimations[subScreenIdx];
    if (!animation) return;

    tweeny.stop(animation.blink);
    tweeny.stop(animation.showTimer);
    animation.showFast = false;
    animation.finishedPosted = false;
    animation.pendingClear = false;

    this.m_lines = this.m_lines.filter(line => {
      if (line.GetSubScreenIdx() !== subScreenIdx) return true;

      line.Clear();
      return false;
    });
  }

  private CreateWinFigures(subScreenIdx: number, combinations: ReelCombinations) {
    const allWinSymbols = new Map<string, SymbolViewInfos[number]>();
    for (const combination of combinations) for (const info of combination.symbolViewInfos) allWinSymbols.set(info.key(), info);
    // the sub screens carry no stacked wilds of their own, only the winning symbols animate
    for (const viewInfo of allWinSymbols.values()) {
      const winFigure = new WinFigureVisual(this.m_elementsList, this.m_config.subScreensConfig, this.m_config.winFiguresConfig);
      winFigure.SetSubScreenIdx(subScreenIdx);
      if (winFigure.CreateWinFigure(viewInfo, false)) this.m_winFigures.push(winFigure);
    }
  }

  private ClearWinFigures(subScreenIdx: number) {
    this.m_winFigures = this.m_winFigures.filter(figure => {
      if (figure.GetSubScreenIdx() !== subScreenIdx) return true;
      figure.Clear();
      return false;
    });
  }

  // BaseReelsView

  GetReelsViewConfig() {
    return this.m_config;
  }

  IsHiddenSymbol(_reelIdx: number, _row: number) {
    return false;
  }

  PlayStopSound(subScreenIdx: number, reelIdx: number) {
    if (this.m_pendingAllReelingSound) {
      if (!this.ShouldPlayAllReelingSound(subScreenIdx, reelIdx)) return;
      this.m_allReelingPlayback = this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.allReelingSoundId);
      this.m_pendingAllReelingSound = false;
      return;
    }
    const soundId = this.ChooseStopSound(subScreenIdx, reelIdx);
    if (soundId) this.RuntimeGet(IAudioApi).Play(soundId);
  }

  PlayAttractionSound() {
    this.m_attractionPlayback = this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.attractionSoundId ?? '');
  }

  StopAttractionSound() {
    this.m_attractionPlayback?.Stop();
    this.m_attractionPlayback = null;
  }

  GetStoppedReelIds() {
    return this.m_reels.filter(reel => reel.HasStopped() || reel.InEpilog()).map(reel => reel.GetId());
  }

  GetStoppedReelIdxs(subScreenIdx: number) {
    return this.m_reels.filter(reel => reel.GetSubScreenIdx() === subScreenIdx && (reel.HasStopped() || reel.InEpilog())).map(reel => reel.GetIdx());
  }

  GetReelsCount(subScreenIdx: number) {
    return this.m_reels.filter(reel => reel.GetSubScreenIdx() === subScreenIdx).length;
  }

  OnReelStopped(subScreenIdx: number, reelIdx: number) {
    const stoppedReels = this.GetStoppedReelIdxs(subScreenIdx);
    this.m_events.singleReelStopEvent.Post(subScreenIdx, reelIdx, stoppedReels);
    if (stoppedReels.length === this.m_reels.length / this.m_config.subScreensConfig.subScreens.length) this.m_allStopDelay = new Stopwatch();
    this.ClearFlyingSymbols(subScreenIdx, reelIdx);
  }

  private LoadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<ReelsViewConfig>('TetraRoundViewConfig');
  }

  private ChooseStopSound(subScreenIdx: number, reelIdx: number) {
    if (this.m_pendingAllReelingSound || this.m_allReelingPlayback) return '';
    const stopIdx = subScreenIdx * this.GetReelsCount(subScreenIdx) + reelIdx;
    const stop = this.m_stopFigures[stopIdx];
    if (!stop) return '';
    const category = stop.includes(this.m_config.reelingParamsConfig.wildSymbolId) ? ECategory.Scatter : ECategory.Default;
    return this.m_config.reelSoundsConfig.stopSoundsConfig.find(sound => sound.category === category && sound.stopIndex === reelIdx)?.soundId ?? '';
  }

  private ShouldPlayAllReelingSound(subScreenIdx: number, reelIdx: number) {
    return this.m_reels.every(reel => reel.GetSubScreenIdx() !== subScreenIdx || reel.GetIdx() === reelIdx || !reel.IsSpinningOrStopping());
  }
}
