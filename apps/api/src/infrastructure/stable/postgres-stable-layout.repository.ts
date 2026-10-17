import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { StableConfig } from '@at-sevdalisi/game-config';
import type { StallView } from '@at-sevdalisi/shared-types';
import type { StableLayoutRepository } from '../../application/ports/stable-layout.repository';
import { moveHorseInLayout, resolveStableLayout } from '../../domain/stable/layout';
import { getStableCapacity } from '../../domain/stable/stable';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';

interface StallRow {
  id: string;
  name: string;
  stall_number: number | null;
  created_at: Date;
}

function toStallViews(rows: readonly StallRow[], capacity: number): StallView[] {
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return resolveStableLayout(
    rows.map((row) => ({ id: row.id, stallNumber: row.stall_number, createdAt: row.created_at.toISOString() })),
    capacity,
  ).map((entry) => ({ stallNumber: entry.stallNumber, horseId: entry.horseId, horseName: names.get(entry.horseId) ?? '' }));
}

@Injectable()
export class PostgresStableLayoutRepository implements StableLayoutRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findStalls(ownerId: string, stable: StableConfig): Promise<{ capacity: number; stalls: StallView[] }> {
    const player = await this.pool.query<{ stable_level: number }>('SELECT stable_level FROM players WHERE id = $1', [ownerId]);
    if (player.rows.length === 0) throw new PlayerNotFoundError(ownerId);
    const capacity = getStableCapacity(player.rows[0]!.stable_level, stable);
    const rows = await this.pool.query<StallRow>(
      'SELECT id, name, stall_number, created_at FROM horses WHERE owner_id = $1',
      [ownerId],
    );
    return { capacity, stalls: toStallViews(rows.rows, capacity) };
  }

  async moveHorse(
    ownerId: string,
    horseId: string,
    stallNumber: unknown,
    stable: StableConfig,
  ): Promise<{ capacity: number; stalls: StallView[] }> {
    return withTransaction(this.pool, async (client) => {
      // Oyuncu satırı kilidi aynı oyuncunun eşzamanlı taşımalarını sıraya sokar.
      const player = await client.query<{ stable_level: number }>(
        'SELECT stable_level FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [ownerId],
      );
      if (player.rows.length === 0) throw new PlayerNotFoundError(ownerId);
      const capacity = getStableCapacity(player.rows[0]!.stable_level, stable);
      const rows = await client.query<StallRow>(
        'SELECT id, name, stall_number, created_at FROM horses WHERE owner_id = $1 ORDER BY id FOR UPDATE',
        [ownerId],
      );
      const current = resolveStableLayout(
        rows.rows.map((row) => ({ id: row.id, stallNumber: row.stall_number, createdAt: row.created_at.toISOString() })),
        capacity,
      );
      const next = moveHorseInLayout(current, horseId, stallNumber, capacity);
      await this.writeLayout(client, ownerId, next);
      const byId = new Map(next.map((entry) => [entry.horseId, entry.stallNumber]));
      return {
        capacity,
        stalls: toStallViews(
          rows.rows.map((row) => ({ ...row, stall_number: byId.get(row.id) ?? row.stall_number })),
          capacity,
        ),
      };
    });
  }

  /**
   * Yerleşimin TAMAMI yazılır: önce sahibin bütün atları boşaltılır, sonra
   * yeni numaralar tek ifadede verilir — tekil indeks yer değiştirmede ara
   * adımda çakışmasın diye.
   */
  private async writeLayout(
    client: PoolClient,
    ownerId: string,
    layout: ReadonlyArray<{ horseId: string; stallNumber: number }>,
  ): Promise<void> {
    await client.query('UPDATE horses SET stall_number = NULL WHERE owner_id = $1 AND stall_number IS NOT NULL', [ownerId]);
    await client.query(
      `UPDATE horses h SET stall_number = v.stall_number
         FROM unnest($2::uuid[], $3::smallint[]) AS v(id, stall_number)
        WHERE h.id = v.id AND h.owner_id = $1`,
      [ownerId, layout.map((entry) => entry.horseId), layout.map((entry) => entry.stallNumber)],
    );
  }
}
