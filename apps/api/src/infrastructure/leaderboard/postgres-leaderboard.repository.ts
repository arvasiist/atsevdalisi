import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  LeaderboardRepository,
  PlayerRaceRecord,
  RaceWinnerRecord,
} from '../../application/ports/leaderboard.repository';
import type { RaceWinnersQuery } from '../../domain/ranking/race-winners';
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
         p.id                AS owner_id,
         p.username          AS username,
         p.display_name      AS display_name,
         e.performance_score AS performance_score,
         e.finish_position   AS finish_position,
         e.created_at        AS created_at
       FROM race_entries e
       JOIN horses  h ON h.id = e.horse_id
       -- 03.10.2026 (Faz 14): koşturan oyuncu; eski satır at sahibine düşer.
       JOIN players p ON p.id = COALESCE(e.player_id, h.owner_id)
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

  /**
   * KAZANANLAR (16.10.2026, brief §12). Kazanan = `finish_position = 1` olan
   * GERÇEK oyuncu katılımı (`player_id` dolu, lobi katılımı: `status` dolu ve
   * iptal değil); bot kazandıysa yarış satır üretmez. `DISTINCT ON (r.id)` —
   * aynı yarış listede İKİ KEZ çıkamaz (eşit derecede en küçük katılım
   * kimliği). Tamamlanma anı: koşu başlangıcı (kontrollü yarışta canlı
   * başlangıç) + kazananın derecesi. Ödül defterden (kazananın bu yarıştaki
   * `lobby_race_prize` toplamı) — uydurma tutar yok. Silinmiş hesap görünmez.
   * ⚠️ ÖLÇEK: bitmiş bütün lobi yarışlarını tarar; büyüyünce tamamlanma anı
   * sütunu + indeks gerekir (ayrı migration).
   */
  async findRaceWinners(query: RaceWinnersQuery): Promise<RaceWinnerRecord[]> {
    const result = await this.pool.query<{
      race_id: string;
      name: string;
      completed_at: Date;
      track_id: string | null;
      table_id: string | null;
      is_tournament: boolean;
      participant_limit: number;
      player_id: string;
      username: string;
      display_name: string;
      horse_id: string | null;
      horse_name: string | null;
      final_time_ms: number | null;
      prize: string;
    }>(
      `WITH winners AS (
         SELECT DISTINCT ON (r.id)
                r.id AS race_id, r.name, r.track_id, r.table_id, r.participant_limit,
                COALESCE(r.live_starts_at, r.start_time)
                  + make_interval(secs => COALESCE(e.final_time_ms, 0) / 1000.0) AS completed_at,
                EXISTS (SELECT 1 FROM tournaments t WHERE t.race_id = r.id) AS is_tournament,
                e.player_id, p.username, p.display_name, e.horse_id, h.name AS horse_name, e.final_time_ms
           FROM races r
           JOIN race_entries e ON e.race_id = r.id AND e.finish_position = 1
           JOIN players p ON p.id = e.player_id
           LEFT JOIN horses h ON h.id = e.horse_id
          WHERE r.status = 'finished'
            AND e.player_id IS NOT NULL
            AND e.status IS NOT NULL
            AND e.status <> 'cancelled'
            AND p.deleted_at IS NULL
          ORDER BY r.id, e.id
       )
       SELECT w.*,
              COALESCE((SELECT SUM(t.amount) FROM economy_transactions t
                         WHERE t.player_id = w.player_id
                           AND t.reference_id = w.race_id::text
                           AND t.type = 'lobby_race_prize'), 0)::bigint AS prize
         FROM winners w
        WHERE ($1::timestamptz IS NULL OR w.completed_at >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR w.completed_at < $2::timestamptz)
          AND ($3::timestamptz IS NULL OR (w.completed_at, w.race_id) < ($3::timestamptz, $4::uuid))
        ORDER BY w.completed_at DESC, w.race_id DESC
        LIMIT $5`,
      [query.from, query.to, query.before?.completedAt ?? null, query.before?.raceId ?? null, query.limit],
    );
    return result.rows.map((row) => ({
      raceId: row.race_id,
      raceName: row.name,
      completedAt: row.completed_at,
      trackId: row.track_id,
      tableId: row.table_id,
      isTournament: row.is_tournament,
      fieldSize: Number(row.participant_limit),
      playerId: row.player_id,
      username: row.username,
      displayName: row.display_name,
      horseId: row.horse_id,
      horseName: row.horse_name,
      finalTimeMs: row.final_time_ms === null ? null : Number(row.final_time_ms),
      prize: Number(row.prize),
    }));
  }
}
