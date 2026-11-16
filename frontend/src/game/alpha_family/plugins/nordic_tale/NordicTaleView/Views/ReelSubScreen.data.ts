// Egt::Game::AlphaFamily::ReelSubScreen (NordicTaleView/Views/ReelSubScreen.data.h): the geometry of one
// reel sub screen area. The main reels are a single one, the tetra round has one per sub screen. Everything drawn over
// an area places itself off its 'reelArea' and 'reelStep'.

export interface ReelSubScreen {
  symbolWidth: number;
  symbolHeight: number;
  symbolColumnWidth: number;
  reelAreaX: number;
  reelAreaY: number;
  reelStepX: number;
  reelStepY: number;
}

// Grid placement for one ReelVisual; set explicitly by the view before construction.
export class ReelVisualConfig {
  reelStartCol = -1;
  reelStartRow = -1;
  reelHeightInCells = -1;
}

export interface ReelSubScreensConfig {
  visibleCols: number;
  visibleRows: number;
  subScreens: ReelSubScreen[];
}
