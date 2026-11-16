// Egt::Game::AlphaFamily::ReelsView (NordicTaleView/Views/ReelsView.h/.cpp): the main game's five reels, and the hold and
// spin round's fifteen one-cell reels, which spin the free cells one after another while the held shields stay, shown by
// the win figures view.

import { Contains, IsArrayOf, IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import {
  type ERoundTags, type Reels, RoundType, type SymbolGrid, SymbolGridCoordinates, type SymbolIds, SymbolViewInfo,
  type SymbolViewInfos,
} from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelCombination, type ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IReelsView, IReelsViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { ReelVisual } from '../Visuals/ReelVisual';
import type { BaseReelsView } from './BaseReelsView';
import { ReelVisualConfig } from './ReelSubScreen.data';
import { ECategory, type ReelingParamsConfig, type ReelsViewConfig } from './ReelsView.data';
import type { WinFiguresView } from './WinFiguresView';

const ReelsViewId = 'ReelsView';

const HoldAndSpinVisibleCols = 5;
const HoldAndSpinVisibleRows = 3;
const HoldAndSpinCellCount = HoldAndSpinVisibleCols * HoldAndSpinVisibleRows;

function CellIndex(col: number, row: number) {
  return row * HoldAndSpinVisibleCols + col;
}

function FullColumnLayout(reelIndex: number, visibleRows: number) {
  const config = new ReelVisualConfig();
  config.reelStartCol = reelIndex;
  config.reelStartRow = 0;
  config.reelHeightInCells = visibleRows;
  return config;
}

function HoldAndSpinCellLayout(cellIndex: number) {
  const idx = cellIndex;
  const config = new ReelVisualConfig();
  config.reelStartCol = idx % HoldAndSpinVisibleCols;
  config.reelStartRow = Math.trunc(idx / HoldAndSpinVisibleCols);
  config.reelHeightInCells = 1;
  return config;
}

// the stop sounds' categories, from the least to the most important
const StopSoundPriority: ECategory[] = [ECategory.None, ECategory.Default, ECategory.Scatter];

export class ReelsView extends BaseView implements IReelsView, BaseReelsView {
  protected readonly m_events = new IReelsViewEvents();
  protected m_mainReelPool: ReelVisual[] = [];
  protected m_holdAndSpinReelPool: ReelVisual[] = [];
  protected m_lastTickTime: number | null = null;
  protected m_stopFigures: SymbolGrid = [];
  protected m_config!: ReelsViewConfig;
  protected m_allStopDelay: Stopwatch | null = null;
  protected readonly m_hiddenSymbolCoords = new Set<string>();
  protected m_isHoldAndSpin = false;
  protected m_pendingAllReelingSound = false;
  protected m_allReelingPlayback: IAudioPlayback | null = null;
  protected m_attractionPlayback: IAudioPlayback | null = null;

  protected m_holdAndSpinFakeReels: Reels = [];
  protected m_stagedMainFakeReels: Reels = [];
  protected m_stagedStopFigures: SymbolGrid = [];
  protected m_stagedBeforeStop: SymbolGrid = [];
  protected m_stagedAfterStop: SymbolGrid = [];
  protected m_deferredShowStopFigures = false;
  protected m_holdAndSpinReelSetupPending = false;
  protected m_deferredStartHoldAndSpinReeling = false;
  protected m_hsSpinStopOrder: number[] = [];
  protected m_hsNextStopIndex = 0;
  protected m_hsActiveHeldFigures: SymbolViewInfos = [];
  protected m_holdedSymbolIds: SymbolIds = [];

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
    this.InitElementsList(ReelsViewId, () => {
      this.OnElementsListLoaded();
    });
    return true;
  }

  Deinit() {
    this.m_mainReelPool = [];
    this.m_holdAndSpinReelPool = [];

    this.DeinitElementsList();
    this.RuntimeRemove(IReelsView);
    this.RuntimeRemove(IReelsView.Events);
    super.Deinit();
  }

  Process() {
    const tick = this.GetReelingParamsConfig().tickDuration;
    if (this.m_lastTickTime !== null) {
      const now = performance.now();
      // a tab in the background resumes without replaying every tick it missed
      if (now - this.m_lastTickTime > 1000) this.m_lastTickTime = now - tick;
      while (this.m_lastTickTime + tick < now) {
        this.m_lastTickTime += tick;
        for (const reel of this.ActiveReels()) reel.Process();
      }
    }
    if (this.m_allStopDelay && this.m_allStopDelay.Measure() > this.GetReelingParamsConfig().allStoppedDelay) {
      this.m_events.allReelsStopEvent.Post();
      this.m_allReelingPlayback?.Stop();
      this.m_allReelingPlayback = null;
      this.m_pendingAllReelingSound = false;
      if (this.m_isHoldAndSpin) {
        this.m_isHoldAndSpin = false;
        this.m_events.holdAndSpinFinished.Post();
      }
      this.m_allStopDelay = null;
    }
    super.Process();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    for (const reel of this.ActiveReels()) reel.Draw(drawList);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
    if (!visible) this.StopAttractionSound();
  }

  SetupNextStart(_todo_useSpecificType: string) {}

  SetupFakeReels(reels: Reels) {
    this.m_isHoldAndSpin = false;

    if (reels.length >= HoldAndSpinCellCount) {
      this.m_holdAndSpinFakeReels = reels;
      this.m_holdAndSpinReelSetupPending = true;
      if (this.m_elementsList.IsLoaded()) {
        this.ApplyHoldAndSpinFakeReels(reels);
      }

      return;
    }

    this.m_holdAndSpinReelSetupPending = false;
    this.m_stagedMainFakeReels = reels;

    if (this.m_elementsList.IsLoaded()) {
      this.ApplyMainFakeReels(reels);
    }
  }

  private StartHoldAndSpinReeling() {
    this.RuntimeGet(ILinesView).StopWinLinesSounds('StartReeling');
    this.m_events.startReelingEvent.Post();
    this.m_lastTickTime = performance.now();
    this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.startReelingSoundId);

    this.m_hsSpinStopOrder = [];
    let stopRank = 0;
    for (let col = 0; col < HoldAndSpinVisibleCols; ++col) {
      for (let row = 0; row < HoldAndSpinVisibleRows; ++row) {
        const idx = CellIndex(col, row);
        if (this.IsCellHeld(col, row)) continue;
        if (AssertIf(!IsValidIndex(this.m_holdAndSpinReelPool, idx))) continue;

        this.m_holdAndSpinReelPool[idx].SetHoldAndSpinStopRank(stopRank);
        this.m_hsSpinStopOrder.push(idx);
        ++stopRank;
      }
    }

    for (const cellIdx of this.m_hsSpinStopOrder) {
      this.m_holdAndSpinReelPool[cellIdx].StartReeling();
    }

    if (this.m_hsSpinStopOrder.length) {
      this.m_hsNextStopIndex = 1;
      this.StartNormalReelingStop(this.m_hsSpinStopOrder[0]); // TODO: should not have stop - FIX ME
    } else {
      this.m_allStopDelay = new Stopwatch();
    }

    this.m_hiddenSymbolCoords.clear();
  }

  StartReeling() {
    if (this.m_isHoldAndSpin) {
      this.StartHoldAndSpinReeling();
      return;
    }

    if (this.m_holdAndSpinReelSetupPending) {
      this.m_deferredStartHoldAndSpinReeling = true;
      return;
    }

    if (this.GetStoppedReelIds().length < this.ActiveReels().length) return; // not all reels have stopped
    this.RuntimeGet(ILinesView).StopWinLinesSounds('StartReeling');
    this.m_events.startReelingEvent.Post();
    this.m_lastTickTime = performance.now();
    for (const reel of this.m_mainReelPool) reel.StartReeling();
    this.RuntimeGet(IAudioApi).Play(this.m_config.reelSoundsConfig.startReelingSoundId);
    this.m_hiddenSymbolCoords.clear();
  }

  StartFastReelingStop() {
    const pool = this.m_isHoldAndSpin ? this.m_holdAndSpinReelPool : this.m_mainReelPool;
    for (const reel of pool) reel.FastStop();
    this.m_pendingAllReelingSound = true;
  }

  StartNormalReelingStop(reelIdx: number) {
    const pool = this.m_isHoldAndSpin ? this.m_holdAndSpinReelPool : this.m_mainReelPool;
    if (!IsValidIndex(pool, reelIdx)) return;

    pool[reelIdx].NormalStop();
  }

  StartFastReelStop(reelIdx: number) {
    const pool = this.m_isHoldAndSpin ? this.m_holdAndSpinReelPool : this.m_mainReelPool;
    if (!IsValidIndex(pool, reelIdx)) return;

    pool[reelIdx].FastStop();
  }

  SetStopFigures(symbolGrid: SymbolGrid) {
    if (!symbolGrid.length) return;

    this.m_stagedStopFigures = symbolGrid;

    if (!this.m_elementsList.IsLoaded()) return;

    this.ApplyStopFiguresToActiveReels(symbolGrid);
  }

  SetSymbolsAroundStop(before: SymbolGrid, after: SymbolGrid) {
    this.m_stagedBeforeStop = before;
    this.m_stagedAfterStop = after;

    if (!this.m_elementsList.IsLoaded()) return;

    before.slice(0, this.m_mainReelPool.length).forEach((column, i) => this.m_mainReelPool[i].SetSymbolsBeforeStop(column));
    after.slice(0, this.m_mainReelPool.length).forEach((column, i) => this.m_mainReelPool[i].SetSymbolsAfterStop(column));
  }

  SetReelTags(reelIdx: number, tags: ERoundTags[]) {
    const pool = this.m_isHoldAndSpin ? this.m_holdAndSpinReelPool : this.m_mainReelPool;
    if (!IsValidIndex(pool, reelIdx)) return;

    pool[reelIdx].SetTags(tags);
  }

  ShowStopFigures() {
    if (!this.ReelsReadyForStopDisplay()) {
      this.m_deferredShowStopFigures = true;
      return;
    }

    this.m_deferredShowStopFigures = false;

    for (const reel of this.ActiveReels()) reel.ShowStopFigures();
  }

  ClearExpandSymbols() {
  }

  ShowSymbolsExpanding(_symbolGrid: SymbolGrid, _expanded: SymbolGrid) {
    this.m_events.symbolsExpanded.Post();
  }

  ShowHoldAndSpinPhase(symbolGrid: SymbolGrid, holded: SymbolGrid) {
    if (AssertIf(symbolGrid.length !== HoldAndSpinVisibleCols)) return;
    if (AssertIf(holded.length !== HoldAndSpinVisibleCols)) return;

    this.m_isHoldAndSpin = true;
    this.m_hsSpinStopOrder = [];
    this.m_hsNextStopIndex = 0;

    if (AssertIf(!this.m_holdAndSpinFakeReels.length)) return;

    this.m_holdedSymbolIds = this.GetHoldedSymbolIds();

    this.ApplyHoldedSymbolIdsToReels();

    // C++'s SymbolGrid flatStop(HoldAndSpinCellCount), flatHold(HoldAndSpinCellCount): empty cells, without holes
    const flatStop: SymbolGrid = [];
    const flatHold: SymbolGrid = [];
    for (let idx = 0; idx < HoldAndSpinCellCount; ++idx) {
      flatStop.push([]);
      flatHold.push([]);
    }

    for (let col = 0; col < HoldAndSpinVisibleCols; ++col) {
      if (AssertIf(!IsValidIndex(symbolGrid, col))) continue;
      if (AssertIf(!IsValidIndex(holded, col))) continue;
      if (AssertIf(symbolGrid[col].length < HoldAndSpinVisibleRows)) continue;
      if (AssertIf(holded[col].length < HoldAndSpinVisibleRows)) continue;

      for (let row = 0; row < HoldAndSpinVisibleRows; ++row) {
        const idx = CellIndex(col, row);
        flatStop[idx] = [symbolGrid[col][row]];
        flatHold[idx] = [holded[col][row]];
      }
    }

    for (let idx = 0; idx < HoldAndSpinCellCount; ++idx) {
      if (AssertIf(!IsValidIndex(flatStop, idx))) continue;
      if (!flatStop[idx].length) continue;

      const heldSym = !flatHold[idx].length ? -1 : flatHold[idx][0];

      if (heldSym >= 0) {
        flatStop[idx][0] = heldSym;
        continue;
      }

      if (!Contains(this.m_holdedSymbolIds, flatStop[idx][0])) {
        flatStop[idx][0] = -1;
      }
    }

    this.m_stopFigures = flatStop;

    for (let col = 0; col < HoldAndSpinVisibleCols; ++col) {
      for (let row = 0; row < HoldAndSpinVisibleRows; ++row) {
        const idx = CellIndex(col, row);
        const reel = this.m_holdAndSpinReelPool[idx];
        reel.SetIdx(idx);

        const fakeStrip = this.m_holdAndSpinFakeReels.length >= HoldAndSpinCellCount
          ? this.m_holdAndSpinFakeReels[idx]
          : (IsValidIndex(this.m_holdAndSpinFakeReels, col) ? this.m_holdAndSpinFakeReels[col]
            : this.m_holdAndSpinFakeReels[0]);
        reel.SetFakeSymbols(fakeStrip);
        reel.SetStopSymbols(flatStop[idx]);

        const heldSymbol = !flatHold[idx].length ? -1 : flatHold[idx][0];
        const isHeld: boolean = heldSymbol >= 0;

        if (isHeld) {
          reel.ShowStopFigures();
        }
      }
    }

    this.m_hiddenSymbolCoords.clear();

    this.m_hsActiveHeldFigures = [];
    for (let row = 0; row < HoldAndSpinVisibleRows; ++row) {
      for (let col = 0; col < HoldAndSpinVisibleCols; ++col) {
        const idx = CellIndex(col, row);
        const heldSymbol = !flatHold[idx].length ? -1 : flatHold[idx][0];
        if (heldSymbol < 0) continue;

        this.m_hsActiveHeldFigures.push(new SymbolViewInfo(heldSymbol, new SymbolGridCoordinates(col, row)));
      }
    }

    this.RefreshHoldAndSpinHeldFigures();

    this.m_holdAndSpinReelSetupPending = false;
    if (this.m_deferredStartHoldAndSpinReeling) {
      this.m_deferredStartHoldAndSpinReeling = false;
      this.StartHoldAndSpinReeling();
    }
  }

  private RefreshHoldAndSpinHeldFigures() {
    if (!this.m_hsActiveHeldFigures.length) return;

    (this.RuntimeGet(IWinFiguresView) as WinFiguresView).ShowHoldAndSpinHeldFigures(this.m_hsActiveHeldFigures);
    this.ShowCombinations(this.m_hsActiveHeldFigures);
  }

  private TryRegisterStoppedHoldAndSpinShield(cellIdx: number) {
    if (!this.m_isHoldAndSpin) return;
    if (!IsValidIndex(this.m_holdAndSpinReelPool, cellIdx)) return;
    if (!IsValidIndex(this.m_stopFigures, cellIdx)) return;

    const stopIds = this.m_stopFigures[cellIdx];
    if (!stopIds.length) return;

    const symbolId = stopIds[0];
    if (!Contains(this.m_holdedSymbolIds, symbolId)) return;

    const col = cellIdx % HoldAndSpinVisibleCols;
    const row = Math.trunc(cellIdx / HoldAndSpinVisibleCols);
    const coord = new SymbolGridCoordinates(col, row);

    for (const held of this.m_hsActiveHeldFigures) {
      if (held.coord.equals(coord)) return;
    }

    this.m_hsActiveHeldFigures.push(new SymbolViewInfo(symbolId, coord));
    this.RefreshHoldAndSpinHeldFigures();
  }

  ClearHoldAndSpinSymbols() {
    this.m_hsSpinStopOrder = [];
    this.m_hsNextStopIndex = 0;
    this.m_hsActiveHeldFigures = [];
    this.m_holdedSymbolIds = [];
    this.m_holdAndSpinReelSetupPending = false;
    this.m_deferredStartHoldAndSpinReeling = false;

    if (this.m_isHoldAndSpin) {
      for (const reel of this.m_holdAndSpinReelPool) {
        reel.SetHoldedSymbolIds([]);
      }
    }

    this.m_isHoldAndSpin = false;
  }

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

  private OnElementsListLoaded() {
    this.InitMainReelPool();
    this.InitHoldAndSpinReelPool();

    if (this.m_stagedMainFakeReels.length) {
      this.ApplyMainFakeReels(this.m_stagedMainFakeReels);
    }

    if (this.m_holdAndSpinFakeReels.length) {
      this.ApplyHoldAndSpinFakeReels(this.m_holdAndSpinFakeReels);
    }

    if (this.m_stagedStopFigures.length) {
      this.ApplyStopFiguresToActiveReels(this.m_stagedStopFigures);
    }

    if (this.m_stagedBeforeStop.length || this.m_stagedAfterStop.length) {
      this.SetSymbolsAroundStop(this.m_stagedBeforeStop, this.m_stagedAfterStop);
    }

    if (this.m_deferredShowStopFigures) {
      this.ShowStopFigures();
    }
  }

  private ApplyMainFakeReels(reels: Reels) {
    if (!reels.length) return;

    const columnCount: number = Math.min(reels.length, this.m_mainReelPool.length);
    if (columnCount === 0) return;

    for (let i = 0; i < columnCount; i++) {
      this.m_mainReelPool[i].SetFakeSymbols(reels[i]);
    }
  }

  private ApplyHoldAndSpinFakeReels(reels: Reels) {
    if (!reels.length) return;

    const cellCount: number = Math.min(reels.length, this.m_holdAndSpinReelPool.length);
    if (cellCount === 0) return;

    for (let i = 0; i < cellCount; ++i) {
      if (AssertIf(!IsValidIndex(this.m_holdAndSpinReelPool, i))) continue;
      this.m_holdAndSpinReelPool[i].SetFakeSymbols(reels[i]);
    }
  }

  private ApplyStopFiguresToActiveReels(symbolGrid: SymbolGrid) {
    if (!symbolGrid.length) return;

    if (symbolGrid.length === HoldAndSpinCellCount) {
      if (this.m_holdAndSpinReelPool.length !== symbolGrid.length) return;

      for (let i = 0; i < symbolGrid.length; i++) {
        this.m_holdAndSpinReelPool[i].SetStopSymbols(symbolGrid[i]);
      }
    } else {
      if (this.m_mainReelPool.length !== symbolGrid.length) return;

      for (let i = 0; i < symbolGrid.length; i++) {
        this.m_mainReelPool[i].SetStopSymbols(symbolGrid[i]);
      }
    }

    this.m_stopFigures = symbolGrid.map(column => [...column]);
  }

  private ReelsReadyForStopDisplay() {
    if (!this.m_elementsList.IsLoaded()) return false;
    if (!this.ActiveReels().length) return false;

    for (const reel of this.ActiveReels()) {
      if (!reel.HasReelStrip()) return false;
    }

    return true;
  }

  private ActiveReels() {
    return this.m_isHoldAndSpin ? this.m_holdAndSpinReelPool : this.m_mainReelPool;
  }

  private CreateReelPool(pool: ReelVisual[], layouts: ReelVisualConfig[]) {
    if (pool.length === layouts.length) return;

    // C++'s clear destroys the reels, which remove their elements
    BrowserOnly(() => {
      for (const reel of pool) reel.Destroy();
    });
    pool.length = 0;

    for (let i = 0; i < layouts.length; ++i) {
      const reel = new ReelVisual(this.m_elementsList, i, this, this.m_config.subScreensConfig, layouts[i]);
      reel.SetIdx(i);
      reel.SetSubScreenIdx(0);
      pool.push(reel);
    }
  }

  private InitMainReelPool() {
    const columnCount = this.m_config.subScreensConfig.visibleCols;
    const visibleRows = this.m_config.subScreensConfig.visibleRows;

    const layouts: ReelVisualConfig[] = [];
    for (let i = 0; i < columnCount; ++i) {
      layouts.push(FullColumnLayout(i, visibleRows));
    }

    this.CreateReelPool(this.m_mainReelPool, layouts);
  }

  private InitHoldAndSpinReelPool() {
    const layouts: ReelVisualConfig[] = [];
    for (let i = 0; i < HoldAndSpinCellCount; ++i) {
      layouts.push(HoldAndSpinCellLayout(i));
    }

    this.CreateReelPool(this.m_holdAndSpinReelPool, layouts);
  }

  GetConfig() {
    return this.m_config;
  }

  // BaseReelsView

  GetReelsViewConfig() {
    return this.m_config;
  }

  GetReelingParamsConfig(): ReelingParamsConfig {
    return this.m_isHoldAndSpin ? this.m_config.reelingParamsHSConfig : this.m_config.reelingParamsConfig;
  }

  IsHiddenSymbol(reelIdx: number, row: number) {
    return this.m_hiddenSymbolCoords.has(`${reelIdx}:${row}`);
  }

  private GetHoldedSymbolIds(): SymbolIds {
    const mathRules = this.RuntimeGetConst(IMathRules);
    let hsRulesRoundType = this.RuntimeGetConst(IGameflow).GetConsecutiveTriggerRoundType();
    if (!mathRules.HasHoldAndSpinRules(hsRulesRoundType)) {
      hsRulesRoundType = RoundType.Main;
    }

    const hsConfig = mathRules.GetHoldAndSpinRoundRules(hsRulesRoundType).GetConfig();
    const ids: SymbolIds = [...hsConfig.triggerSymbolIds];
    const dropSymbolId = hsConfig.dropSymbolId;
    if (dropSymbolId >= 0 && !Contains(ids, dropSymbolId)) {
      ids.push(dropSymbolId);
    }
    return ids;
  }

  private ApplyHoldedSymbolIdsToReels() {
    for (const reel of this.m_holdAndSpinReelPool) {
      reel.SetHoldedSymbolIds(this.m_holdedSymbolIds);
    }
  }

  private IsCellHeld(col: number, row: number) {
    const coord = new SymbolGridCoordinates(col, row);
    for (const held of this.m_hsActiveHeldFigures) {
      if (held.coord.equals(coord)) return true;
    }
    return false;
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
    return this.ActiveReels().filter(reel => reel.HasStopped() || reel.InEpilog()).map(reel => reel.GetId());
  }

  GetStoppedReelIdxs(_subScreen: number) {
    return this.GetStoppedReelIds();
  }

  GetReelsCount(_subScreenIdx: number) {
    return this.ActiveReels().length;
  }

  OnReelStopped(_subScreen: number, reelIdx: number) {
    if (this.m_isHoldAndSpin && this.m_hsNextStopIndex < this.m_hsSpinStopOrder.length) {
      this.StartNormalReelingStop(this.m_hsSpinStopOrder[this.m_hsNextStopIndex++]);
    }

    if (this.m_isHoldAndSpin) {
      this.TryRegisterStoppedHoldAndSpinShield(reelIdx);
    }

    const stoppedReels = this.GetStoppedReelIds();

    this.m_events.singleReelStopEvent.Post(reelIdx, stoppedReels);
    if (stoppedReels.length === this.ActiveReels().length) this.m_allStopDelay = new Stopwatch();
  }

  private LoadConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<ReelsViewConfig>('ReelsViewConfig');
  }

  /** Reads its config again, when its file changed, once its reels have stopped: they make their symbols again from it.
   * @browserOnly */
  private ReloadConfig() {
    const reels = [...this.m_mainReelPool, ...this.m_holdAndSpinReelPool];
    if (reels.some(reel => !reel.HasStopped())) return false;
    this.LoadConfig();
    for (const reel of reels) {
      reel.ReloadConfig();
    }
    return true;
  }

  /** The sound of the reel that stopped: its category's sound, the scatter's when it stops a scatter (12) and the stop
   * has three or more; in the hold and spin round, the default sound of its stop's index, up to the last column's. */
  private ChooseStopSound() {
    const scatterId = 12;
    const scatterAttractionCount = 3;

    const stoppedIdx = this.GetStoppedReelIds().length - 1;
    if (stoppedIdx < 0 || stoppedIdx >= this.m_stopFigures.length) return '';
    if (this.m_pendingAllReelingSound || this.m_allReelingPlayback) return '';

    if (this.m_isHoldAndSpin) {
      const soundIdx = Math.min(stoppedIdx, HoldAndSpinVisibleCols - 1);
      const it = this.m_config.reelSoundsConfig.stopSoundsConfig.find(s => {
        return s.category === ECategory.Default && s.stopIndex === soundIdx;
      });
      if (AssertIf(it === undefined)) return '';
      return it!.soundId;
    }

    const scatterStops = this.m_stopFigures.map(it => it.includes(scatterId));
    if (AssertIf(!IsValidIndex(scatterStops, stoppedIdx))) return '';

    let scatterCount = 0;
    for (const reel of this.m_stopFigures) {
      scatterCount += reel.filter(symbolId => symbolId === scatterId).length;
    }

    const priorities: ECategory[] = [ECategory.Default];

    if (scatterStops[stoppedIdx] && scatterCount >= scatterAttractionCount) {
      priorities.push(ECategory.Scatter);
    }

    let category = ECategory.None;
    for (const item of priorities) if (StopSoundPriority.indexOf(item) > StopSoundPriority.indexOf(category)) category = item;
    return this.m_config.reelSoundsConfig.stopSoundsConfig.find(sound => sound.category === category && sound.stopIndex === stoppedIdx)?.soundId ?? '';
  }

  private ShouldPlayAllReelingSound(reelIdx: number) {
    return this.ActiveReels().every(reel => reel.GetId() === reelIdx || !reel.IsSpinningOrStopping());
  }
}
