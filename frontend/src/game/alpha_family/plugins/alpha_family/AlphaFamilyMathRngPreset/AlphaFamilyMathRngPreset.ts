// Egt::Game::AlphaFamily::AlphaFamilyMathRngPreset (AlphaFamilyMathRngPreset/AlphaFamilyMathRngPreset.h/.cpp, a module
// of the QA and debug builds' modules config): the RNG Presets, Tools → RNG Presets. Its window ("RNG Preset") is the
// game's DevMathRngPresetConfig as menus, each preset queuing the RNG numbers of its results in the kernel's RNG queue
// (IRngPreset). It provides the RNG queue's grid preview (IRngQueueGridPreview) and applies presets by path
// (IRngPresetApplier). The Play page draws its window in Vue (debug/RngPresetWindow.vue).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IDebugOverlay, type MainMenuBar } from '@game/engine/Game/RuntimeExport/IDebugOverlay';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IRngPreset } from '@game/engine/Game/RuntimeImport/IRngPreset';
import { GetImageData } from '@game/engine/GameVideoCtrl/ImageData';
import { SBool } from '@game/engine/ImGuiEx/Extensions/Utils';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { IRngPresetApplier } from '@game/integration/Runtime/IRngPresetApplier';
import { IRngQueueGridPreview } from '@game/integration/Runtime/IRngQueueGridPreview';
import type { RoundType, SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { RngPresetContext } from './RngPresetContext';
import { RngPresets } from './RngPresets';
import { type RngPresetsData, RngPresetsDataFrom } from './RngPresets.data';
import { RngQueueGridPreview, RngQueueGridPreviewContext } from './RngQueueGridPreview';

export class AlphaFamilyMathRngPreset extends BaseModule implements IRngPresetApplier {
  readonly m_imguiWindowOpen = new SBool('RngPreset_open');
  private m_context: RngPresetContext | null = null;
  m_data: RngPresets | null = null;
  private m_rngQueueGridPreview: RngQueueGridPreview | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.m_context = new RngPresetContext();
    this.m_data = new RngPresets();

    const debugOverlay = this.RuntimeTryGetConst(IDebugOverlay.Events);
    if (debugOverlay) {
      debugOverlay.imguiMainMenuBar.RegisterInstant(this, menuBar => this.OnImGuiMainMenuBar(menuBar));
    }

    this.m_imguiWindowOpen.Load();

    return true;
  }

  PostInit() {
    this.m_context!.m_mathRules = this.RuntimeTryGetConst(IMathRules) ?? null;
    this.m_context!.m_kernelRngPresets = this.RuntimeTryGet(IRngPreset) ?? null;

    let data: RngPresetsData = { name: '' };
    const resources = this.RuntimeGet(IResources);
    if (resources.HasIData('DevMathRngPresetConfig')) {
      data = RngPresetsDataFrom(resources.GetIData<Record<string, unknown>>('DevMathRngPresetConfig'));
    } else {
      console.warn('AlphaFamilyMathRngPreset: the game has no DevMathRngPresetConfig IData');
    }

    this.m_data!.Init(this.m_context, data);

    this.m_rngQueueGridPreview = new RngQueueGridPreview(this.BuildGridPreviewContext());
    this.m_context!.m_rngQueueGridPreview = this.m_rngQueueGridPreview;
    this.RuntimeAdd(IRngQueueGridPreview, this.m_rngQueueGridPreview);

    this.RuntimeAdd(IRngPresetApplier, this);

    return true;
  }

  ApplyPresetByPath(path: string[]) {
    return this.m_data!.ApplyByPath(path);
  }

  ListPresetPaths() {
    return this.m_data!.ListLeafPaths();
  }

  PreDeinit() {
    this.RuntimeRemove(IRngPresetApplier);
    this.RuntimeRemove(IRngQueueGridPreview);
    this.m_context!.m_rngQueueGridPreview = null;
    this.m_rngQueueGridPreview = null;

    this.m_data!.Deinit();
    this.m_context!.m_mathRules = null;
    this.m_context!.m_kernelRngPresets = null;
  }

  Deinit() {
    this.RuntimeTryGetConst(IDebugOverlay.Events)?.imguiMainMenuBar.Unregister(this);

    this.m_data = null;
    this.m_context = null;
    super.Deinit();
  }

  Process() {
    super.Process();

    // C++ saves the window's state at the end of its ImGuiDraw, every frame
    this.m_imguiWindowOpen.Save();
  }

  private OnImGuiMainMenuBar(menuBar: MainMenuBar) {
    menuBar.MenuItem('Tools', 'RNG Presets', () => {
      this.m_imguiWindowOpen.value = true;
    });
  }

  private BuildGridPreviewContext() {
    const context = new RngQueueGridPreviewContext();
    const mathRules = this.m_context!.m_mathRules;
    context.m_mathRules = mathRules;
    context.m_symbolNameGetter = (roundType: RoundType, id: SymbolId): [boolean, string] => {
      if (!mathRules) return [false, ''];
      const symbols = mathRules.GetReelRoundRules(roundType).GetSymbolNames();
      for (const symbol of symbols) {
        if (symbol.id === id) {
          return [true, symbol.name];
        }
      }
      return [false, `Undefined${id}`];
    };
    const runtime = this.GetRuntime();
    context.m_imageGetter = (rssKey: string) => GetImageData(runtime.Get(IResources), rssKey);
    return context;
  }
}
