// The AudioManager module (plugins/src/Egt/AudioManager): provides IAudioApi, which plays the audio events of
// RssAudioData.json by id, one of an event's samples at a time (Random, or in turn for the Cycle strategy).
//
// The audio design (the AudioDesignConfig IData, audioDesignRssId of the module config) puts each event in a polyphony
// group: a group plays up to its limit of sounds, and then stops its oldest or its most recent one for the new one, or
// does not play it (its policy). An event of no known group does not play. A sound plays at its group's bus volume: the
// buses' volumes down from the master bus, whose volume is the volume preset (the module config's possibleSoundVolumes,
// cycled by the sound button, which skips the mute one when cycleSkipsMute), at the gain of the config's scale. The game
// pause (IPause) pauses every sound and resumes it, and a sound played while paused starts paused (C++'s OnGamePaused,
// OnGameResumed and Play). The C++ AudioBus and the fades are not ported: a bus is its configured volume here.

import { IAudioApi, IAudioApiEvents, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources, type RssAudioEvent } from '@game/engine/Game/RuntimeExport/IResources';
import { IPause } from '@game/engine/Game/RuntimeImport/IPause';
import { EgtALogCategoryClass, EgtAWarning } from '@game/engine/GameCore/Log/LogCategory';
import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

const MasterBusName = 'master';

// Egt::Game's audio design (Game/RuntimeExport/IAudioApi.data.h).

enum AudioPolyphonyLimitPolicy {
  StopOldest = 'StopOldest',
  StopMostRecent = 'StopMostRecent',
  StopShortest = 'StopShortest',
  DontPlay = 'DontPlay',
}

interface AudioBusConfig {
  name: string;
  parent?: string;
  /** Local volume level [0.0 = silent, 1.0 = full]. */
  volume?: number;
  muted?: boolean;
}

interface AudioPolyphonyGroupConfig {
  name: string;
  limit?: number;
  policy?: AudioPolyphonyLimitPolicy;
  bus?: string;
}

interface AudioDesignConfig {
  buses?: AudioBusConfig[];
  polyphonyGroups?: AudioPolyphonyGroupConfig[];
}

/** Egt::Game::AudioManagerConfig (AudioManager.data.h). */
interface AudioManagerSettings {
  /** The volume gain scale to use for converting normalized volume values [0.0-1.0] to gain values [0.0-1.0]. */
  volumeGainScale: 'Linear' | 'Stevens' | 'Exponential';
  /** The RSS ID of the AudioDesignConfig resource that defines the audio design for this game. */
  audioDesignRssId: string;
  /** The list of possible sound volumes (normalized [0.0-1.0]) that can be applied as presets. */
  possibleSoundVolumes: number[];
  /** Whether cycling through volume presets should skip the mute preset. */
  cycleSkipsMute: boolean;
}

/** The module config: the settings it sets. */
type AudioManagerConfig = ModuleConfig & Partial<AudioManagerSettings>;

class AudioPlayback implements IAudioPlayback {
  /** Held by the game pause: it plays on when the game resumes. */
  pausedByGame = false;

  constructor(readonly audio: HTMLAudioElement, readonly bus: string) {}

  Stop() {
    this.pausedByGame = false;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  IsPlaying() {
    return this.pausedByGame || (!this.audio.paused && !this.audio.ended);
  }

  /** audio_player's pause of a sound. */
  Pause() {
    if (!this.IsPlaying()) return;
    this.pausedByGame = true;
    this.audio.pause();
  }

  /** audio_player's resume of a sound. */
  Resume() {
    if (!this.pausedByGame) return;
    this.pausedByGame = false;
    if (this.audio.volume > 0) this.audio.play().catch(() => {});
  }
}

export class AudioManager extends BaseModule implements IAudioApi {
  private readonly events = new IAudioApiEvents();
  private m_config: AudioManagerSettings = {
    volumeGainScale: 'Stevens', audioDesignRssId: '', possibleSoundVolumes: [], cycleSkipsMute: true,
  };
  private readonly m_buses = new Map<string, AudioBusConfig>();
  private m_polyphonyGroups: AudioPolyphonyGroupConfig[] = [];
  private readonly m_polyphonyGroupMap = new Map<string, AudioPolyphonyGroupConfig>();
  /** Each group's sounds, oldest first (C++'s m_groupPlaybacks deques). */
  private readonly m_groupPlaybacks = new Map<string, AudioPlayback[]>();
  private readonly m_cycleIndex = new Map<string, number>();
  private m_activePlaybacks: AudioPlayback[] = [];
  private m_currentVolumePresetIndex = 0;
  private readonly missing = new Set<string>();

  Init(runtime: Runtime, config: AudioManagerConfig) {
    super.Init(runtime, config);

    this.m_config = {
      volumeGainScale: config.volumeGainScale ?? 'Stevens',
      audioDesignRssId: config.audioDesignRssId ?? '',
      possibleSoundVolumes: [...(config.possibleSoundVolumes ?? [])],
      cycleSkipsMute: config.cycleSkipsMute ?? true,
    };

    // Validate config
    if (this.m_config.possibleSoundVolumes.length === 0) {
      EgtAWarning('AudioManager requires at least one possibleSoundVolume');
      this.m_config.possibleSoundVolumes = [1.0];
    }
    console.assert(this.m_config.possibleSoundVolumes.every((volume, i, volumes) => i === 0 || volumes[i - 1] <= volume));

    this.RuntimeAdd(IAudioApi, this);
    this.RuntimeAdd(IAudioApi.Events, this.events);
    return true;
  }

  PostInit() {
    if (!super.PostInit()) return false;

    // Load the AudioDesignConfig from the resource system
    const resources = this.RuntimeGet(IResources);
    const audioDesign: AudioDesignConfig = this.m_config.audioDesignRssId && resources.HasIData(this.m_config.audioDesignRssId)
      ? resources.GetIData<AudioDesignConfig>(this.m_config.audioDesignRssId) : {};
    this.LoadDesignConfig(audioDesign);

    const pause = this.RuntimeTryGetConst(IPause.Events);
    if (pause) {
      pause.paused.RegisterInstant(this, () => this.OnGamePaused());
      pause.resumed.RegisterInstant(this, () => this.OnGameResumed());
    }

    return true;
  }

  private OnGamePaused() {
    for (const playback of this.m_activePlaybacks) playback.Pause();
  }

  private OnGameResumed() {
    for (const playback of this.m_activePlaybacks) playback.Resume();
  }

  Deinit() {
    const pause = this.RuntimeTryGetConst(IPause.Events);
    pause?.paused.Unregister(this);
    pause?.resumed.Unregister(this);
    this.StopAll();
    this.RuntimeRemove(IAudioApi);
    this.RuntimeRemove(IAudioApi.Events);
    super.Deinit();
  }

  private LoadDesignConfig(designConfig: AudioDesignConfig) {
    const buses = [...(designConfig.buses ?? [])];
    // Ensure 'master' bus config exists
    if (!buses.some(cfg => cfg.name === MasterBusName)) {
      EgtAWarning("No 'master' bus defined — creating a default one");
      buses.unshift({ name: MasterBusName, parent: '', volume: 1.0, muted: false });
    }

    // Build bus hierarchy
    for (const busCfg of buses) {
      this.m_buses.set(busCfg.name, { ...busCfg });
    }
    // Initialize the current volume preset index based on the master bus's volume.
    this.m_currentVolumePresetIndex = this.FindNearestPresetIndex(this.GetBusEffectiveVolume(MasterBusName));

    // Store polyphony group configs and build lookup map
    this.m_polyphonyGroups = designConfig.polyphonyGroups ?? [];
    for (const g of this.m_polyphonyGroups) {
      this.m_polyphonyGroupMap.set(g.name, g);
    }
  }

  /** AudioBus::GetEffectiveVolume: its volume (0 when muted), times its parents'. */
  private GetBusEffectiveVolume(name: string): number {
    const bus = this.m_buses.get(name);
    if (!bus) return 1.0;
    let effectiveVolume = bus.muted ? 0.0 : (bus.volume ?? 1.0);
    if (bus.parent && bus.parent !== name) {
      effectiveVolume *= this.GetBusEffectiveVolume(bus.parent);
    }
    return effectiveVolume;
  }

  Play(name: string): IAudioPlayback | null {
    if (!name) return null;

    // Resolve AudioEvent resource
    const audioEvent = this.RuntimeGet(IResources).GetAudioEvent(name);
    if (!audioEvent) {
      this.missing.add(name);
      EgtAWarning("Play('{}') — unknown or unloadable AudioEvent", name);
      return null;
    }

    // Resolve polyphony group
    let groupCfg: AudioPolyphonyGroupConfig | null = null;
    if (audioEvent.polyphonyGroup) {
      groupCfg = this.m_polyphonyGroupMap.get(audioEvent.polyphonyGroup) ?? null;
    }
    if (!groupCfg) {
      console.assert(false, `Play('${name}') — no polyphony group '${audioEvent.polyphonyGroup ?? ''}'`);
      return null;
    }

    if (!this.EnforcePolyphonyLimit(groupCfg)) {
      return null; // DontPlay policy — limit reached.
    }

    // Resolve bus
    let bus = MasterBusName;
    if (groupCfg.bus && this.m_buses.has(groupCfg.bus)) {
      bus = groupCfg.bus;
    } else {
      EgtAWarning("Play('{}') — bus '{}' not found, using master", name, groupCfg.bus ?? '');
    }

    // Select sample index
    if (!audioEvent.files.length) {
      this.missing.add(name);
      EgtAWarning("Play('{}') — AudioEvent has no samples", name);
      return null;
    }

    const sampleIndex = this.SelectSampleIndex(audioEvent, name);
    const file = audioEvent.files[sampleIndex];
    const audio = new Audio(this.RuntimeGet(IResources).FileUrl(file));
    audio.loop = !!audioEvent.loop;
    audio.volume = this.ConvertVolumeToGain(this.GetBusEffectiveVolume(bus));
    const playback = new AudioPlayback(audio, bus);

    // Track the playback
    this.m_activePlaybacks = this.m_activePlaybacks.filter(item => item.IsPlaying());
    this.m_activePlaybacks.push(playback);
    const groupPlaybacks = this.m_groupPlaybacks.get(groupCfg.name) ?? [];
    groupPlaybacks.push(playback);
    this.m_groupPlaybacks.set(groupCfg.name, groupPlaybacks);

    // Play via audio_player
    if (audio.volume > 0) audio.play().catch(() => {});
    const pause = this.RuntimeTryGetConst(IPause);
    if (pause && pause.IsPaused()) {
      playback.Pause();
    }
    this.events.playbackStarted.Post(name, playback);

    return playback;
  }

  StopAll() {
    for (const playback of this.m_activePlaybacks) playback.Stop();
    this.m_activePlaybacks = [];
    this.m_groupPlaybacks.clear();
  }

  /** Audio events the game played that no descriptor declares. */
  MissingEvents() {
    return [...this.missing];
  }

  GetVolumePresetCount() {
    return this.m_config.possibleSoundVolumes.length;
  }

  GetCurrentVolumePresetIndex() {
    return this.m_currentVolumePresetIndex;
  }

  ApplyVolumePreset(index: number) {
    // Note: setting the master bus volume will trigger OnMasterBusVolumeChanged and m_currentVolumePresetIndex may be corrected.
    this.m_currentVolumePresetIndex = index;
    this.SetMasterBusVolume(this.GetPresetIndexVolume(index));
  }

  CycleVolumePreset() {
    const presets = this.m_config.possibleSoundVolumes.length;
    if (!(presets >= 2)) return;
    let nextIndex = (this.m_currentVolumePresetIndex + 1) % presets;
    if (this.m_config.cycleSkipsMute && presets > 1 && this.GetPresetIndexVolume(nextIndex) === 0.0) {
      nextIndex = (nextIndex + 1) % presets;
    }
    this.ApplyVolumePreset(nextIndex);
  }

  private GetPresetIndexVolume(index: number) {
    if (!(index < this.m_config.possibleSoundVolumes.length)) {
      console.assert(false, 'AudioManager: no volume preset of the index');
      return 1.0;
    }
    return this.m_config.possibleSoundVolumes[index];
  }

  private FindNearestPresetIndex(volume: number) {
    const volumes = this.m_config.possibleSoundVolumes;
    if (volumes.length === 0) {
      console.assert(false, 'AudioManager: no volume presets');
      return 0;
    }
    /// Use std::upper_bound to find the first preset volume greater than the given volume. Compare with the
    /// previous preset to find the nearest index. Prefer higher index on ties.
    let it = volumes.findIndex(item => item > volume);
    if (it === -1) it = volumes.length;
    if (it === 0) return 0;
    if (it === volumes.length) return volumes.length - 1;
    const prev = it - 1;
    return volume - volumes[prev] < volumes[it] - volume ? prev : it;
  }

  /** AudioBus::SetVolume of the master bus: its volumeChanged runs OnMasterBusVolumeChanged, and the sounds play on at
   * their buses' new volumes. */
  private SetMasterBusVolume(volume: number) {
    const master = this.m_buses.get(MasterBusName);
    if (!master) {
      console.assert(false, 'AudioManager: no master bus');
      return;
    }
    if ((master.volume ?? 1.0) === volume) return;
    master.volume = volume;
    for (const playback of this.m_activePlaybacks) playback.audio.volume = this.ConvertVolumeToGain(this.GetBusEffectiveVolume(playback.bus));
    this.OnMasterBusVolumeChanged();
  }

  private OnMasterBusVolumeChanged() {
    const oldPresetIndex = this.m_currentVolumePresetIndex;

    /// Note: Use the effective volume of the master bus, which accounts for the mute flag.
    const masterVolume = this.GetBusEffectiveVolume(MasterBusName);

    /// Update the current volume preset index based on the new master bus volume.
    this.m_currentVolumePresetIndex = this.FindNearestPresetIndex(masterVolume);

    if (oldPresetIndex !== this.m_currentVolumePresetIndex) {
      this.events.volumePresetChanged.Post(this.m_currentVolumePresetIndex);
    }
  }

  private SelectSampleIndex(audioEvent: RssAudioEvent, name: string) {
    const count = audioEvent.files.length;
    if (count <= 1) {
      return 0;
    }

    // Use the strategy field from the AudioEvent resource.
    if (audioEvent.strategy === 'Cycle') {
      const index = this.m_cycleIndex.get(name);
      if (index !== undefined) {
        this.m_cycleIndex.set(name, index + 1);
        return index % count;
      } else {
        this.m_cycleIndex.set(name, 1);
        return 0;
      }
    }

    // Default: Random
    return Math.floor(Math.random() * count);
  }

  private EnforcePolyphonyLimit(group: AudioPolyphonyGroupConfig) {
    // Prune dead playbacks first.
    const deque = (this.m_groupPlaybacks.get(group.name) ?? []).filter(p => p.IsPlaying());
    this.m_groupPlaybacks.set(group.name, deque);

    if (deque.length < (group.limit ?? 4)) {
      return true; // Under the limit.
    }

    switch (group.policy ?? AudioPolyphonyLimitPolicy.StopOldest) {
      case AudioPolyphonyLimitPolicy.DontPlay:
        return false;

      case AudioPolyphonyLimitPolicy.StopOldest: {
        if (deque.length) {
          deque[0].Stop();
          deque.shift();
        }
        return true;
      }

      case AudioPolyphonyLimitPolicy.StopMostRecent: {
        if (deque.length) {
          deque[deque.length - 1].Stop();
          deque.pop();
        }
        return true;
      }

      case AudioPolyphonyLimitPolicy.StopShortest: {
        if (deque.length) {
          deque[0].Stop();
          deque.shift();
        }
        return true;
      }
    }

    return true;
  }

  private ConvertVolumeToGain(volume: number) {
    if (volume <= 0) return 0;
    if (volume >= 1) return 1;
    switch (this.m_config.volumeGainScale) {
      case 'Linear':
        return volume;
      case 'Stevens':
        return Math.pow(volume, 1.5);
      case 'Exponential':
        return (Math.pow(10, volume) - 1) / (10 - 1);
      default:
        console.assert(false, 'Unknown VolumeGainScale');
        return volume;
    }
  }
}

EgtALogCategoryClass(AudioManager, 'AudioManager');
