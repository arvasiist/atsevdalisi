import type { HorseStatField, HorseStats } from '@at-sevdalisi/shared-types';

/**
 * `HorseStatsRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), `application/ports/horse.repository.ts`
 * ile AYNI desen (docs/ARCHITECTURE.md §4). `HorseStats` (`horse_stats`
 * tablosu) `Horse` (`horses` tablosu) ile AYNI aggregate'in bir parçası
 * olarak yaratılır (bkz. `PostgresHorseRepository.save()`) ama okuma/
 * güncelleme AYRI bir repository üzerinden yapılır, çünkü ayrı bir domain
 * kavramıdır (brief §7 `HorseStats` vs `Horse`).
 */
export interface HorseStatsRepository {
  findByHorseId(horseId: string): Promise<HorseStats | null>;
  /**
   * Tek bir stat alanını günceller (antrenman sonrası kazanç). Tüm satırı
   * yeniden yazmak yerine tek sütun güncellemesi tercih edildi — çağıran
   * taraf (`TrainHorseUseCase`) zaten güncel `HorseStats`'ı okumuş olur.
   */
  updateStatValue(horseId: string, statKey: HorseStatField, newValue: number): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_STATS_REPOSITORY = Symbol('HORSE_STATS_REPOSITORY');
