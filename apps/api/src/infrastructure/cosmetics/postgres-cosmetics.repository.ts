import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CosmeticItemConfig } from '@at-sevdalisi/game-config';
import type { CosmeticPurchaseOutcome, CosmeticsRepository } from '../../application/ports/cosmetics.repository';
import { CosmeticAlreadyOwnedError } from '../../domain/cosmetics/errors';
import { debit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

/** 09.10.2026 — kozmetik sahipliği (`player_cosmetics`, migration 0082). */
@Injectable()
export class PostgresCosmeticsRepository implements CosmeticsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listOwnedKeys(playerId: string): Promise<Set<string>> {
    const result = await this.pool.query<{ item_key: string }>(
      'SELECT item_key FROM player_cosmetics WHERE player_id = $1',
      [playerId],
    );
    return new Set(result.rows.map((row) => row.item_key));
  }

  async findGems(playerId: string): Promise<number | null> {
    const result = await this.pool.query<{ gems: string }>(
      'SELECT gems FROM players WHERE id = $1 AND deleted_at IS NULL',
      [playerId],
    );
    const row = result.rows[0];
    return row ? Number(row.gems) : null;
  }

  /**
   * PARA YOLU (elmas). Oyuncu satırı `FOR UPDATE` eşzamanlı iki alımı sıraya
   * sokar; sahiplik ve bakiye KİLİT ALTINDA denetlenir (ikinci alım 409, para
   * düşmez). Bakiye + sahiplik + `cosmetic_purchase` defter satırı tek
   * transaction; birincil anahtar son savunma hattıdır.
   */
  async purchase(input: {
    playerId: string;
    item: CosmeticItemConfig;
    now: Date;
    idempotencyKey: string | null;
  }): Promise<CosmeticPurchaseOutcome> {
    return withTransaction(this.pool, async (client) => {
      const buyer = await client.query<{ money: string; gems: string }>(
        'SELECT money, gems FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = buyer.rows[0];
      if (!row) {
        throw new PlayerNotFoundError(input.playerId);
      }
      const owned = await client.query('SELECT 1 FROM player_cosmetics WHERE player_id = $1 AND item_key = $2', [
        input.playerId,
        input.item.key,
      ]);
      if (owned.rows.length > 0) {
        throw new CosmeticAlreadyOwnedError(input.item.key);
      }
      const before = { money: Number(row.money), gems: Number(row.gems) };
      const after = debit(before, input.item.priceGems, 'gems');

      await client.query(
        'INSERT INTO player_cosmetics (player_id, item_key, price_gems, acquired_at) VALUES ($1, $2, $3, $4)',
        [input.playerId, input.item.key, input.item.priceGems, input.now],
      );
      await client.query('UPDATE players SET gems = $2, updated_at = now() WHERE id = $1', [input.playerId, after.gems]);
      await writeLedgerEntries(client, [
        {
          playerId: input.playerId,
          type: 'cosmetic_purchase',
          amount: -input.item.priceGems,
          currency: 'gems',
          referenceType: 'cosmetic',
          referenceId: input.item.key,
          balanceBefore: before.gems,
          balanceAfter: after.gems,
          idempotencyKey: input.idempotencyKey,
        },
      ]);
      return { gems: after.gems };
    });
  }
}
