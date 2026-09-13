import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { Player } from '@at-sevdalisi/shared-types';
import type { PlayerRepository } from '../../application/ports/player.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `players` tablosunun satır şekli (snake_case, `database/migrations/
 * 0001_create_extensions_and_players.up.sql`). `money`/`gems`/`xp`
 * PostgreSQL'de BIGINT'tir — `node-postgres` BIGINT'i (hassasiyet kaybını
 * önlemek için, JS `number`'ın güvenli tamsayı sınırını aşabileceğinden)
 * varsayılan olarak STRING döner; bu oyunun para/xp değerleri bu sınırı
 * pratikte aşmayacağı için `Number(...)`'a çevrilir (bkz. `Player.money`
 * tipi zaten `number`, `packages/shared-types/src/player.ts`).
 */
interface PlayerRow {
  id: string;
  username: string;
  display_name: string;
  avatar_id: string | null;
  level: number;
  xp: string;
  money: string;
  gems: string;
  reputation: number;
  // FAZ 1 wiring, üçüncü dilim — `database/migrations/
  // 0012_create_staff_and_stable_level.up.sql`. INTEGER olduğundan (BIGINT/
  // NUMERIC'in aksine) `node-postgres` bunu doğrudan JS `number` döner.
  stable_level: number;
  // FAZ 1 wiring, yedinci dilim — `database/migrations/
  // 0016_add_last_daily_reward_claimed_at.up.sql`.
  last_daily_reward_claimed_at: Date | null;
  // FAZ 1 wiring, on dördüncü dilim — `database/migrations/
  // 0018_add_pvp_matchmaking.up.sql`. INTEGER olduğundan (BIGINT/NUMERIC'in
  // AKSİNE, `stable_level` ile AYNI gerekçe) doğrudan JS `number` döner.
  rating: number;
  created_at: Date;
  updated_at: Date;
}

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    level: row.level,
    xp: Number(row.xp),
    money: Number(row.money),
    gems: Number(row.gems),
    reputation: row.reputation,
    stableLevel: row.stable_level,
    lastDailyRewardClaimedAt: row.last_daily_reward_claimed_at ? row.last_daily_reward_claimed_at.toISOString() : null,
    rating: row.rating,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class PostgresPlayerRepository implements PlayerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>('SELECT * FROM players WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
  }

  async findByUsername(username: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>('SELECT * FROM players WHERE username = $1 LIMIT 1', [
      username,
    ]);
    return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
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
    mutate: (player: Player) => { player: Player; result: T },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [id]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const current = rowToPlayer(row);
      const { player: updated, result: mutateResult } = mutate(current);
      await this.writePlayerRow(client, updated);

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

      await this.writePlayerRow(client, updatedBuyer);
      await this.writePlayerRow(client, updatedSeller);

      return mutateResult;
    });
  }

  /**
   * `updateWithLock`/`updateTwoWithLock`'un PAYLAŞTIĞI yazma sorgusu (DRY).
   * FAZ 1 wiring, on dördüncü dilim — `rating` da BURADAN güncellenir
   * (`JoinMatchmakingQueueUseCase`, `updateTwoWithLock` ile İKİ oyuncunun
   * Elo reytingini TEK transaction'da yazar — `BuyMarketListingUseCase`'in
   * `money` alanı için yaptığıyla AYNI desen).
   */
  private async writePlayerRow(client: PoolClient, updated: Player): Promise<void> {
    await client.query(
      `UPDATE players
       SET display_name = $2, avatar_id = $3, level = $4, xp = $5,
           money = $6, gems = $7, reputation = $8, stable_level = $9,
           last_daily_reward_claimed_at = $10, rating = $11, updated_at = $12
       WHERE id = $1`,
      [
        updated.id,
        updated.displayName,
        updated.avatarId,
        updated.level,
        updated.xp,
        updated.money,
        updated.gems,
        updated.reputation,
        updated.stableLevel,
        updated.lastDailyRewardClaimedAt ? new Date(updated.lastDailyRewardClaimedAt) : null,
        updated.rating,
        new Date(updated.updatedAt),
      ],
    );
  }
}
