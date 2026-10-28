// Egt::Game::RuntimeCategory (Game/RuntimeCategory.h): what a runtime entry is, by the bits of its category. A class
// that is added to the runtime as itself and derives from two interfaces says its own (static RuntimeCategory).

export namespace RuntimeCategory {
  export const GameFsm = 1 << 0;
  export const GameMath = 1 << 1;
  export const GameView = 1 << 2;
  export const GameImport = 1 << 3;
  export const GameDebug = 1 << 4;
  export const GameMask = GameFsm | GameMath | GameView | GameImport | GameDebug;

  export const Integration = 1 << 10;
  export const IntegrationView = 1 << 11;
  export const IntegrationDebug = 1 << 12;
  export const IntegrationMask = Integration | IntegrationView | IntegrationDebug;

  export const Kernel = 1 << 20;
}
