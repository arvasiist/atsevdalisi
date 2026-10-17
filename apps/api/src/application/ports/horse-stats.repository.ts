import type { HiddenHorseTraitKey, HorseStatField, HorseStats, HorseVisibleStats } from '@at-sevdalisi/shared-types';
import type { HorseNeedTimestamps } from '../../domain/care/needs';

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
  /**
   * 08.10.2026 — birden çok atın gizli kişilik özellikleri (tek sorgu). Ham
   * değerler YALNIZCA sunucuda etikete çevrilir; istemciye dönmez.
   */
  findPersonalityByHorseIds(horseIds: readonly string[]): Promise<Map<string, Record<HiddenHorseTraitKey, number>>>;
  /**
   * 16.10.2026 — sahibinin at listesindeki görünür statlar (brief §3). Gizli
   * kişilik sütunları OKUNMAZ; tek sorgu, N at için N okuma yok. Sınıf gücü
   * (`horseRacingPower`, 14.10.2026) de bunun hız/ivme/dayanıklılığından.
   */
  findVisibleStatsByHorseIds(horseIds: readonly string[]): Promise<Map<string, HorseVisibleStats>>;
  /** 16.10.2026 — atların bir yem kalemiyle ömür boyu beslenme sayısı (tay yetiştirme ilerlemesi). */
  findFeedCountsByHorseIds(horseIds: readonly string[], itemType: string): Promise<Map<string, number>>;
  /**
   * 17.10.2026 (brief §14) — yem/su ihtiyacının türetildiği anlar: son
   * beslenme (yalnızca `feedTypes` — karın doyuran yemler), son su bakımı ve
   * ölçüm çıpası (`horses.needs_anchor_at`). Tek sorgu.
   */
  findNeedTimestampsByHorseIds(
    horseIds: readonly string[],
    feedTypes: readonly string[],
  ): Promise<Map<string, HorseNeedTimestamps>>;
  /** 16.10.2026 — sahibin ahır seviyesi (konfor çarpanı; yoksa 1). */
  findOwnerStableLevel(ownerId: string): Promise<number>;
  /** 16.10.2026 (migration 0097) — sahibin atlarının kayıtlı bölmesi (yerleşim `resolveStableLayout`). */
  findStallRowsByOwner(ownerId: string): Promise<Array<{ id: string; stallNumber: number | null; createdAt: string }>>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_STATS_REPOSITORY = Symbol('HORSE_STATS_REPOSITORY');
