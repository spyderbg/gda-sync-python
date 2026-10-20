// Egt::Game::AlphaFamily::InfoViewConfig (BurningCrownTetraSpins10InfoView/InfoView.data.h): the IData InfoViewConfig
// (idata/1920x1080/DefaultInfoView.json): where the current and the next page are, how long a page change takes, which
// RTF page each kind of page is and their order.

import type { Point } from '../../../../engine/Game/RuntimeExport/IResources';
import type { EInfoViewPageType } from '../../../libs/AlphaFamily/Views/IInfoView.data';

export interface InfoViewConfig {
  currentPageDefault: Point;
  nextPageDefault: Point;
  nextPageMoved: Point;

  changePageDuration: number;
  /** After this many ms on a non-Main page without a new page, return to Main. 0 disables. */
  idleReturnToMainMs: number;

  // EInfoViewPageType name -> RTF page id
  infoPageToRtfPage: Partial<Record<EInfoViewPageType, string>>;
  // EInfoViewPageType name ordered for next-page cycling.
  orderedInfoPages: EInfoViewPageType[];

  showWinCombination: boolean;
}
