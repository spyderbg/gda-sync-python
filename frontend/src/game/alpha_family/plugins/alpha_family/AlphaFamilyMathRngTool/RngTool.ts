// Egt::Game::AlphaFamily::RngTool (AlphaFamilyMathRngTool/RngTool.h/.cpp): the RNG Picker window's content: a tab per
// round type of the math, each a reel round's screens or a wheel's sectors; Tab Sync, which selects the tab of the
// round the game plays next; and Add, which queues the RNG numbers of what the selected tab shows in the RNG Queue.

import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { RngToolContext, RngToolQueue } from './RngToolContext';
import { type ReelRoundView, RngToolReelRound } from './RngToolReelRound';
import type { SubscreenClick } from './RngToolReelRoundSubscreen';
import { RngToolWheelRound, type WheelRoundView } from './RngToolWheelRound';

export interface RngToolView {
  tabs: { roundType: RoundType; label: string }[];
  selected: RoundType;
  reelRound: ReelRoundView | null;
  wheelRound: WheelRoundView | null;
  tabSync: boolean;
}

function IsReelRoundType(round: RoundType) {
  switch (round) {
    case RoundType.Main:
    case RoundType.Extra:
    case RoundType.Coins:
    case RoundType.Free:
    case RoundType.ExtraFree:
    case RoundType.CoinsFree:
    case RoundType.Tetra:
      return true;
    default:
      return false;
  }
}

function IsWheelRoundType(round: RoundType) {
  return round === RoundType.Wheel || round === RoundType.Gamble;
}

export class RngTool {
  private m_isInited = false;
  private m_forceSelectTab = false;
  private m_syncRoundType = true;

  private m_roundTypeSelected = RoundType.Undefined;
  private m_context: RngToolContext | null = null;

  private readonly m_reelRoundContent = new Map<RoundType, RngToolReelRound>();
  private readonly m_wheelRoundContent = new Map<RoundType, RngToolWheelRound>();

  Init(context: RngToolContext | null) {
    if (this.m_isInited) {
      return;
    }
    if (!context) {
      return;
    }
    this.m_context = context;

    for (const round of this.m_context.m_mathRules!.GetAvailableRoundTypes()) {
      if (IsReelRoundType(round)) {
        const content = new RngToolReelRound();
        content.Init(round, this.m_context);
        this.m_reelRoundContent.set(round, content);
      } else if (IsWheelRoundType(round)) {
        const content = new RngToolWheelRound();
        content.Init(round, this.m_context);
        this.m_wheelRoundContent.set(round, content);
      }
    }

    this.m_isInited = true;
  }

  Deinit() {
    this.m_isInited = false;
    this.m_forceSelectTab = false;

    this.m_roundTypeSelected = RoundType.Undefined;
    this.m_context = null;
  }

  SyncRoundType(roundType: RoundType) {
    if (!this.m_isInited || !this.m_syncRoundType || this.m_roundTypeSelected === roundType) {
      return;
    }
    if (!this.m_reelRoundContent.has(roundType) && !this.m_wheelRoundContent.has(roundType)) {
      return;
    }
    this.m_roundTypeSelected = roundType;
    this.m_forceSelectTab = true;
  }

  GetSelectedRoundType() {
    return this.m_roundTypeSelected;
  }

  /** A tab clicked (ImGui::BeginTabItem): it is selected unless a synced round's tab is being selected. */
  SelectTab(round: RoundType) {
    if (!this.m_forceSelectTab) {
      this.m_roundTypeSelected = round;
    }
  }

  SetTabSync(sync: boolean) {
    this.m_syncRoundType = sync;
  }

  /** ImGuiDraw: the tabs, the selected round's content (with a click of its screens), Tab Sync. */
  Draw(click: { subscreen: number; click: SubscreenClick } | null = null): RngToolView | null {
    if (!this.m_isInited) return null;

    // draw tabs
    const rounds = this.m_context!.m_mathRules!.GetAvailableRoundTypes();
    if (this.m_forceSelectTab) {
      // the requested tab is drawn selected
      this.m_forceSelectTab = false;
    } else if (!rounds.includes(this.m_roundTypeSelected) && rounds.length) {
      // a tab bar selects its first tab
      this.m_roundTypeSelected = rounds[0];
    }

    // round content
    const reelRound = this.m_reelRoundContent.get(this.m_roundTypeSelected)?.Draw(click) ?? null;
    const wheelRound = this.m_wheelRoundContent.get(this.m_roundTypeSelected)?.Draw() ?? null;

    return {
      tabs: rounds.map(round => ({ roundType: round, label: RoundType[round] })),
      selected: this.m_roundTypeSelected,
      reelRound,
      wheelRound,
      tabSync: this.m_syncRoundType,
    };
  }

  /** The selected wheel's sector picked (RngToolWheelRound's radio buttons). */
  PickWheelSector(sectorId: number) {
    this.m_wheelRoundContent.get(this.m_roundTypeSelected)?.PickSector(sectorId);
  }

  /** The Add button: the selected tab's RNG numbers, queued under its preset name. */
  Add() {
    let rngsQueue: RngToolQueue = [];
    let presetName = '';
    if (IsReelRoundType(this.m_roundTypeSelected)) {
      const content = this.m_reelRoundContent.get(this.m_roundTypeSelected)!;
      rngsQueue = content.GetRngOperationsForVisibleOutcome();
      presetName = content.GetNoWinLikePresetName();
    } else if (IsWheelRoundType(this.m_roundTypeSelected)) {
      const content = this.m_wheelRoundContent.get(this.m_roundTypeSelected)!;
      rngsQueue = content.GetRngOperationsForVisibleOutcome();
      presetName = content.GetPresetName();
    }
    for (const [roundType, rngSequence] of rngsQueue) {
      this.m_context!.m_kernelRngPresets!.AddRngSequence(roundType, rngSequence, presetName);
    }
  }
}
