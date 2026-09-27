import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Facility, FacilityType, Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import type { FacilityRepository } from '../../application/ports/facility.repository';
import { PG_POOL, withTransaction } from '../database/database.module';
import { rowToPlayer, writeLedgerEntries, writePlayerRow, type PlayerRow } from '../player/player-row';

/**
 * `facilities` tablosunun satır şekli (snake_case,
 * `database/migrations/0013_create_facilities.up.sql`).
 *
 * `level` INTEGER'dır → `node-postgres` bunu doğrudan JS `number` döner
 * (`PlayerRow`'daki BIGINT/NUMERIC alanlarının `Number(...)` çevirisinin
 * AKSİNE, bkz. `player-row.ts`). `type` TEXT + CHECK kısıtıdır; kısıt
 * `FacilityType` union'ıyla aynı yedi değeri listeler (migration 0013).
 */
interface FacilityRow {
  id: string;
  owner_id: string;
  type: string;
  level: number;
  created_at: Date;
  updated_at: Date;
}

function rowToFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    ownerId: row.owner_id,
    // CHECK kısıtı yalnızca geçerli yedi değeri kabul eder; `FacilityType`
    // union'ı ile migration arasındaki bağ BURADADIR. Yanlış bir değer
    // yazılmışsa (kısıt kaldırılmışsa vb.) bunu sessizce yutmamak için
    // ayrıca daraltma YAPILMAZ — tip iddiası bilinçli ve tek noktadadır.
    type: row.type as FacilityType,
    level: row.level,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Çiftlik tesisleri (brief §32) — `facilities` tablosu. Bu turda EKLENDİ.
 *
 * Tablo `database/migrations/0013_create_facilities.up.sql`'den beri VARDI
 * ama onu okuyan/yazan TEK SATIR KOD YOKTU (ölü şema); `domain/farm/farm.ts`
 * de aynı şekilde yalnızca birim testinden çağrılıyordu. Bu repository,
 * `GetFarmSummaryUseCase`/`UpgradeFacilityUseCase` ile birlikte o zinciri
 * kapatır.
 *
 * `players` satırını okuyup yazmak için `player-row.ts`'teki PAYLAŞILAN
 * tanımlar kullanılır — burada ikinci bir `UPDATE players` metni YOKTUR
 * (bkz. o dosyanın başlığındaki gerekçe).
 */
@Injectable()
export class PostgresFacilityRepository implements FacilityRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByOwnerId(ownerId: string): Promise<Facility[]> {
    // Salt okunur; transaction/kilit GEREKMEZ (bkz. `upgradeWithLock`'un
    // aksine burada değişen bir şey yok). `ORDER BY` BİLEREK yoktur:
    // ekranın sırası `FACILITY_TYPES`'tan gelir, DB sırasına güvenilmez.
    const result = await this.pool.query<FacilityRow>('SELECT * FROM facilities WHERE owner_id = $1', [ownerId]);
    return result.rows.map(rowToFacility);
  }

  /**
   * Kilit sırası ve sözleşme için bkz. `FacilityRepository.upgradeWithLock`
   * doc yorumu. Özet: (1) `players` satırını kilitle, (2) tesisi oku,
   * (3) `mutate` (saf domain hesabı), (4) oyuncuyu yaz, (5) tesisi yaz,
   * (6) defter kaydını yaz — HEPSİ tek transaction'da.
   */
  async upgradeWithLock<T>(
    ownerId: string,
    type: FacilityType,
    mutate: (
      player: Player,
      facility: Facility | null,
    ) => { player: Player; facility: Facility; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      // (1) ÖNCE oyuncu satırı kilitlenir. Bu, aynı oyuncunun TÜM para
      // işlemlerini (ahır yükseltme, günlük ödül, pazar, tesis) TEK bir
      // sıraya dizer — dolayısıyla (2)'deki okuma her zaman commit edilmiş
      // güncel durumu görür ve iki eşzamanlı istek aynı tesisi iki kez
      // inşa edemez / bakiyeyi iki kez harcayamaz.
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [ownerId]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        // `updateWithLock` ile AYNI sözleşme: `mutate` hiç çağrılmaz.
        return null;
      }

      // (2) Tesis satırı `FOR UPDATE` OLMADAN okunur: (1)'deki kilit aynı
      // oyuncunun tüm yazmalarını zaten serileştirdiği için burada ikinci
      // bir kilit gereksizdir (ve satır hiç yoksa `FOR UPDATE` zaten
      // hiçbir şey kilitlemez — yanıltıcı bir güvence olurdu).
      const facilityResult = await client.query<FacilityRow>(
        'SELECT * FROM facilities WHERE owner_id = $1 AND type = $2',
        [ownerId, type],
      );
      const existingRow = facilityResult.rows[0];
      const existing = existingRow ? rowToFacility(existingRow) : null;

      // (3) Saf domain hesabı — kilitli/güncel değerlerle, callback İÇİNDE.
      const { player: updatedPlayer, facility: updatedFacility, result, ledgerEntries } = mutate(rowToPlayer(playerRow), existing);

      // (4) Para (ve varsa diğer alanlar) — paylaşılan sorgu.
      await writePlayerRow(client, updatedPlayer);

      // (5) Tesis satırı. İLK inşa ile yükseltme AYNI sorgudan geçer:
      // `ON CONFLICT (owner_id, type)`. Böylece iki dalın SQL'i ayrışmaz;
      // `UNIQUE (owner_id, type)` kısıtı ikinci bir güvencedir.
      await client.query(
        `INSERT INTO facilities (id, owner_id, type, level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (owner_id, type)
         DO UPDATE SET level = EXCLUDED.level, updated_at = EXCLUDED.updated_at`,
        [
          updatedFacility.id,
          updatedFacility.ownerId,
          updatedFacility.type,
          updatedFacility.level,
          new Date(updatedFacility.createdAt),
          new Date(updatedFacility.updatedAt),
        ],
      );

      // (6) Defter kaydı — oyuncu satırının yazılmasıyla AYNI transaction'da
      // (CLAUDE.md "PARA/MUTASYON YOLU"). Boş/undefined ise hiç yazılmaz.
      await writeLedgerEntries(client, ledgerEntries);

      return result;
    });
  }
}
