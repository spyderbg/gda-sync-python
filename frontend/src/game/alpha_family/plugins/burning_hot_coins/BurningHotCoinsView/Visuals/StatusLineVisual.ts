// Egt::Game::AlphaFamily::StatusLineVisual (BurningHotCoinsView/Visuals/StatusLineVisual.h/.cpp): a winning
// combination written on the status line: "LINE n" and its symbols, or the scatter, and the prize, in a row.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { Alignment, type BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { CombinationType, Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombination } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { BaseVisual } from './BaseVisual';
import type { StatusLineVisualConfig } from './StatusLineVisual.data';

interface LineElement {
  sprite: BaseElement;
  offset: Point;
  paddingLeft: number;
  paddingRight: number;
}

export class StatusLineVisual extends BaseVisual {
  private m_elements: LineElement[] = [];

  private m_destination: Point = { x: 0, y: 0 };
  private m_alignment: Alignment = Alignment.TopLeft;

  private m_arePositionsCalculated = false;

  constructor(elementsList: ElementsList, private readonly m_statusLineConfig: StatusLineVisualConfig) {
    super(elementsList);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);

    // The view's elements list draws these elements, so position them as soon as they are
    // shown, or the first frame draws them at (0, 0).
    this.CalculatePositions();
  }

  SetCombination(combination: ReelCombination) {
    const symbols = this.m_statusLineConfig.combinationSymbolImages;
    if (!symbols[combination.symbolId]) return;

    super.Clear();

    switch (combination.type) {
      case CombinationType.LeftToRight: {
        this.AddImage(this.m_statusLineConfig.combinationLineImage);
        this.AddText(String(combination.id + 1), this.m_statusLineConfig.combinationLineNumberText);
        const symbolConfig = symbols[combination.symbolId];
        for (let i = 0; i < combination.symbolCount; i++) {
          this.AddImage(symbolConfig);
        }
        break;
      }
      case CombinationType.Scatter:
        this.AddImage(this.m_statusLineConfig.combinationScatterImage);
        break;
      case CombinationType.HoldAndSpinTrigger:
        return;
      default:
        throw new Error('Unhandled combination type');
    }

    for (const [rewardType, rewardValue] of combination.rewards) {
      this.AddCurrency(rewardType, rewardValue, this.m_statusLineConfig.combinationPrizeText);
    }
  }

  SetPositionAligned(point: Point, align: Alignment) {
    this.m_destination = point;
    this.m_alignment = align;

    this.m_arePositionsCalculated = false;
    this.CalculatePositions();
  }

  OnLanguageChanged(_language: string) {
    this.m_arePositionsCalculated = false;
    this.CalculatePositions();
  }

  private AddImage(elementConfig: StatusLineVisualConfig.ElementConfig) {
    const image = this.m_elementsList.CreatePtr(ImageElement, elementConfig.resId);
    this.StoreElementId(image.GetId());
    this.m_elements.push({ sprite: image, offset: elementConfig.offset ?? { x: 0, y: 0 }, paddingLeft: elementConfig.paddingLeft ?? 0, paddingRight: elementConfig.paddingRight ?? 0 });

    this.m_arePositionsCalculated = false;
  }

  private AddText(text: string, elementConfig: StatusLineVisualConfig.ElementConfig) {
    const textElem = this.m_elementsList.CreatePtr(TextElement);
    textElem.SetStyleId(elementConfig.resId);
    textElem.SetText(text);
    this.StoreElementId(textElem.GetId());
    this.m_elements.push({ sprite: textElem, offset: elementConfig.offset ?? { x: 0, y: 0 }, paddingLeft: elementConfig.paddingLeft ?? 0, paddingRight: elementConfig.paddingRight ?? 0 });

    this.m_arePositionsCalculated = false;
  }

  private AddCurrency(currencyType: CurrencyType, currencyValue: number, elementConfig: StatusLineVisualConfig.ElementConfig) {
    const localization = this.m_elementsList.RuntimeGetConst(ILocalization);
    if (currencyType === Currency.Credits) {
      this.AddText(localization.FormatCurrency(currencyValue), elementConfig);
    } else {
      // C++ writes CoinsSpinEnergy with ILocalization::FormatCoins, which the browser's has not
      this.AddText(localization.FormatNumber(currencyValue), elementConfig);
    }

    this.m_arePositionsCalculated = false;
  }

  private CalculatePositions() {
    if (this.m_arePositionsCalculated) return;
    if (!this.IsVisible()) return;
    if (!this.HasStoredElementId()) return;

    // C++ draws to a dummy list first to force TextElement::RefreshLayout(); the browser's elements know their size, once
    // their image or font has loaded: until then, the positions are calculated again each time the line shows
    this.m_arePositionsCalculated = this.m_elements.every(it => it.sprite.GetBounds().w > 0);

    this.UpdatePositions();
  }

  private UpdatePositions() {
    const winLineSize = { w: 0, h: 0 };
    for (const it of this.m_elements) {
      winLineSize.w += it.paddingLeft + it.sprite.GetBounds().w + it.paddingRight;
      winLineSize.h = Math.max(winLineSize.h, it.sprite.GetBounds().h);
    }

    let baselineX = this.m_destination.x;
    const baselineY = this.m_destination.y;
    let align = this.m_alignment;

    // treat None as the default behavior of TopLeft
    align = align === Alignment.None ? Alignment.TopLeft : align;

    // horizontal alignment
    switch (align) {
      case Alignment.BottomCenter:
      case Alignment.MiddleCenter:
      case Alignment.TopCenter:
        baselineX = baselineX - winLineSize.w / 2;
        break;

      case Alignment.BottomRight:
      case Alignment.MiddleRight:
      case Alignment.TopRight:
        baselineX = baselineX - winLineSize.w;
        break;
      default:
        break;
    }

    for (const it of this.m_elements) {
      // advance horizontally
      baselineX += it.paddingLeft;
      it.sprite.SetPosition({ x: baselineX + it.offset.x, y: baselineY + it.offset.y });
      // advance after the element
      const bounds = it.sprite.GetBounds();
      baselineX += bounds.w + it.paddingRight;
    }
  }
}

EgtALogCategoryClass(StatusLineVisual, 'StatusLineVisual');
