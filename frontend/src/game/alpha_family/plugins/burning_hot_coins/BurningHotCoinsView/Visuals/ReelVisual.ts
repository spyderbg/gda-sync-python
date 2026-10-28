// Egt::Game::AlphaFamily::ReelVisual (BurningHotCoinsView/Visuals/ReelVisual.h/.cpp): one reel strip, which
// spins over the fake reel and stops on the round's stop, a tick (tickDuration) at a time.

import { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { ERoundTags, type SymbolId, type SymbolIds } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { BaseReelsView } from '../Views/BaseReelsView';
import type { ReelSubScreensConfig } from '../Views/ReelSubScreen.data';
import { BaseVisual } from './BaseVisual';

enum EStatus {
  INTRO,
  STARTING,
  REELING,
  STOPPING,
  EPILOG,
  STOPPED,
}

export class ReelVisual extends BaseVisual {
  private m_reelIdx = 0;
  private m_symbolIds: SymbolIds = [];
  private m_fakeSymbolIds: SymbolIds = [];
  private m_stopSymbolIds: SymbolIds = [];
  private m_beforeStopSymbolIds: SymbolIds = [];
  private m_afterStopSymbolIds: SymbolIds = [];
  private m_beforeStopPositions: number[] = [];
  private m_afterStopPositions: number[] = [];
  private readonly m_resIds = new Map<SymbolId, string>();
  private m_ucReelStatus = EStatus.STOPPED;
  private m_ssCurPos = 0;
  private m_usCurIntroPos = 0;
  private m_usCurEpilogPos = 0;
  private m_usStopStepsCount = 0;
  private m_usStopStepsEnd = 0;
  private m_nResultsPositions: number[] = [];
  private m_hasAttraction = false;
  private m_bStoppedSoundPlayed = false;
  private m_bAttractionSoundPlayed = false;
  private readonly m_usReelMovPiece: number;
  private m_usReelTicksStopEvent = 0;
  private m_wildId: SymbolId = -1;

  constructor(elementsList: ElementsList, private readonly m_reelId: number, private readonly m_baseReelsView: BaseReelsView,
    private readonly m_subScreensConfig: ReelSubScreensConfig) {
    super(elementsList);
    const config = m_baseReelsView.GetReelsViewConfig();
    this.m_usReelMovPiece = config.reelingParamsConfig.normalDeltaPosPerTick;
    for (const symbol of config.symbolsConfig) {
      const image = this.m_elementsList.Create(ImageElement, symbol.rssId);
      image.SetHidden(true); // drawn by the reel only
      this.m_resIds.set(symbol.id, image.GetId());
    }
  }

  private get subScreen() {
    return this.m_subScreensConfig.subScreens[this.GetSubScreenIdx()];
  }

  Draw(drawList: DrawList) {
    this.DrawReelStrip(drawList, false);
    this.DrawReelStrip(drawList, true);
  }

  Process() {
    this.NextStep();
  }

  private DrawReelStrip(drawList: DrawList, wildOnly: boolean) {
    if (!this.m_symbolIds.length) return;
    const config = this.m_baseReelsView.GetReelsViewConfig();
    const subScreen = this.subScreen;
    const rowCount = config.subScreensConfig.visibleRows;
    const useClip = this.m_ucReelStatus !== EStatus.STOPPED;
    let pos = Math.trunc(this.m_ssCurPos / subScreen.reelStepY);
    const nPixelsFromCurrent = this.m_ssCurPos - pos * subScreen.reelStepY;
    if (useClip) {
      drawList.push_clip({ x: subScreen.reelAreaX, y: subScreen.reelAreaY, w: config.subScreensConfig.visibleCols * subScreen.reelStepX, h: rowCount * subScreen.reelStepY });
    }
    for (let squareIt = 0; squareIt <= rowCount; ++squareIt) {
      if (squareIt < rowCount || nPixelsFromCurrent !== 0) {
        const symbolId = this.m_symbolIds[pos];
        const isWild = symbolId === this.m_wildId;
        if (wildOnly === isWild && !this.m_baseReelsView.IsHiddenSymbol(this.m_reelIdx, squareIt)) {
          // the symbol art is the size of a reel cell and is placed at the cell's top-left
          const nPicX = subScreen.reelAreaX + subScreen.reelStepX * this.m_reelIdx;
          const nPicY = subScreen.reelAreaY + subScreen.reelStepY * squareIt - nPixelsFromCurrent;
          const image = this.m_elementsList.TryGet(this.m_resIds.get(symbolId) ?? '', ImageElement);
          if (image) {
            image.SetPosition({ x: nPicX, y: nPicY }).SetHidden(false);
            image.Draw(drawList);
            image.SetHidden(true);
          }
        }
      }
      if (++pos >= this.m_symbolIds.length) pos = 0;
    }
    if (useClip) drawList.pop_clip();
  }

  GetId() {
    return this.m_reelId;
  }

  GetIdx() {
    return this.m_reelIdx;
  }

  SetIdx(reelIdx: number) {
    this.m_reelIdx = reelIdx;
  }

  SetSubScreenIdx(subScreenIdx: number) {
    const config = this.m_baseReelsView.GetReelsViewConfig();
    if (!config.subScreensConfig.subScreens[subScreenIdx]) return;
    super.SetSubScreenIdx(subScreenIdx);
    // difference between stopping ticks and additional ticks, clamped
    const target = config.reelingParamsConfig.reelingAdditionalTicks;
    const epilogTicks = config.reelingParamsConfig.outroDeltaPosPerTick.length;
    const stoppingTicks = Math.trunc((this.subScreen.symbolHeight * config.subScreensConfig.visibleRows) / config.reelingParamsConfig.normalDeltaPosPerTick);
    this.m_usReelTicksStopEvent = Math.min(Math.max(target - stoppingTicks, 0), epilogTicks);
  }

  SetFakeSymbols(symbolIds: SymbolIds) {
    this.m_fakeSymbolIds = [...symbolIds];
    this.m_symbolIds = [...symbolIds];
    // offset current position and result indices
    const symbolsSize = this.m_symbolIds.length;
    const height = symbolsSize * this.subScreen.symbolHeight;
    this.m_ssCurPos = height ? this.m_ssCurPos % height : 0;
    this.m_nResultsPositions = this.m_nResultsPositions.map((position, i) => {
      const wrapped = position % symbolsSize;
      this.m_symbolIds[wrapped] = this.m_stopSymbolIds[i];
      return wrapped;
    });
    this.m_beforeStopPositions = this.m_beforeStopPositions.map((position, i) => {
      const wrapped = position % symbolsSize;
      this.m_symbolIds[wrapped] = this.m_beforeStopSymbolIds[i];
      return wrapped;
    });
    this.m_afterStopPositions = this.m_afterStopPositions.map((position, i) => {
      const wrapped = position % symbolsSize;
      this.m_symbolIds[wrapped] = this.m_afterStopSymbolIds[i];
      return wrapped;
    });
  }

  SetStopSymbols(symbolIds: SymbolIds) {
    this.m_stopSymbolIds = [...symbolIds];
  }

  SetSymbolsBeforeStop(symbolIds: SymbolIds) {
    this.m_beforeStopSymbolIds = [...symbolIds];
  }

  SetSymbolsAfterStop(symbolIds: SymbolIds) {
    this.m_afterStopSymbolIds = [...symbolIds];
  }

  StartReeling() {
    this.Start();
  }

  NormalStop() {
    const config = this.m_baseReelsView.GetReelsViewConfig();
    if (this.m_ucReelStatus === EStatus.INTRO || this.m_ucReelStatus === EStatus.STARTING || this.m_ucReelStatus === EStatus.REELING) {
      this.m_usStopStepsCount = 0;
      this.m_usStopStepsEnd = this.m_hasAttraction
        ? config.reelingParamsConfig.reelingAttractionAdditionalTicks - config.reelingParamsConfig.outroDeltaPosPerTick.length
        : this.m_reelIdx === 0 ? config.reelingParamsConfig.reelingMinDurationTicks : 1;
    }
    if (this.m_hasAttraction && !this.m_bAttractionSoundPlayed && this.m_ucReelStatus === EStatus.REELING) {
      this.m_baseReelsView.PlayAttractionSound();
      this.m_bAttractionSoundPlayed = true;
    }
  }

  FastStop() {
    this.m_usStopStepsCount = 0;
    this.m_usStopStepsEnd = 1;
  }

  ShowStopFigures() {
    this.InsertResults(true);
  }

  SetTags(tags: ERoundTags[]) {
    this.m_hasAttraction = tags.includes(ERoundTags.Attraction);
  }

  SetWildId(wildId: SymbolId) {
    this.m_wildId = wildId;
  }

  HasStopped() {
    return this.m_ucReelStatus === EStatus.STOPPED;
  }

  InEpilog() {
    return this.m_ucReelStatus === EStatus.EPILOG;
  }

  IsSpinningOrStopping() {
    return [EStatus.INTRO, EStatus.STARTING, EStatus.REELING, EStatus.STOPPING].includes(this.m_ucReelStatus);
  }

  private Start() {
    if (this.m_ucReelStatus !== EStatus.STOPPED) return;
    this.m_ucReelStatus = EStatus.INTRO;
    this.m_usStopStepsCount = 0;
    this.m_usStopStepsEnd = 0;
    this.m_hasAttraction = false;
    this.m_bStoppedSoundPlayed = false;
    this.m_bAttractionSoundPlayed = false;
  }

  private Stop() {
    if (this.m_ucReelStatus === EStatus.STOPPED || this.m_ucReelStatus === EStatus.EPILOG || this.m_ucReelStatus === EStatus.STOPPING) return;
    if (this.m_bAttractionSoundPlayed) this.m_baseReelsView.StopAttractionSound();
    this.m_ucReelStatus = EStatus.STOPPING;
    this.InsertResults(false);
    this.m_usCurIntroPos = 0;
  }

  private NextStep() {
    if (!this.m_symbolIds.length) return;
    const config = this.m_baseReelsView.GetReelsViewConfig();
    const params = config.reelingParamsConfig;
    const subScreen = this.subScreen;
    const height = this.m_symbolIds.length * subScreen.symbolHeight;
    const wrap = (value: number) => ((value % height) + height) % height;
    if (this.m_ucReelStatus === EStatus.INTRO) {
      this.m_ssCurPos = wrap(this.m_ssCurPos - params.introDeltaPosPerTick[this.m_usCurIntroPos++]);
      if (this.m_usCurIntroPos === params.introDeltaPosPerTick.length) {
        this.m_ucReelStatus = EStatus.STARTING;
        this.m_usCurIntroPos = 0;
      }
    } else if (this.m_ucReelStatus === EStatus.EPILOG) {
      this.m_ssCurPos = wrap(this.m_ssCurPos - params.outroDeltaPosPerTick[this.m_usCurEpilogPos++]);
      if (this.m_usCurEpilogPos === this.m_usReelTicksStopEvent) this.m_baseReelsView.OnReelStopped(this.GetSubScreenIdx(), this.m_reelIdx);
      if (this.m_usCurEpilogPos === params.outroDeltaPosPerTick.length) {
        this.m_ucReelStatus = EStatus.STOPPED;
        this.m_usCurEpilogPos = 0;
      } else if (params.outroDeltaPosPerTick[this.m_usCurEpilogPos] >= 0 && !this.m_bStoppedSoundPlayed) {
        this.m_baseReelsView.PlayStopSound(this.GetSubScreenIdx(), this.m_reelIdx);
        this.m_bStoppedSoundPlayed = true;
      }
    } else if (this.m_ucReelStatus !== EStatus.STOPPED) {
      this.m_ssCurPos = wrap(this.m_ssCurPos - this.m_usReelMovPiece);
      if (this.m_ucReelStatus === EStatus.STOPPING) {
        const ssDownBorder = this.m_nResultsPositions[0] * subScreen.symbolHeight;
        if (Math.abs(ssDownBorder - this.m_ssCurPos) <= this.m_usReelMovPiece) {
          this.m_ssCurPos = ssDownBorder;
          this.m_ucReelStatus = EStatus.EPILOG;
          this.m_usCurEpilogPos = 0;
        }
      }
      if (this.m_ucReelStatus === EStatus.STARTING) {
        const ssDownBorder = !this.m_nResultsPositions.length ? this.m_ssCurPos
          : wrap((this.m_nResultsPositions[0] - this.m_beforeStopPositions.length - config.subScreensConfig.visibleRows) * subScreen.symbolHeight + height);
        if (Math.abs(ssDownBorder - this.m_ssCurPos) <= this.m_usReelMovPiece) {
          this.m_ucReelStatus = EStatus.REELING;
          this.RemoveResults();
        }
      }
      if (this.m_ucReelStatus === EStatus.REELING) {
        this.m_usStopStepsCount++;
        if (this.m_usStopStepsEnd > 0 && this.m_usStopStepsCount >= this.m_usStopStepsEnd) {
          this.m_usStopStepsCount = 0;
          this.m_usStopStepsEnd = 0;
          this.Stop();
        }
      }
    }
  }

  private InsertResults(bBeginning: boolean) {
    const symbolsSize = this.m_symbolIds.length;
    if (!symbolsSize) return;
    const stopSymbolsSize = this.m_stopSymbolIds.length;
    const base = Math.trunc(this.m_ssCurPos / this.subScreen.symbolHeight);
    const shift = bBeginning ? 0 : stopSymbolsSize + this.m_afterStopSymbolIds.length;
    this.m_nResultsPositions = Array.from({ length: stopSymbolsSize }, (_, i) => (((base + i - shift) % symbolsSize) + symbolsSize) % symbolsSize);
    this.m_nResultsPositions.forEach((position, i) => { this.m_symbolIds[position] = this.m_stopSymbolIds[i]; });
    if (stopSymbolsSize > 0) {
      const beforeCount = this.m_beforeStopSymbolIds.length;
      this.m_beforeStopPositions = Array.from({ length: beforeCount }, (_, i) => (((this.m_nResultsPositions[0] - beforeCount + i) % symbolsSize) + symbolsSize) % symbolsSize);
      this.m_beforeStopPositions.forEach((position, i) => {
        if (!this.m_nResultsPositions.includes(position)) this.m_symbolIds[position] = this.m_beforeStopSymbolIds[i];
      });
      const afterCount = this.m_afterStopSymbolIds.length;
      this.m_afterStopPositions = Array.from({ length: afterCount }, (_, i) => (this.m_nResultsPositions[0] + stopSymbolsSize + i) % symbolsSize);
      this.m_afterStopPositions.forEach((position, i) => {
        if (!this.m_nResultsPositions.includes(position)) this.m_symbolIds[position] = this.m_afterStopSymbolIds[i];
      });
    }
  }

  private RemoveResults() {
    for (const position of [...this.m_nResultsPositions, ...this.m_beforeStopPositions, ...this.m_afterStopPositions]) {
      this.m_symbolIds[position] = this.m_fakeSymbolIds[position];
    }
    this.m_nResultsPositions = [];
    this.m_beforeStopPositions = [];
    this.m_afterStopPositions = [];
  }
}
