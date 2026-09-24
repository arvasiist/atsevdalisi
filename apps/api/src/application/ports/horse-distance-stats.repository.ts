import type { HorseDistanceStats } from '@at-sevdalisi/shared-types';

/**
 * `HorseDistanceStatsRepository` — `HorseSurfaceStatsRepository` ile AYNI
 * desen/gerekçe (bkz. o portun doc yorumu), `horse_distance_stats` tablosu
 * (migration 0003/0026) için. R3 — Track Fit (bu turda EKLENDİ).
 */
export interface HorseDistanceStatsRepository {
  findByHorseId(horseId: string): Promise<HorseDistanceStats | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_DISTANCE_STATS_REPOSITORY = Symbol('HORSE_DISTANCE_STATS_REPOSITORY');
