import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { LeaderboardRepository, PlayerRaceRecord } from '../../application/ports/leaderboard.repository';
import { PG_POOL } from '../database/database.module';

/**
 * JOIN sonucu satır şekli (snake_case). `performance_score` NUMERIC(6,2)
 * olduğundan `pg` bunu STRING döner — `Number(...)`'a çevrilir (bkz.
 * `postgres-race.repository.ts`'teki AYNI not). `finish_position` INTEGER,
 * `created_at` TIMESTAMPTZ'dır; `pg` bunları sırasıyla number ve Date döner.
 */
interface FinishedRaceRow {
  owner_id: string;
  username: string;
  display_name: string;
  performance_score: string;
  finish_position: number;
  created_at: Date;
}

/**
 * `race_entries` → `horses` → `players` zincirini okuyan SALT-OKUNUR
 * repository (`database/migrations/0006_create_races_and_entries.up.sql`,
 * `0002_create_tracks_and_horses.up.sql`, `0001_create_extensions_and_players.up.sql`).
 * Hiçbir şey YAZMAZ; bu yüzden transaction ve satır kilidi YOKTUR
 * (`PostgresRaceRepository` ile karıştırılmamalı — orada yazma yolu var).
 *
 * Süzgeç `finish_position IS NOT NULL`: dereceye girmemiş bir katılımın
 * performansı sıralamaya giremez. `performance_score IS NOT NULL` de
 * eklenir çünkü ikisi ayrı ayrı null olabilir ve `Number(null)` sessizce
 * 0 üretip sıralamayı bozardı.
 *
 * `ORDER BY created_at ASC`: puanlama toplama olduğu için sıra sonucu
 * DEĞİŞTİRMEZ, ama sorguyu deterministik kılar (aynı veri = aynı yanıt),
 * bu da test edilebilirliği artırır.
 */
@Injectable()
export class PostgresLeaderboardRepository implements LeaderboardRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllFinishedRaceRecords(): Promise<PlayerRaceRecord[]> {
    const result = await this.pool.query<FinishedRaceRow>(
      `SELECT
         h.owner_id          AS owner_id,
         p.username          AS username,
         p.display_name      AS display_name,
         e.performance_score AS performance_score,
         e.finish_position   AS finish_position,
         e.created_at        AS created_at
       FROM race_entries e
       JOIN horses  h ON h.id = e.horse_id
       JOIN players p ON p.id = h.owner_id
       WHERE e.finish_position IS NOT NULL
         AND e.performance_score IS NOT NULL
         -- 02.10.2026 (migration 0059): silinmiş hesap sıralamada görünmez.
         AND p.deleted_at IS NULL
       ORDER BY e.created_at ASC`,
    );

    return result.rows.map((row) => ({
      playerId: row.owner_id,
      username: row.username,
      displayName: row.display_name,
      performanceScore: Number(row.performance_score),
      finishPosition: row.finish_position,
      finishedAt: row.created_at.toISOString(),
    }));
  }
}
