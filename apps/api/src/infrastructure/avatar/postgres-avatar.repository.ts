import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AvatarAppearance } from '@at-sevdalisi/shared-types';
import type { AvatarRepository, StoredAvatar } from '../../application/ports/avatar.repository';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class PostgresAvatarRepository implements AvatarRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(playerId: string): Promise<StoredAvatar | null> {
    const result = await this.pool.query<{ appearance: Record<string, unknown>; updated_at: Date }>(
      'SELECT appearance, updated_at FROM player_avatars WHERE player_id = $1',
      [playerId],
    );
    const row = result.rows[0];
    return row ? { appearance: row.appearance, updatedAt: row.updated_at } : null;
  }

  async save(playerId: string, appearance: AvatarAppearance, now: Date): Promise<StoredAvatar> {
    const result = await this.pool.query<{ appearance: Record<string, unknown>; updated_at: Date }>(
      `INSERT INTO player_avatars (player_id, appearance, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (player_id) DO UPDATE SET appearance = EXCLUDED.appearance, updated_at = EXCLUDED.updated_at
       RETURNING appearance, updated_at`,
      [playerId, JSON.stringify(appearance), now],
    );
    const row = result.rows[0]!;
    return { appearance: row.appearance, updatedAt: row.updated_at };
  }
}
