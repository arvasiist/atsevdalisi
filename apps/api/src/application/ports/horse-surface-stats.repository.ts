import type { HorseSurfaceStats } from '@at-sevdalisi/shared-types';

/**
 * `HorseSurfaceStatsRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), `application/ports/horse-stats.repository.ts`
 * ile AYNI desen (docs/ARCHITECTURE.md §4). `HorseSurfaceStats`
 * (`horse_surface_stats` tablosu) `Horse`/`HorseStats` ile AYNI aggregate'in
 * bir parçası olarak yaratılır (bkz. `PostgresHorseRepository.save()`,
 * migration 0026) ama okuma AYRI bir repository üzerinden yapılır, çünkü
 * ayrı bir domain kavramıdır (brief §7 `HorseSurfaceStats` vs `Horse`).
 *
 * R3 — Track Fit (bu turda EKLENDİ). Bilinçli olarak `updateXxx` metodu
 * YOK: bu değerleri antrenman/keşif yoluyla DEĞİŞTİREN bir mekanizma
 * (brief §34 scout/keşif) bu dilimin KAPSAMI DIŞINDA — bkz.
 * `entrant-snapshot.ts`'in `NEUTRAL_UNMODELED_TRAIT_SCORE` doc yorumu.
 */
export interface HorseSurfaceStatsRepository {
  findByHorseId(horseId: string): Promise<HorseSurfaceStats | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_SURFACE_STATS_REPOSITORY = Symbol('HORSE_SURFACE_STATS_REPOSITORY');
