// Egt::Game::AlphaFamily::ReelsView (BurningCrownTetraSpins10View/Views/ReelsView.h/.cpp): the main game's five reels.

import { IsArrayOf } from '@game/engine/GameCore/Common/ContainerHelpers';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { type ERoundTags, type Reels, type SymbolGrid, SymbolViewInfo, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelCombination, type ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IReelsView, IReelsViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { ReelVisual } from '../Visuals/ReelVisual';
import type { BaseReelsView } from './BaseReelsView';
import { ECategory, type ReelsViewConfig } from './ReelsView.data';

const ReelsViewId = 'ReelsView';

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
  protected m_expandingSymbolsPending = false;
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
      const now = performance.now();
      // a tab in the background resumes without replaying every tick it missed
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
    if (this.m_expandingSymbolsPending) {
      // BurningCrownTetraSpins10 has no expanding symbols: they are expanded at once.
      this.m_expandingSymbolsPending = false;
      this.m_events.symbolsExpanded.Post();
    }
    super.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    for (const reel of this.m_reels) reel.Draw(drawList);
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
    this.m_lastTickTime = performance.now();
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
    this.m_expandingSymbolsPending = false;
  }

  ShowSymbolsExpanding(_symbolGrid: SymbolGrid, _expanded: SymbolGrid) {
    this.m_expandingSymbolsPending = true;
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
      reel.SetWildId(this.m_config.reelingParamsConfig.wildSymbolId);
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

  /** The sound of the reel that stopped: its category's sound (BurningCrownTetraSpins10 has no scatters or expanding
   * wilds, whose categories C++ checks for its other games). */
  private ChooseStopSound() {
    const stoppedIdx = this.GetStoppedReelIds().length - 1;
    if (stoppedIdx < 0 || stoppedIdx >= this.m_stopFigures.length) return '';
    if (this.m_pendingAllReelingSound || this.m_allReelingPlayback) return '';
    const priorities: ECategory[] = [ECategory.Default];
    let category = ECategory.None;
    for (const item of priorities) if (StopSoundPriority.indexOf(item) > StopSoundPriority.indexOf(category)) category = item;
    return this.m_config.reelSoundsConfig.stopSoundsConfig.find(sound => sound.category === category && sound.stopIndex === stoppedIdx)?.soundId ?? '';
  }

  private ShouldPlayAllReelingSound(reelIdx: number) {
    return this.m_reels.every(reel => reel.GetId() === reelIdx || !reel.IsSpinningOrStopping());
  }
}
