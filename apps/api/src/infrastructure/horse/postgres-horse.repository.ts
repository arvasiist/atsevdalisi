import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { Horse } from '@at-sevdalisi/shared-types';
import type { HorseRepository } from '../../application/ports/horse.repository';
import { PG_POOL, withTransaction } from '../database/database.module';
import { isHorseInActiveRace } from './active-race-entry';
import type { BreedInitialStats } from '../../domain/horse/breeds';
import { insertNewHorse, rowToHorse, writeHorseRow, type HorseRow } from './horse-row';

/**
 * NOT — `HorseRow`/`rowToHorse`/`writeHorseRow` bu turda `horse-row.ts`'e
 * TAŞINDI (bkz. o dosyanın başlığı): besleme akışı da aynı transaction
 * içinde at satırını okuyup yazmak zorunda kaldı ve ikinci bir
 * `UPDATE horses` metni yazmak bayat-SQL riski taşıyordu.
 *
 * NOT — KAPSAM: `horse_stats` (Antrenman, dördüncü dilim), `horse_health`
 * (Bakım, beşinci dilim) ve `horse_surface_stats`/`horse_distance_stats`
 * (R3 — Track Fit, bu turda EKLENDİ) kapsama alındı — `save()` artık
 * DÖRDÜNE de DB varsayılanlarıyla (migration 0003) birer satır ekliyor
 * (bkz. `PostgresHorseStatsRepository`/`PostgresHorseHealthRepository`/
 * `PostgresHorseSurfaceStatsRepository`/`PostgresHorseDistanceStatsRepository`
 * — okuma AYRI repository'lerde, çünkü bunlar `Horse`'dan farklı domain
 * kavramlarıdır). Migration 0026, bu değişiklikten ÖNCE oluşturulmuş
 * (`save()` henüz bu iki tabloya yazmazken yaratılmış) atlar için de
 * varsayılan satırları GERİYE DÖNÜK olarak backfill eder — bkz. o
 * migration'ın doc yorumu.
 */
@Injectable()
export class PostgresHorseRepository implements HorseRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Horse | null> {
    const result = await this.pool.query<HorseRow>('SELECT * FROM horses WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ? rowToHorse(result.rows[0]) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Horse[]> {
    const result = await this.pool.query<HorseRow>(
      'SELECT * FROM horses WHERE owner_id = $1 ORDER BY created_at ASC',
      [ownerId],
    );
    return result.rows.map(rowToHorse);
  }

  async save(horse: Horse, initial?: BreedInitialStats): Promise<void> {
    // Bir at, `horse_stats`/`horse_health`/`horse_surface_stats`/
    // `horse_distance_stats` satırları olmadan var olamamalıdır — BEŞ INSERT
    // tek transaction'da (`insertNewHorse`, ırk mağazasıyla ORTAK). Irk
    // statları (07.10.2026) verilmezse DB varsayılanları (migration 0003)
    // TEK doğruluk kaynağı olarak kalır.
    await withTransaction(this.pool, async (client) => {
      await insertNewHorse(client, horse, initial);
    });
  }

  /**
   * FAZ 1 wiring, dördüncü dilim — `TrainHorseUseCase` sonrası fatigue/
   * status günceller. Bilinçli olarak `Horse`'un TÜM değişken alanlarını
   * yazar (tek genel amaçlı metod — ileride Care/Race gibi başka
   * dilimler de kullanacaktır), yalnızca antrenmanın dokunduğu alanları
   * değil.
   *
   * FAZ 1 wiring, on birinci dilim — `owner_id` de bu genel metoda
   * eklendi (`BuyMarketListingUseCase`'in İLK kullanıcısı; bkz. o
   * use-case'in doc yorumu). Önceki çağıranların (Antrenman/Bakım/Pratik
   * Yarış) HİÇBİRİ `horse.ownerId`'yi hiç DEĞİŞTİRMEDİĞİ için (her zaman
   * okudukları AYNI değeri geri yazarlar) bu, onlar için davranışı
   * DEĞİŞTİRMEZ — yalnızca YENİ bir alanı ZATEN var olan genel
   * "değişken alanları yaz" sözleşmesine ekler.
   */
  async update(horse: Horse): Promise<void> {
    await this.writeHorseRow(this.pool, horse);
  }

  /** AUDIT_REPORT.md Bulgu C2 hardening (bu oturum) — bkz. `HorseRepository.updateWithLock` doc yorumu. */
  async isInActiveRace(horseId: string): Promise<boolean> {
    return isHorseInActiveRace(this.pool, horseId);
  }

  async updateWithLock<T>(id: string, mutate: (horse: Horse) => { horse: Horse; result: T }): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<HorseRow>('SELECT * FROM horses WHERE id = $1 FOR UPDATE', [id]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const current = rowToHorse(row);
      const { horse: updated, result: mutateResult } = mutate(current);
      await this.writeHorseRow(client, updated);
      return mutateResult;
    });
  }

  /** `update()`/`updateWithLock()`'un PAYLAŞTIĞI yazma sorgusu — `horse-row.ts`'te (DRY). */
  private async writeHorseRow(executor: Pool | PoolClient, horse: Horse): Promise<void> {
    await writeHorseRow(executor, horse);
  }
}
