import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  PvpMatch,
  Race,
  RaceEntry,
  RaceSegmentSnapshot,
  RaceSurface,
  RecentRaceResultView,
} from '@at-sevdalisi/shared-types';
import type { RaceRepository } from '../../application/ports/race.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `findRecentResultsByOwnerId`'nin JOIN sonucu satır şekli (snake_case).
 * `performance_score` NUMERIC(6,2) olduğundan `pg` bunu string döner
 * (bkz. `postgres-horse.repository.ts`'teki AYNI not) — `Number(...)`'a
 * çevrilir. `distance_m`/`final_time_ms`/`finish_position` INTEGER'dır,
 * `pg` bunları zaten JS number olarak döner.
 */
interface RecentRaceRow {
  race_id: string;
  race_name: string;
  distance_m: number;
  surface: string;
  horse_id: string;
  horse_name: string;
  final_time_ms: number;
  finish_position: number;
  performance_score: string;
  created_at: Date;
}

function rowToRecentRaceResult(row: RecentRaceRow): RecentRaceResultView {
  return {
    raceId: row.race_id,
    raceName: row.race_name,
    horseId: row.horse_id,
    horseName: row.horse_name,
    distanceMeters: row.distance_m,
    surface: row.surface as RaceSurface,
    finishPosition: row.finish_position,
    finalTimeMs: row.final_time_ms,
    performanceScore: Number(row.performance_score),
    finishedAt: row.created_at.toISOString(),
  };
}

/**
 * `races`/`race_entries`/`race_entry_segments` tablolarına yazan
 * repository (`database/migrations/0006_create_races_and_entries.up.sql`,
 * `0014_add_race_segment_faz5_fields.up.sql`). FAZ 1 wiring, sekizinci
 * dilim — Pratik Yarış: bkz. `application/ports/race.repository.ts`
 * üstündeki not (transaction burada "ya hepsi ya hiçbiri" için, satır
 * kilitleme İÇİN DEĞİL — `PostgresPlayerRepository.updateWithLock` ile
 * KARIŞTIRILMASIN).
 *
 * FAZ 1 wiring, dokuzuncu dilim — `entry_fee`/`prize_pool` artık
 * `race.entryFee`/`race.prizePool`'dan gelen GERÇEK değerlerdir (önceden
 * her zaman sabit `0` yazılıyordu).
 *
 * FAZ 1 wiring, on dördüncü dilim — `savePvpMatch` eklendi (PvP
 * Eşleştirme, brief §41); `races`/`race_entries` ekleme sorguları artık
 * `insertRaceRow`/`insertEntryWithSegments` yardımcılarına çıkarıldı
 * (DRY) — `savePracticeRace` de bunları KULLANIR, davranışı DEĞİŞMEDİ.
 * `pvp_matches` tablosuna da yazar (`database/migrations/
 * 0018_add_pvp_matchmaking.up.sql`).
 */
@Injectable()
export class PostgresRaceRepository implements RaceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async savePracticeRace(race: Race, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.insertRaceRow(client, race);
      await this.insertEntryWithSegments(client, entry, segments);
    });
  }

  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — bkz. `RaceRepository.savePvpMatch`
   * doc yorumu. `savePracticeRace` ile PAYLAŞILAN `insertRaceRow`/
   * `insertEntryWithSegments` yardımcılarını İKİ kez (her katılımcı için
   * bir kez) çağırır, ayrıca `pvp_matches` satırını ekler.
   */
  async savePvpMatch(
    race: Race,
    entries: [RaceEntry, RaceEntry],
    segments: RaceSegmentSnapshot[],
    match: PvpMatch,
  ): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.insertRaceRow(client, race);

      const [playerAId, playerBId] = match.playerIds;
      for (const entry of entries) {
        const entrySegments = segments.filter((segment) => segment.raceEntryId === entry.id);
        await this.insertEntryWithSegments(client, entry, entrySegments);
      }

      await client.query(
        `INSERT INTO pvp_matches (id, race_id, player_a_id, player_b_id, winner_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [match.id, race.id, playerAId, playerBId, match.winnerId, match.status, new Date(match.createdAt)],
      );
    });
  }

  /**
   * Faz 2 (görsel kalite planı) — bkz. `RaceRepository.
   * findRecentResultsByOwnerId` doc yorumu. Salt okunur, hiçbir yazma
   * içermez (diğer metodların AKSİNE `withTransaction` GEREKMEZ).
   */
  async findRecentResultsByOwnerId(ownerId: string, limit: number): Promise<RecentRaceResultView[]> {
    const result = await this.pool.query<RecentRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.distance_m, r.surface, r.created_at,
              re.horse_id, h.name AS horse_name, re.final_time_ms, re.finish_position, re.performance_score
       FROM race_entries re
       JOIN races r ON r.id = re.race_id
       JOIN horses h ON h.id = re.horse_id
       WHERE h.owner_id = $1 AND re.finish_position IS NOT NULL
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [ownerId, limit],
    );
    return result.rows.map(rowToRecentRaceResult);
  }

  /**
   * `savePracticeRace`/`savePvpMatch`'in PAYLAŞTIĞI `races` satırı ekleme
   * sorgusu (DRY).
   *
   * AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — `engine_version`/
   * `ruleset_version`/`config_version` (migration 0021) burada YAZILIR.
   * Bu üç değer `race` nesnesinin KENDİSİNDEN gelir (çağıran use-case'ler
   * `RACE_ENGINE_VERSION`/`RACE_RULESET_VERSION`/`raceConfig.version`'ı
   * `Race` nesnesini oluştururken doldurur) — bu repository'nin KENDİSİ
   * hiçbir versiyon sabiti BİLMEZ/İMPORT ETMEZ, sadece kendisine verileni
   * yazar (Infrastructure katmanının Domain sabitlerine değil, yalnızca
   * Application'ın ürettiği DEĞERE bağımlı olması — docs/ARCHITECTURE.md §4).
   */
  private async insertRaceRow(client: PoolClient, race: Race): Promise<void> {
    await client.query(
      `INSERT INTO races (id, track_id, name, distance_m, surface, weather, temperature_c, wind_kmh, humidity_pct, participant_limit, entry_fee, prize_pool, start_time, status, simulation_seed, engine_version, ruleset_version, config_version, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [
        race.id,
        race.name,
        race.distanceMeters,
        race.surface,
        race.weather,
        race.temperatureC,
        race.participantLimit,
        race.entryFee,
        race.prizePool,
        new Date(race.startTime),
        race.status,
        race.simulationSeed,
        race.engineVersion,
        race.rulesetVersion,
        race.configVersion,
        new Date(race.createdAt),
      ],
    );
  }

  /** `savePracticeRace`/`savePvpMatch`'in PAYLAŞTIĞI `race_entries` + `race_entry_segments` ekleme sorguları (DRY). */
  private async insertEntryWithSegments(client: PoolClient, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void> {
    await client.query(
      `INSERT INTO race_entries (id, race_id, horse_id, jockey_id, gate_position, tactical_style, risk_level, horse_snapshot, final_time_ms, finish_position, performance_score, created_at)
       VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        entry.raceId,
        entry.horseId,
        entry.tacticalStyle,
        entry.riskLevel,
        JSON.stringify(entry.horseSnapshot),
        entry.finalTimeMs,
        entry.finishPosition,
        entry.performanceScore,
        new Date(entry.createdAt),
      ],
    );

    for (const segment of segments) {
      await client.query(
        `INSERT INTO race_entry_segments (race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, lane, tactical_state, current_rank, blocked, jockey_decision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.id,
          segment.segmentDistanceMeters,
          segment.timestampMs,
          segment.positionMeters,
          segment.speed,
          segment.stamina,
          segment.fatigue,
          segment.lane,
          segment.tacticalState,
          segment.currentRank,
          segment.blocked,
          segment.decision,
        ],
      );
    }
  }
}
