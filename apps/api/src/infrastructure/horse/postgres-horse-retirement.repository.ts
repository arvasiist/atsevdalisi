import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Horse } from '@at-sevdalisi/shared-types';
import type { HorseRetirementRepository } from '../../application/ports/horse-retirement.repository';
import { HorseNotOwnedError } from '../../domain/race/errors';
import { HorseInActiveRaceError, HorseListedInMarketError, HorseNotFoundError } from '../../domain/horse/errors';
import { assertCanRetire } from '../../domain/horse/retirement';
import { PG_POOL, withTransaction } from '../database/database.module';
import { isHorseInActiveRace } from './active-race-entry';
import { rowToHorse, type HorseRow } from './horse-row';

/**
 * Kilit sırası: önce AT, sonra OYUNCU — çiftleştirmeyle (`PostgresBreedingRepository`)
 * aynı sıra; ters sıra eşzamanlı emeklilik + çiftleştirmede kilitlenme döngüsü
 * yaratırdı. Oyuncu kilidi aynı sahibin iki atını AYNI ANDA emekli eden iki
 * isteği serileştirir: "son at" sayımı ikisinde de doğru kalır.
 */
@Injectable()
export class PostgresHorseRetirementRepository implements HorseRetirementRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async retire(input: { playerId: string; horseId: string; now: Date }): Promise<Horse> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<HorseRow>('SELECT * FROM horses WHERE id = $1 FOR UPDATE', [input.horseId]);
      const row = locked.rows[0];
      if (!row) {
        throw new HorseNotFoundError(input.horseId);
      }
      if (row.owner_id !== input.playerId) {
        throw new HorseNotOwnedError(input.horseId);
      }
      await client.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [input.playerId]);

      const others = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM horses
         WHERE owner_id = $1 AND id <> $2 AND status <> 'retired'`,
        [input.playerId, input.horseId],
      );
      assertCanRetire({
        horseId: input.horseId,
        status: rowToHorse(row).status,
        otherNonRetiredHorseCount: Number(others.rows[0]?.count ?? 0),
      });

      // İlandaki at emekli edilemez: alıcı yarış atı sanıp emekli at alırdı.
      const listed = await client.query(
        "SELECT 1 FROM market_listings WHERE horse_id = $1 AND status = 'active' LIMIT 1",
        [input.horseId],
      );
      if (listed.rows.length > 0) {
        throw new HorseListedInMarketError(input.horseId);
      }
      // Açık yarışa / süren kontrollü yarışa kayıtlı at emekli edilemez (ücret ödendi).
      if (await isHorseInActiveRace(client, input.horseId)) {
        throw new HorseInActiveRaceError(input.horseId);
      }

      const updated = await client.query<HorseRow>(
        `UPDATE horses SET status = 'retired', retired_at = $2, updated_at = $2
         WHERE id = $1
         RETURNING *`,
        [input.horseId, input.now],
      );
      return rowToHorse(updated.rows[0]!);
    });
  }
}
