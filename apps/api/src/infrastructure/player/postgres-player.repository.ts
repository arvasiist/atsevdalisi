import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Player } from '@at-sevdalisi/shared-types';
import type { PlayerProfileRecord, PlayerRepository } from '../../application/ports/player.repository';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import { PG_POOL, withTransaction } from '../database/database.module';
// `PlayerRow`/`rowToPlayer`/`writePlayerRow`/`writeLedgerEntries` bu turda
// `player-row.ts`'e TAŞINDI (davranış DEĞİŞMEDİ, yalnızca yer değişti):
// çiftlik tesisleri de (`PostgresFacilityRepository`) aynı okuma/yazma
// tanımlarına ihtiyaç duyuyor ve kopyalamak yerine paylaşmaları
// gerekiyordu — bkz. o dosyanın başlığı.
import { rowToPlayer, writeLedgerEntries, writePlayerRow, type PlayerRow } from './player-row';

@Injectable()
export class PostgresPlayerRepository implements PlayerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
    return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
  }

  async findByUsername(username: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>('SELECT * FROM players WHERE username = $1 AND deleted_at IS NULL LIMIT 1', [
      username,
    ]);
    return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
  }

  /**
   * brief §24 SOCIAL PROFILE (PHASE 14). Sözleşme portta (`PlayerRepository.
   * findProfileByUsername`) açıklanmıştır; burada yalnızca SQL'in kendisine
   * dair üç not vardır:
   *
   * 1. **`money`/`gems` SEÇİLMEZ.** Gizlilik kararı (AUDIT_REPORT.md Bulgu
   *    S4) burada uygulanır: okunmayan alan sızamaz.
   * 2. **Yarış sayıları `races.status = 'finished'` süzgecinden geçer.**
   *    Süzgeç olmadan, henüz KOŞMAMIŞ bir yarışa katılmış olmak "yarış
   *    koştu" gibi sayılırdı — ve `finish_position` o an `NULL` olduğundan
   *    zafer sayısı sessizce 0 kalırdı (yanlış veri, hata değil: en sinsi
   *    tür).
   * 3. **`friend_count` kanonik çiftin İKİ ucunu da sayar**
   *    (`player_low_id`/`player_high_id`, migration 0033): arkadaşlık yönü
   *    `requested_by_id`'de tutulur, kimin kime istek attığı "arkadaş
   *    sayısı"nı DEĞİŞTİRMEZ.
   *
   * Beş alt sorgu TEK gidiş-dönüşte koşar; `players` satırı zaten
   * `username` UNIQUE indeksiyle tek satırdır, alt sorgular da o tek
   * `p.id`'ye bağlanır.
   */
  async findProfileByUsername(username: string): Promise<PlayerProfileRecord | null> {
    const result = await this.pool.query<{
      id: string;
      username: string;
      display_name: string;
      avatar_id: string | null;
      level: number;
      xp: string;
      created_at: Date;
      race_count: string;
      win_count: string;
      podium_count: string;
      friend_count: string;
      gift_count: string;
    }>(
      `SELECT
         p.id,
         p.username,
         p.display_name,
         p.avatar_id,
         p.level,
         p.xp,
         p.created_at,
         (SELECT COUNT(*) FROM race_entries e
            JOIN races r ON r.id = e.race_id
           WHERE e.player_id = p.id AND r.status = 'finished') AS race_count,
         (SELECT COUNT(*) FROM race_entries e
            JOIN races r ON r.id = e.race_id
           WHERE e.player_id = p.id AND r.status = 'finished'
             AND e.finish_position = 1) AS win_count,
         (SELECT COUNT(*) FROM race_entries e
            JOIN races r ON r.id = e.race_id
           WHERE e.player_id = p.id AND r.status = 'finished'
             AND e.finish_position <= 3) AS podium_count,
         (SELECT COUNT(*) FROM friendships f
           WHERE f.status = 'accepted'
             AND (f.player_low_id = p.id OR f.player_high_id = p.id)) AS friend_count,
         (SELECT COUNT(*) FROM gift_sends g WHERE g.recipient_id = p.id) AS gift_count
       FROM players p
       WHERE p.username = $1 AND p.deleted_at IS NULL
       LIMIT 1`,
      [username],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarId: row.avatar_id,
      level: row.level,
      xp: Number(row.xp),
      memberSince: row.created_at.toISOString(),
      // `COUNT(*)` Postgres'te BIGINT'tir ve `pg` onu METİN olarak döndürür
      // (`BIGINT` > JS `number` güvenli aralığı olabilir). Sınırların
      // farkında olarak sayıya çevrilir — `moneyOf`/`prizePoolOf` ile AYNI
      // desen.
      raceCount: Number(row.race_count),
      winCount: Number(row.win_count),
      podiumCount: Number(row.podium_count),
      friendCount: Number(row.friend_count),
      giftCount: Number(row.gift_count),
    };
  }

  async save(player: Player): Promise<void> {
    await this.pool.query(
      `INSERT INTO players (id, username, display_name, avatar_id, level, xp, money, gems, reputation, stable_level, rating, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        player.id,
        player.username,
        player.displayName,
        player.avatarId,
        player.level,
        player.xp,
        player.money,
        player.gems,
        player.reputation,
        player.stableLevel,
        player.rating,
        new Date(player.createdAt),
        new Date(player.updatedAt),
      ],
    );
  }

  /**
   * FAZ 1 wiring, altıncı dilim — bkz. `PlayerRepository.updateWithLock`
   * doc yorumundaki tam gerekçe (docs/SECURITY.md §5). `withTransaction`
   * ile AYNI `PoolClient` üzerinde önce `SELECT ... FOR UPDATE` (satırı
   * kilitler), sonra callback (domain hesaplaması), sonra `UPDATE` —
   * hepsi TEK transaction'da.
   */
  async updateWithLock<T>(
    id: string,
    mutate: (player: Player) => { player: Player; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [id]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const current = rowToPlayer(row);
      const { player: updated, result: mutateResult, ledgerEntries } = mutate(current);
      await writePlayerRow(client, updated);
      await writeLedgerEntries(client, ledgerEntries);

      return mutateResult;
    });
  }

  /**
   * FAZ 1 wiring, on birinci dilim — bkz. `PlayerRepository.updateTwoWithLock`
   * doc yorumundaki tam gerekçe (At Pazarı satın alma). Deadlock'u önlemek
   * için satırlar id'lerin SÖZLÜKSEL sırasına göre kilitlenir (`buyerId`/
   * `sellerId` ARGÜMAN sırasından BAĞIMSIZ) — `mutate` ise ÇAĞIRANA her
   * zaman `(buyer, seller)` sırasıyla verilir.
   */
  async updateTwoWithLock<T>(
    buyerId: string,
    sellerId: string,
    mutate: (buyer: Player, seller: Player) => { buyer: Player; seller: Player; result: T },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      // `noUncheckedIndexedAccess` altında `[buyerId, sellerId].sort()`
      // sonucunu ARRAY DESTRUCTURING ile almak `string | undefined` tipi
      // verir (TypeScript sabit-2-elemanlı bir dizinin sıralandıktan
      // sonra da HÂLÂ 2 eleman olduğunu STATİK olarak bilemez) — bu
      // yüzden karşılaştırma DOĞRUDAN yapılır, dizi indeksleme HİÇ
      // kullanılmaz.
      const firstId = buyerId <= sellerId ? buyerId : sellerId;
      const secondId = buyerId <= sellerId ? sellerId : buyerId;
      const rowsById = new Map<string, PlayerRow>();

      const firstResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [
        firstId,
      ]);
      if (firstResult.rows[0]) {
        rowsById.set(firstId, firstResult.rows[0]);
      }

      // `buyerId === sellerId` durumunda (`purchaseListing`'in AYRICA
      // kontrol edip `CannotBuyOwnListingError` fırlattığı bir durum)
      // `firstId === secondId` olur — aynı satırı Postgres'te AYNI
      // transaction içinde ikinci kez `FOR UPDATE` ile okumak GÜVENLİDİR
      // (kendi kendini bloklamaz), sadece gereksizdir; bu yüzden burada
      // özel bir dal GEREKMEZ.
      if (secondId !== firstId || !rowsById.has(secondId)) {
        const secondResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [
          secondId,
        ]);
        if (secondResult.rows[0]) {
          rowsById.set(secondId, secondResult.rows[0]);
        }
      }

      const buyerRow = rowsById.get(buyerId);
      if (!buyerRow) {
        return null;
      }
      const sellerRow = rowsById.get(sellerId);
      if (!sellerRow) {
        // bkz. `PlayerRepository.updateTwoWithLock` doc yorumu — FK
        // CASCADE nedeniyle pratikte imkansız bir dal.
        throw new Error(`Veri bütünlüğü ihlali: satıcı (${sellerId}) bulunamadı.`);
      }

      const buyer = rowToPlayer(buyerRow);
      const seller = rowToPlayer(sellerRow);
      const {
        buyer: updatedBuyer,
        seller: updatedSeller,
        result: mutateResult,
      } = mutate(buyer, seller);

      await writePlayerRow(client, updatedBuyer);
      await writePlayerRow(client, updatedSeller);

      return mutateResult;
    });
  }

  // `writePlayerRow`/`writeLedgerEntries` bu turda `player-row-writes.ts`'e
  // TAŞINDI (davranış DEĞİŞMEDİ, yalnızca yer değişti): çiftlik tesisleri de
  // (`PostgresFacilityRepository`) aynı iki sorguya ihtiyaç duyuyor ve
  // kopyalamak yerine paylaşmaları gerekiyordu — bkz. o dosyanın başlığı.
}
