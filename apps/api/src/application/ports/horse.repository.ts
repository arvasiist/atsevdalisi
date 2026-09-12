import type { Horse } from '@at-sevdalisi/shared-types';

/**
 * `HorseRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. `application/ports/player.repository.ts` ile
 * AYNI desen (docs/ARCHITECTURE.md §4).
 */
export interface HorseRepository {
  findById(id: string): Promise<Horse | null>;
  findByOwnerId(ownerId: string): Promise<Horse[]>;
  /** Yeni bir at kaydı ekler (ve ona eşlik eden `horse_stats` satırını, bkz. postgres implementasyonu). */
  save(horse: Horse): Promise<void>;
  /**
   * FAZ 1 wiring, dördüncü dilim — var olan bir atın DEĞİŞKEN alanlarını
   * (health/fitness/fatigue/energy/morale/weightKg/status/level/xp) günceller.
   * İlk kullanım: `TrainHorseUseCase` (antrenman sonrası fatigue/status).
   */
  update(horse: Horse): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_REPOSITORY = Symbol('HORSE_REPOSITORY');
