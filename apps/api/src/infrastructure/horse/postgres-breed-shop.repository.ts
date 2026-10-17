import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { BreedHorsePurchaseInput, BreedShopRepository } from '../../application/ports/breed-shop.repository';
import { debit } from '../../domain/economy/wallet';
import { assertCanBuyBreed } from '../../domain/horse/breeds';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';
import { insertNewHorse } from './horse-row';
import { countStableOccupancy } from '../stable/stable-occupancy';

interface BuyerRow {
  money: string;
  gems: string;
  level: number;
  stable_level: number;
}

@Injectable()
export class PostgresBreedShopRepository implements BreedShopRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async purchase(input: BreedHorsePurchaseInput): Promise<{ money: number }> {
    return withTransaction(this.pool, async (client) => {
      // Oyuncu satırı kilidi aynı oyuncunun eşzamanlı alımlarını (ve pazar
      // alımını — o da önce alıcıyı kilitler) SERİLEŞTİRİR; aşağıdaki ahır
      // sayımı bu yüzden tutarlıdır.
      const buyer = await client.query<BuyerRow>(
        'SELECT money, gems, level, stable_level FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = buyer.rows[0];
      if (!row) {
        throw new PlayerNotFoundError(input.playerId);
      }
      assertCanBuyBreed(input.breed, row.level);

      // 16.10.2026 — doğumu beklenen gebelikler de yer tutar.
      assertCanAddHorseToStable(
        await countStableOccupancy(client, input.playerId),
        getStableCapacity(row.stable_level, this.config.stable),
      );

      const before = { money: Number(row.money), gems: Number(row.gems) };
      const after = debit(before, input.breed.priceMoney, 'money');

      await insertNewHorse(client, input.horse, input.initial);
      await client.query('UPDATE players SET money = $2, updated_at = now() WHERE id = $1', [input.playerId, after.money]);
      await writeLedgerEntries(client, [
        {
          playerId: input.playerId,
          type: 'breed_horse_purchase',
          amount: -input.breed.priceMoney,
          currency: 'money',
          referenceType: 'horses',
          referenceId: input.horse.id,
          balanceBefore: before.money,
          balanceAfter: after.money,
          idempotencyKey: input.idempotencyKey,
        },
      ]);
      return { money: after.money };
    });
  }
}
