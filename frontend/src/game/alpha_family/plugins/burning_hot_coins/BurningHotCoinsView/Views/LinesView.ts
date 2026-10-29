// Egt::Game::AlphaFamily::LinesView (BurningHotCoinsView/Views/LinesView.h/.cpp): the main reels' winning
// lines, shown one at a time: fast once (then showFastLinesFinished), then slowly, over and over.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources, type RssRect } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { CombinationType, ERoundTags, type SymbolId, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { CombinationsEqual, type ReelCombination, type ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ILinesView, ILinesViewEvents, LineType } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { LinesVisual } from '../Visuals/LinesVisual';
import type { LinesViewConfig } from './LinesView.data';
import type { ReelSubScreen } from './ReelSubScreen.data';
import { CoinsBarViewToken } from './CoinsBarView';
import { CreditsWinBarViewToken } from './CreditsWinBarView';

const LinesViewId = 'LinesView';

const AudioEventCollectId = 'SOUND_WIN_COLLECT';
const AudioEventCollectEndId = 'SOUND_WIN_COLLECT_END';

enum AudioProgress {
  Idle,
  PlayingCombination,
  PlayingCollect,
}

enum AnimationCommand {
  PlayAnimations,
  PauseAnimations,
  ResumeAnimations,
}

export class LinesView extends BaseView implements ILinesView {
  protected readonly m_events = new ILinesViewEvents();

  private m_actionFastTimer = new tweeny.tween_action();
  private m_lines: LinesVisual[] = [];

  private m_isShowFast = false;
  private m_isAutoPlayEnabled = false;
  private m_hasShownStatusLine = false;
  private m_winTags: ERoundTags[] = [];
  private m_combinations: ReelCombinations = [];

  private m_sentinel = new sentinel();
  private m_actionBlink = new tweeny.tween_action();

  private m_autoPlayTimer = new tweeny.tween_action(); // used to skip win lines when auto play is on

  private m_combinationPlayback: IAudioPlayback | null = null;
  private m_collectPlayback: IAudioPlayback | null = null;
  private m_audioProgress = AudioProgress.Idle;

  private m_config!: LinesViewConfig;

  private m_lastAnimationCommand = AnimationCommand.PlayAnimations;

  constructor() {
    super(LinesViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ILinesView, this);
    this.RuntimeAdd(ILinesView.Events, this.m_events);

    this.InitConfig();
    // when its config's file changes, the lines shown are made again from it
    BrowserOnly(() => this.WatchConfig('LinesViewConfig', () => this.ReloadConfig()));

    this.InitElementsList(LinesViewId, () => {
      this.OnElementsListLoaded();
    });

    this.InitIdleTimer();

    return true;
  }

  Deinit() {
    this.ClearLines();
    this.DeinitElementsList();

    this.RuntimeRemove(ILinesView);
    this.RuntimeRemove(ILinesView.Events);

    super.Deinit();
  }

  Process() {
    super.Process();

    this.UpdateAudio();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;

    for (const line of this.m_lines) {
      line.Draw(drawList);
    }
  }

  SetWinLineTags(tags: ERoundTags[]) {
    if (tags.length === this.m_winTags.length && tags.every((tag, index) => tag === this.m_winTags[index])) return;
    this.m_winTags = tags;
  }

  ShowWinLine(combination: ReelCombination, _type = LineType.eSteadyForever) {
    this.ShowCombinations([combination], true, false);
  }

  ShowCombinations(combinations: ReelCombinations, fast: boolean, autoPlayEnabled: boolean) {
    if (CombinationsEqual(combinations, this.m_combinations)) return;

    this.ClearLines();

    this.m_lastAnimationCommand = AnimationCommand.PlayAnimations;
    this.m_combinations = combinations;
    this.m_isShowFast = fast;
    this.m_isAutoPlayEnabled = autoPlayEnabled;

    if (this.m_isAutoPlayEnabled) {
      this.StartAutoPlayIdleTimer();
    }

    if (this.m_isShowFast) {
      const winAudioEventId = this.GetWinAudioEventIdFromCombinations(this.m_combinations, this.m_isAutoPlayEnabled);
      this.PlayAudio(winAudioEventId);
    }
    if (!this.m_combinations.length) {
      this.StopAudio();
    }

    combinations.forEach((comb, i) => {
      switch (comb.type) {
        case CombinationType.LeftToRight: {
          const config = this.m_config.lines?.[comb.id];
          const squareKey = this.m_config.winSquareRssKeys?.[comb.id];
          if (!config || !squareKey) return;

          const line = this.CreateLineVisual(comb.symbolViewInfos, squareKey, i === 0, fast);

          const lineElement = this.m_elementsList.Create(ImageElement, config.imageId).SetPosition(config.offset).SetScale(config.scale);

          line.AddLineId(lineElement.GetId());

          const shadowLineElement = this.m_elementsList.Create(ImageElement, config.imageId)
            .SetPosition(config.offset)
            .SetScale(config.scale)
            .SetColor({ r: 160, g: 160, b: 160 });

          line.AddShadowLineId(shadowLineElement.GetId());

          this.m_lines.push(line);
          break;
        }
        case CombinationType.Scatter: {
          const line = this.CreateLineVisual(comb.symbolViewInfos, this.m_config.winSquareScatterRssKey ?? '', i === 0, fast);

          this.m_lines.push(line);
          break;
        }
        default:
          break;
      }
    });

    this.AdjustVisibility();
  }

  UpdateShownCombinations(autoPlayEnabled: boolean) {
    if (this.m_isAutoPlayEnabled === autoPlayEnabled) return;
    this.m_isAutoPlayEnabled = autoPlayEnabled;

    if (!autoPlayEnabled) {
      tweeny.stop(this.m_autoPlayTimer);
    }
  }

  PlayWinLinesSounds(_todo_useSpecificType: string) {}

  StopWinLinesSounds(reason: string) {
    if (reason === 'AccumulationInstantEnd' && this.m_audioProgress === AudioProgress.PlayingCombination) return;

    this.StopAudio();
  }

  PlayBackgroundMusic(_roundName: string) {}

  StopBackgroundMusic(_roundName: string) {}

  ClearLines() {
    tweeny.stop(this.m_autoPlayTimer);

    for (const line of this.m_lines) {
      line.EnableBlinking(false);
    }

    tweeny.stop(this.m_actionBlink);
    tweeny.stop(this.m_actionFastTimer);
    this.m_lines = [];
    this.m_combinations = [];
    this.m_isAutoPlayEnabled = false;
    this.m_lastAnimationCommand = AnimationCommand.PlayAnimations;
    this.m_elementsList.RemoveAll();

    this.StopAllSounds();
  }

  PauseAnimations() {
    this.m_lastAnimationCommand = AnimationCommand.PauseAnimations;

    tweeny.pause(this.m_actionBlink);
    tweeny.pause(this.m_actionFastTimer);
    tweeny.pause(this.m_autoPlayTimer);

    this.m_lines.forEach((line, i) => {
      if (!this.m_hasShownStatusLine) {
        line.SetVisible(i === 0);
      }

      line.EnableBlinking(false);
      line.PauseAnimations();

      for (const light of line.GetLightIds()) {
        const lightElement = this.m_elementsList.TryGet(light, AnimElement);
        if (!lightElement) continue;

        lightElement.Stop();
      }
    });
  }

  ResumeAnimations() {
    this.m_lastAnimationCommand = AnimationCommand.ResumeAnimations;

    tweeny.resume(this.m_actionBlink);
    tweeny.resume(this.m_autoPlayTimer);
    tweeny.resume(this.m_actionFastTimer);

    for (const line of this.m_lines) {
      line.ResumeAnimations();

      for (const light of line.GetLightIds()) {
        const lightElement = this.m_elementsList.TryGet(light, AnimElement);
        if (!lightElement) continue;

        lightElement.Play();
      }
    }
  }

  StopAllSounds() {
    this.m_audioProgress = AudioProgress.Idle;

    this.m_collectPlayback?.Stop();
    this.m_combinationPlayback?.Stop();
  }

  private OnElementsListLoaded() {
    this.m_sentinel = make_sentinel();

    this.AdjustVisibility();

    switch (this.m_lastAnimationCommand) {
      case AnimationCommand.PauseAnimations:
        this.PauseAnimations();
        break;
      default:
        break;
    }
  }

  private AdjustVisibility() {
    if (this.m_actionBlink.is_valid()) {
      tweeny.stop_and_finish(this.m_actionBlink);
    }

    const interval = (this.m_isShowFast ? this.m_config.fastShowInterval : this.m_config.slowShowInterval) ?? 0;
    const showEnd = (this.m_isShowFast ? this.m_config.fastShowEnd : this.m_config.slowShowEnd) ?? 0;

    if (this.m_isShowFast) {
      const actionEndTime = tweeny.delay(this.m_lines.length * (this.m_config.fastShowInterval ?? 0));

      actionEndTime.on_end.connect(() => {
        this.m_isShowFast = false;
        this.AdjustVisibility();

        this.m_events.showFastLinesFinished.Post();
        this.m_events.showCombinationsFinished.Post();
      });

      this.m_actionFastTimer = actionEndTime;
    }

    const actionsList: tweeny.tween_action[] = [];

    this.m_lines.forEach((line, index) => {
      line.SetLightsVisibility(!this.m_isShowFast);
      line.CreateBlinking(this.m_config.shadowBlinkingInterval ?? 0);

      const actionVisibleCombo = tweeny.delay(showEnd, this.m_sentinel);
      actionVisibleCombo.on_begin.connect(() => {
        this.m_lines[index].SetVisible(true);
        this.m_lines[index].EnableBlinking(!this.m_isShowFast);
        this.m_hasShownStatusLine = true;
      });
      actionVisibleCombo.on_end.connect(() => {
        this.m_lines[index].SetVisible(false);
        this.m_lines[index].EnableBlinking(false);
      });

      const actionComboInterval = tweeny.together([actionVisibleCombo, tweeny.delay(interval, this.m_sentinel)], this.m_sentinel);

      actionsList.push(actionComboInterval);
    });

    const actionSequence = tweeny.sequence_precise(actionsList, this.m_sentinel);
    const actionLooped = tweeny.repeat_precise(actionSequence, this.m_sentinel);

    this.m_actionBlink = actionLooped;

    tweeny.start(this.m_actionBlink, 'LinesView:ActionBlink');

    if (this.m_isShowFast) {
      tweeny.start(this.m_actionFastTimer);
    }
  }

  private CreateLineVisual(symbolViewInfos: SymbolViewInfos, imageId: string, first: boolean, fast: boolean) {
    const line = new LinesVisual(this.m_elementsList);

    const subScreen = this.m_config.subScreen;

    for (const viewInfo of symbolViewInfos) {
      const offset = this.m_config.winSquareOffsets?.[viewInfo.coord.rowId];
      if (!offset) continue;

      const x = subScreen.reelAreaX + subScreen.reelStepX * viewInfo.coord.reelId + offset.x;
      const y = subScreen.reelAreaY + subScreen.reelStepY * viewInfo.coord.rowId + offset.y;
      const squarePosition = { x, y };
      const square = this.m_elementsList.Create(ImageElement, imageId).SetPosition(squarePosition);
      line.AddSquareId(square.GetId(), () => this.CalculateSquareCutBounds(square.GetBounds()), first);

      const shadowSquare = this.m_elementsList.Create(ImageElement, imageId)
        .SetPosition(squarePosition)
        .SetColor({ r: 160, g: 160, b: 160 });
      line.AddShadowSquareId(shadowSquare.GetId());

      const lightsOffset = this.m_config.squareLightsOffset ?? { x: 0, y: 0 };
      const light = this.m_elementsList.Create(AnimElement, this.m_config.squareLightsRssKey ?? '')
        .SetPosition({ x: squarePosition.x + lightsOffset.x, y: squarePosition.y + lightsOffset.y });
      line.AddLightId(light.GetId());
      line.SetLightsVisibility(!fast);
    }

    return line;
  }

  private CalculateSquareCutBounds(bounds: RssRect): RssRect {
    const inset = this.m_config.winSquareCutInset ?? { x: 0, y: 0, w: 0, h: 0 };
    return { x: bounds.x + inset.x, y: bounds.y + inset.y, w: bounds.w - inset.w, h: bounds.h - inset.h };
  }

  private GetWinAudioEventIdFromCombinations(combinations: ReelCombinations, autoPlayEnabled: boolean) {
    const noResult = '';
    if (!combinations.length) return noResult;
    const isBigWin: boolean =
      (!autoPlayEnabled && this.m_winTags.includes(ERoundTags.BigWin));
    if (isBigWin) return noResult;

    // std::tie(type, symbolCount, symbolId) <: the first of the highest
    const higherSoundPriorityCombination = (a: ReelCombination, b: ReelCombination) =>
      a.type !== b.type ? a.type < b.type : a.symbolCount !== b.symbolCount ? a.symbolCount < b.symbolCount : a.symbolId < b.symbolId;
    let highestSoundPriorityCombination = combinations[0];
    for (const combination of combinations) {
      if (higherSoundPriorityCombination(highestSoundPriorityCombination, combination)) highestSoundPriorityCombination = combination;
    }

    const symbolCount = highestSoundPriorityCombination.symbolCount;
    const symbolId = highestSoundPriorityCombination.symbolId;

    const soundRssKey = symbolCount === 5 ? this.m_config.winFiguresX5SoundRssKeys![symbolId] : this.m_config.winFiguresDefaultSoundRssKeys![symbolId];
    return soundRssKey;
  }

  private PlayAudio(winAudioEventId: string) {
    this.StopAudio();
    if (!winAudioEventId) return;
    const audioApi = this.RuntimeTryGet(IAudioApi);
    if (!audioApi) return;
    this.m_combinationPlayback = audioApi.Play(winAudioEventId);
    this.m_audioProgress = AudioProgress.PlayingCombination;
  }

  private StopAudio() {
    switch (this.m_audioProgress) {
      case AudioProgress.PlayingCollect: {
        this.m_collectPlayback?.Stop();
        const audioApi = this.RuntimeTryGet(IAudioApi);
        if (!audioApi) return;
        audioApi.Play(AudioEventCollectEndId);
        break;
      }
      default:
        this.m_collectPlayback?.Stop();
        this.m_combinationPlayback?.Stop();
        break;
    }
    this.m_audioProgress = AudioProgress.Idle;
  }

  private UpdateAudio() {
    const audioApi = this.RuntimeTryGet(IAudioApi);
    switch (this.m_audioProgress) {
      case AudioProgress.Idle:
        return;
      case AudioProgress.PlayingCombination: {
        if (!this.m_combinationPlayback) return;
        if (this.m_combinationPlayback.IsPlaying()) return;
        this.m_combinationPlayback.Stop();
        if (!audioApi) return;

        if (this.RuntimeGet(CoinsBarViewToken).IsCurrentlyAccumulating() ||
          this.RuntimeGet(CreditsWinBarViewToken).IsCurrentlyAccumulating()) {
          this.m_collectPlayback = audioApi.Play(AudioEventCollectId);
          this.m_audioProgress = AudioProgress.PlayingCollect;
        } else {
          this.m_audioProgress = AudioProgress.Idle;
        }
        break;
      }
      case AudioProgress.PlayingCollect: {
        if (!this.m_collectPlayback) return;
        if (this.m_collectPlayback.IsPlaying()) return;
        this.m_collectPlayback.Stop();
        if (!audioApi) return;
        audioApi.Play(AudioEventCollectEndId);
        this.m_audioProgress = AudioProgress.Idle;
        break;
      }
      default:
        break;
    }
  }

  private InitConfig() {
    this.m_config = this.RuntimeGet(IResources).GetIData<LinesViewConfig>('LinesViewConfig');
  }

  /** Reads its config again, when its file changed, and makes again what it made from it: the idle timer, and the lines
   * shown, whose show starts over (the fast show with its sound).
   * @browserOnly */
  private ReloadConfig() {
    const combinations = this.m_combinations;
    const fast = this.m_isShowFast;
    const autoPlayEnabled = this.m_isAutoPlayEnabled;
    const animationCommand = this.m_lastAnimationCommand;

    this.ClearLines();
    this.InitConfig();
    this.InitIdleTimer();
    if (!combinations.length) return;

    this.ShowCombinations(combinations, fast, autoPlayEnabled);
    if (animationCommand === AnimationCommand.PauseAnimations) this.PauseAnimations();
  }

  private InitIdleTimer() {
    const timerDuration = this.m_config.autoPlayIdleTimer ?? 0;

    const timerAction = tweeny.delay(timerDuration);

    timerAction.on_end.connect(() => {
      if (!this.m_isAutoPlayEnabled) return;

      for (const line of this.m_lines) {
        line.EnableBlinking(false);
      }

      tweeny.stop(this.m_actionBlink);
      this.m_events.showFastLinesFinished.Post();
      this.m_events.showCombinationsFinished.Post();
    });

    this.m_autoPlayTimer = timerAction;
  }

  private StartAutoPlayIdleTimer() {
    tweeny.start(this.m_autoPlayTimer);
  }
}
