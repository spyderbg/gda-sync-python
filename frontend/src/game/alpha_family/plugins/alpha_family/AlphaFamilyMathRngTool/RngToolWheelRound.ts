// Egt::Game::AlphaFamily::RngToolWheelRound (AlphaFamilyMathRngTool/RngToolWheelRound.h/.cpp): the wheel's or the
// gamble's tab of the RNG Picker: its sectors (or cards) to pick one of, and the picked one's image.

import type { RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ResultToRng } from '@game/alpha_family/libs/AlphaFamilyMathToolUtils/ResultToRng';
import type { RngToolContext, RngToolQueue } from './RngToolContext';

export interface WheelRoundView {
  /** The picked sector's image, 100 high (ImGui::Image), or none. */
  image: ImageData | null;
  imageTitle: string;
  sectors: { id: number; label: string }[];
  pickedSectorId: number;
}

function ToTitleCase(name: string) {
  if (!name) return name;

  const result = name.toLowerCase();
  return result[0].toUpperCase() + result.slice(1);
}

function WheelSectorImage(sectorId: number, context: RngToolContext, type: RoundType): { image: ImageData | null; name: string } {
  const wheelRules = context.m_mathRules!.GetWheelRoundRules(type);
  const config = wheelRules.GetConfig();
  const sectors = config.sectors.range;
  const selectedSectorConfig = sectors.find(sector => sectorId === sector.value.id);
  if (!selectedSectorConfig) return { image: null, name: '' };

  const roundTypeRssPrefix = type === RoundType.Wheel
    ? 'IMAGE_RNG_PICKER_WHEEL_SECTOR_'
    : type === RoundType.Gamble ? 'IMAGE_RNG_PICKER_GAMBLE_CARD_' : 'IMAGE_RNG_PICKER_WHEEL_';
  const sectorName = selectedSectorConfig.value.name;
  const rssKey = roundTypeRssPrefix + sectorName;
  return { image: context.m_callbacks.imageGetter?.(rssKey) ?? null, name: sectorName };
}

export class RngToolWheelRound {
  private m_type = RoundType.Undefined;
  private m_context: RngToolContext | null = null;

  private m_pickedSectorId = 0;

  Init(newType: RoundType, context: RngToolContext) {
    this.m_type = newType;
    this.m_context = context;

    const wheelRules = this.m_context.m_mathRules!.GetWheelRoundRules(this.m_type);
    const config = wheelRules.GetConfig();

    this.m_pickedSectorId = config.sectors.range[0].value.id;
  }

  Deinit() {
    this.m_type = RoundType.Undefined;
    this.m_context = null;
  }

  /** ImGuiDraw: the picked sector's image, and a radio button per sector. */
  Draw(): WheelRoundView {
    const { image, name } = WheelSectorImage(this.m_pickedSectorId, this.m_context!, this.m_type);

    const wheelRules = this.m_context!.m_mathRules!.GetWheelRoundRules(this.m_type);
    const config = wheelRules.GetConfig();
    const sectors = config.sectors.range.map(sector => ({ id: sector.value.id, label: ToTitleCase(sector.value.name) }));
    return { image, imageTitle: name, sectors, pickedSectorId: this.m_pickedSectorId };
  }

  /** ImGui::RadioButton(label, &m_pickedSectorId, id) */
  PickSector(sectorId: number) {
    this.m_pickedSectorId = sectorId;
  }

  GetRngOperationsForVisibleOutcome(): RngToolQueue {
    const rngs: RngSequence = ResultToRng.GenerateFromWheelSector(this.m_pickedSectorId, this.m_context!.m_mathRules!, this.m_type);
    return [[this.m_type, rngs]];
  }

  GetPresetName() {
    if (!this.m_context) return '';

    const wheelRules = this.m_context.m_mathRules!.GetWheelRoundRules(this.m_type);
    const sectors = wheelRules.GetConfig().sectors.range;
    const selectedSector = sectors.find(sector => this.m_pickedSectorId === sector.value.id);
    if (!selectedSector) return '';

    return ToTitleCase(selectedSector.value.name);
  }
}
