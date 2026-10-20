// Egt::Game::CappingSplashViewConfig (plugins/src/Egt/CappingSplashView/CappingSplashView.data.h).

export interface CappingSplashViewConfig {
  layerId: number;
  idleTimeMs: number;
}

export function CappingSplashViewConfig(config: Partial<CappingSplashViewConfig> = {}): CappingSplashViewConfig {
  return { layerId: config.layerId ?? 800, idleTimeMs: config.idleTimeMs ?? 10000 };
}
