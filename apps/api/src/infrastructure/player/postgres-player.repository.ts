import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Player } from '@at-sevdalisi/shared-types';
import type { PlayerRepository } from '../../application/ports/player.repository';
import { PG_POOL } from '../database/database.module';

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
      `INSERT INTO players (id, username, display_name, avatar_id, level, xp, money, gems, reputation, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
        new Date(player.createdAt),
        new Date(player.updatedAt),
      ],
    );
  }
}
