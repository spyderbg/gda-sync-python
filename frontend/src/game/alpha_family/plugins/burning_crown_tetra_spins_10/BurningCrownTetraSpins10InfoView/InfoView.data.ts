// Egt::Game::AlphaFamily::InfoViewConfig (BurningCrownTetraSpins10InfoView/InfoView.data.h): the IData InfoViewConfig
// (idata/1920x1080/DefaultInfoView.json): where the current and the next page are, how long a page change takes, which
// RTF page each kind of page is and their order.

import type { Point } from '../../../../engine/Game/RuntimeExport/IResources';
import { EInfoViewPageType } from '../../../libs/AlphaFamily/Views/IInfoView.data';

export interface InfoViewConfig {
  currentPageDefault: Point;
  nextPageDefault: Point;
  nextPageMoved: Point;
  changePageDuration: number;
  /** After this many ms on a non-Main page without a new page, return to Main. 0 disables. */
  idleReturnToMainMs: number;
  /** EInfoViewPageType name -> RTF page id */
  infoPageToRtfPage: Map<EInfoViewPageType, string>;
  /** EInfoViewPageType name ordered for next-page cycling. */
  orderedInfoPages: EInfoViewPageType[];
  showWinCombination: boolean;
}

/** The config from its JSON, where the page types are their names. */
export function InfoViewConfig(json: Record<string, unknown> = {}): InfoViewConfig {
  const point = (value: unknown) => ({ x: Number((value as Point | undefined)?.x ?? 0), y: Number((value as Point | undefined)?.y ?? 0) });
  const pageType = (name: string) => EInfoViewPageType[name as keyof typeof EInfoViewPageType] ?? EInfoViewPageType.Undefined;
  return {
    currentPageDefault: point(json.currentPageDefault),
    nextPageDefault: point(json.nextPageDefault),
    nextPageMoved: point(json.nextPageMoved),
    changePageDuration: Number(json.changePageDuration ?? 0),
    idleReturnToMainMs: Number(json.idleReturnToMainMs ?? 30000),
    infoPageToRtfPage: new Map(Object.entries((json.infoPageToRtfPage ?? {}) as Record<string, string>).map(([name, page]) => [pageType(name), page])),
    orderedInfoPages: ((json.orderedInfoPages ?? []) as string[]).map(pageType),
    showWinCombination: Boolean(json.showWinCombination),
  };
}
