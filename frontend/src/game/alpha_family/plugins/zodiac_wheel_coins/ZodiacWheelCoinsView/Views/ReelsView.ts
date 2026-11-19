// Egt::Game::AlphaFamily::ReelsView (ZodiacWheelCoinsView/Views/ReelsView.h/.cpp): the main game's five reels.

import { Clock } from '@game/engine/Game/Utils/Clock';
import { Contains, IsArrayOf, IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf, Unless, assert } from '@game/engine/GameCore/Common/Defensive';
import { type int, type size_t, static_cast } from '@game/engine/GameCore/Common/Types';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import {
  type ERoundTags, type Reels, type SymbolGrid, SymbolGridCoordinates, type SymbolId, SymbolViewInfo, type SymbolViewInfos,
} from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelCombination, type ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IReelsView, IReelsViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { ReelVisual } from '../Visuals/ReelVisual';
import type { BaseReelsView } from './BaseReelsView';
import { ECategory, type ReelsViewConfig } from './ReelsView.data';

const ReelsViewId = 'ReelsView';

const SoundStartReelingId = 'sound_start_reeling';
const SoundAllReelingId = 'sound_all_reeling';
const SoundAttractionId = 'sound_attraction';
const SoundExpandingSymbolId = 'sound_expanding_symbol';

// the stop sounds' categories, from the least to the most important
const StopSoundPriority: ECategory[] = [ECategory.None, ECategory.Default, ECategory.Scatter, ECategory.ExpandingWild];

export class ReelsView extends BaseView implements IReelsView, BaseReelsView {
  protected readonly m_events = new IReelsViewEvents();
  protected m_reels: ReelVisual[] = [];
  protected m_lastTickTime: number | null = null;
  protected m_stopFigures: SymbolGrid = [];
  protected m_config!: ReelsViewConfig;
  protected m_allStopDelay: Stopwatch | null = null;
  protected readonly m_hiddenSymbolCoords = new Set<string>();
  protected m_expandingSymbolCoords: SymbolGridCoordinates[] = [];
  protected m_animationIds: string[] = [];
  protected m_pendingAllReelingSound = false;
  protected m_allReelingPlayback: IAudioPlayback | null = null;
  protected m_attractionPlayback: IAudioPlayback | null = null;

  constructor() {
    super(ReelsViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IReelsView, this);
    this.RuntimeAdd(IReelsView.Events, this.m_events);
    this.LoadConfig();
    // when its config's file changes, the reels make their symbols again from it
    BrowserOnly(() => this.WatchConfig('ReelsViewConfig', () => this.ReloadConfig()));
    this.InitElementsList(ReelsViewId);
    return true;
  }

  Deinit() {
    this.ClearExpandSymbols();
    this.DeinitElementsList();
    this.RuntimeRemove(IReelsView);
    this.RuntimeRemove(IReelsView.Events);
    super.Deinit();
  }

  Process() {
    const tick = this.m_config.reelingParamsConfig.tickDuration;
    if (this.m_lastTickTime !== null) {
      const now = Clock.now();
      // a tab in the background resumes without replaying every tick it missed (over a second of the page's time)
      BrowserOnly(() => {
        if (now - this.m_lastTickTime! > 1000 * Clock.GetSpeed()) this.m_lastTickTime = now - tick;
      });
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

    if (this.m_expandingSymbolCoords.length !== 0) {
      let isFinished = true;
      for (const animId of this.m_animationIds) {
        if (this.m_elementsList.Get(animId, AnimElement).IsPlaying()) {
          isFinished = false;
          break;
        }
      }
      if (isFinished) {
        this.m_events.symbolsExpanded.Post();
      }
    }

    super.Process();
  }

  Draw(drawList: DrawList) {
    if (Unless(this.IsVisible())) return;

    for (const reel of this.m_reels) {
      reel.Draw(drawList);
    }

    if (this.m_expandingSymbolCoords.length !== 0) {
      if (Unless(this.m_config.subScreensConfig.subScreens.length !== 0)) return;

      const subScreen = this.m_config.subScreensConfig.subScreens[0];

      let idx = 0;
      for (const cellPos of this.m_expandingSymbolCoords) {
        const x = subScreen.reelAreaX + subScreen.symbolColumnWidth * cellPos.reelId;
        const y = subScreen.reelAreaY + subScreen.symbolHeight * cellPos.rowId;

        const animId = this.m_animationIds[idx];
        idx++;

        this.m_elementsList.Get(animId, AnimElement).SetPosition({ x, y }).Draw(drawList);
      }
    }
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    if (!visible) this.StopAttractionSound();
  }

  SetupNextStart(_todo_useSpecificType: string) {}

  SetupFakeReels(reels: Reels) {
    this.AutoResizeReels(reels.length);
    reels.forEach((reel, i) => this.m_reels[i].SetFakeSymbols(reel));
  }

  StartReeling() {
    if (this.GetStoppedReelIds().length < this.m_reels.length) return; // not all reels have stopped
    this.RuntimeGet(ILinesView).StopWinLinesSounds('StartReeling');
    this.m_events.startReelingEvent.Post();
    this.m_lastTickTime = Clock.now();
    for (const reel of this.m_reels) reel.StartReeling();
    this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.startReelingSoundId);
    this.m_hiddenSymbolCoords.clear();
  }

  StartFastReelingStop() {
    for (const reel of this.m_reels) reel.FastStop();
    this.m_pendingAllReelingSound = true;
  }

  StartNormalReelingStop(reelIdx: number) {
    this.m_reels[reelIdx]?.NormalStop();
  }

  StartFastReelStop(reelIdx: number) {
    this.m_reels[reelIdx]?.FastStop();
  }

  SetStopFigures(symbolGrid: SymbolGrid) {
    if (this.m_reels.length !== symbolGrid.length) return;
    symbolGrid.forEach((column, i) => this.m_reels[i].SetStopSymbols(column));
    this.m_stopFigures = symbolGrid.map(column => [...column]);
  }

  SetSymbolsAroundStop(before: SymbolGrid, after: SymbolGrid) {
    before.slice(0, this.m_reels.length).forEach((column, i) => this.m_reels[i].SetSymbolsBeforeStop(column));
    after.slice(0, this.m_reels.length).forEach((column, i) => this.m_reels[i].SetSymbolsAfterStop(column));
  }

  SetReelTags(reelIdx: number, tags: ERoundTags[]) {
    this.m_reels[reelIdx]?.SetTags(tags);
  }

  ShowStopFigures() {
    for (const reel of this.m_reels) reel.ShowStopFigures();
  }

  ClearExpandSymbols() {
    if (this.m_expandingSymbolCoords.length === 0) return;

    this.m_elementsList.Remove(this.m_animationIds);
    this.m_animationIds.length = 0;
    this.m_expandingSymbolCoords.length = 0;
  }

  ShowSymbolsExpanding(symbolGrid: SymbolGrid, expanded: SymbolGrid) {
    this.ClearExpandSymbols();

    assert(symbolGrid.length === expanded.length);
    for (let reelIndex: size_t = 0; reelIndex < symbolGrid.length; ++reelIndex) {
      assert(symbolGrid[reelIndex].length === expanded[reelIndex].length);
      for (let rowIndex: size_t = 0; rowIndex < symbolGrid[reelIndex].length; ++rowIndex) {
        if (symbolGrid[reelIndex][rowIndex] !== expanded[reelIndex][rowIndex]) {
          this.m_expandingSymbolCoords.push(new SymbolGridCoordinates(static_cast<int>(reelIndex), static_cast<int>(rowIndex)));

          const id = this.m_elementsList.Create(AnimElement, this.m_config.expandingSymbolAnimationId).GetId();
          this.m_animationIds.push(id);
        }
      }
    }

    if (this.m_expandingSymbolCoords.length !== 0) {
      // start expanding
      for (const animId of this.m_animationIds) {
        this.m_elementsList.Get(animId, AnimElement).Rewind();
      }
      this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.expandingSymbolSoundId);
    } else {
      this.m_events.symbolsExpanded.Post();
    }
  }

  ShowHoldAndSpinPhase(_symbolGrid: SymbolGrid, _holded: SymbolGrid) {}

  ClearHoldAndSpinSymbols() {}

  ShowCombinations(combinations: ReelCombinations | SymbolViewInfos) {
    if (IsArrayOf(combinations, ReelCombination)) {
      this.ClearCombinations();
      for (const comb of combinations) for (const si of comb.symbolViewInfos) this.m_hiddenSymbolCoords.add(si.coord.key());
      return;
    }
    this.ClearCombinations();
    for (const si of combinations) this.m_hiddenSymbolCoords.add(si.coord.key());
  }

  ClearCombinations() {
    this.m_hiddenSymbolCoords.clear();
  }

  AutoResizeReels(size: number) {
    for (let i = this.m_reels.length; i < size; i++) {
      const reel = new ReelVisual(this.m_elementsList, i, this, this.m_config.subScreensConfig);
      reel.SetIdx(i);
      reel.SetSubScreenIdx(0);
      this.m_reels.push(reel);
    }
    this.m_reels.length = size;
  }

  GetConfig() {
    return this.m_config;
  }

  // BaseReelsView

  GetReelsViewConfig() {
    return this.m_config;
  }

  IsHiddenSymbol(reelIdx: number, row: number) {
    return this.m_hiddenSymbolCoords.has(`${reelIdx}:${row}`);
  }

  PlayStopSound(_subScreen: number, reelIdx: number) {
    if (this.m_pendingAllReelingSound) {
      if (!this.ShouldPlayAllReelingSound(reelIdx)) return;
      this.m_allReelingPlayback = this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.allReelingSoundId);
      this.m_pendingAllReelingSound = false;
      return;
    }
    const soundId = this.ChooseStopSound();
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

  GetStoppedReelIdxs(_subScreen: number) {
    return this.GetStoppedReelIds();
  }

  GetReelsCount(_subScreenIdx: number) {
    return this.m_reels.length;
  }

  OnReelStopped(_subScreen: number, reelIdx: number) {
    const stoppedReels = this.GetStoppedReelIds();
    this.m_events.singleReelStopEvent.Post(reelIdx, stoppedReels);
    if (stoppedReels.length === this.m_reels.length) this.m_allStopDelay = new Stopwatch();
  }

  private LoadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<ReelsViewConfig>('ReelsViewConfig');
  }

  /** Reads its config again, when its file changed, once its reels have stopped: they make their symbols again from it.
   * @browserOnly */
  private ReloadConfig() {
    if (this.m_reels.some(reel => !reel.HasStopped())) return false;
    this.LoadConfig();
    for (const reel of this.m_reels) {
      reel.ReloadConfig();
    }
    return true;
  }

  /** The sound of the reel that stopped: the most important category of what it stopped with (the scatters, when
   * the reels that can still hold them would make enough, the expanding wild, unless the last reel is the only one
   * with it). */
  private ChooseStopSound() {
    const expandingWildId: SymbolId = 8;
    const scatter1Id: SymbolId = 9;
    const scatter2Id: SymbolId = 10;
    const expandingWildAttractionCount: int = 1;
    const scatterAttractionCount: int = 3;

    const stoppedReelIds = this.GetStoppedReelIds();
    const stoppedIdx = stoppedReelIds.length - 1;
    if (stoppedIdx < 0 || stoppedIdx >= this.m_stopFigures.length) return '';

    const isInFastReelingStop: boolean = this.m_pendingAllReelingSound || this.m_allReelingPlayback !== null;
    if (isInFastReelingStop) return '';

    const CanTriggerSpecificSound = (symbolId: SymbolId, triggerSymCount: int): boolean => {
      const specialSymbolStops = this.m_stopFigures.map(it => Contains(it, symbolId));
      if (AssertIf(!IsValidIndex(specialSymbolStops, stoppedIdx))) return false;
      return specialSymbolStops[stoppedIdx] &&
        (stoppedIdx < (this.m_stopFigures.length - 1) ||
         specialSymbolStops.filter(it => it === true).length > triggerSymCount);
    };

    const CanContainScatterOnReel = (symbolId: SymbolId, reelIdx: int, reelsCount: int): boolean => {
      if (symbolId === scatter1Id) {
        // Star is available only on reels 1, 3, and 5.
        return reelIdx === 0 || reelIdx === 2 || reelIdx === 4;
      }
      if (symbolId === scatter2Id) {
        return reelIdx >= 0 && reelIdx < reelsCount;
      }
      return false;
    };

    const CanTriggerScatterAttractionSound = (symbolId: SymbolId): boolean => {
      if (!Contains(this.m_stopFigures[stoppedIdx], symbolId)) return false;

      let scatterCount: int = 0;
      for (let reelIdx: int = 0; reelIdx <= stoppedIdx; ++reelIdx) {
        scatterCount += this.m_stopFigures[reelIdx].filter(it => it === symbolId).length;
      }

      const reelsCount = this.m_stopFigures.length;
      for (let reelIdx: int = stoppedIdx + 1; reelIdx < reelsCount; ++reelIdx) {
        scatterCount += CanContainScatterOnReel(symbolId, reelIdx, reelsCount) ? 1 : 0;
      }

      return scatterCount >= scatterAttractionCount;
    };

    const m_priorities: ECategory[] = [];
    m_priorities.push(ECategory.Default);

    if (CanTriggerScatterAttractionSound(scatter1Id)) {
      m_priorities.push(ECategory.Scatter);
    }
    if (CanTriggerScatterAttractionSound(scatter2Id)) {
      m_priorities.push(ECategory.Scatter);
    }
    if (CanTriggerSpecificSound(expandingWildId, expandingWildAttractionCount)) {
      m_priorities.push(ECategory.ExpandingWild);
    }

    let category = ECategory.None;
    for (const item of m_priorities) if (StopSoundPriority.indexOf(item) > StopSoundPriority.indexOf(category)) category = item;
    const it = this.m_config.reelSoundsConfig.stopSoundsConfig.find(s => s.category === category && s.stopIndex === stoppedIdx);
    if (AssertIf(it === undefined)) return '';

    return it!.soundId;
  }

  private ShouldPlayAllReelingSound(reelIdx: number) {
    return this.m_reels.every(reel => reel.GetId() === reelIdx || !reel.IsSpinningOrStopping());
  }
}
