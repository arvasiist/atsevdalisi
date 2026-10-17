import type { Pool, PoolClient } from 'pg';
import type { CareerConfig } from '@at-sevdalisi/game-config';
import type { CareerHistoryRow } from '../../application/ports/career.repository';

/**
 * KARİYER PUANI (16.10.2026, brief §10) — TEK SQL tanımı. Sayaç yoktur:
 * oyuncunun KOŞTURDUĞU (`e.player_id`, atın şimdiki sahibi DEĞİL) bitmiş
 * yarışlardaki derecesinden türetilir. Sınıf: turnuva > masa > masasız lobi
 * (katılım satırı `status` taşır) > pratik/eşleşme (`status` NULL). Puan
 * tablosu config'ten parametre olarak gelir. Kariyer ucu, başarım ölçütü
 * (`career_points`) ve lobi katılım kapısı aynı fonksiyonu kullanır —
 * gösterilen puan ile kapıdaki puan ayrışamaz.
 */
const CLASS_SQL = `CASE
    WHEN EXISTS (SELECT 1 FROM tournaments t WHERE t.race_id = r.id) THEN 'tournament'
    WHEN r.table_id IS NOT NULL THEN r.table_id
    WHEN e.status IS NOT NULL THEN 'open'
    ELSE 'practice'
  END`;

const POINTS_SQL = `CASE
    WHEN e.finish_position = 1 THEN pts.p1
    WHEN e.finish_position = 2 THEN pts.p2
    WHEN e.finish_position = 3 THEN pts.p3
    ELSE pts.p4
  END`;

const COUNTED_SQL = `e.player_id = $1
    AND r.status = 'finished'
    AND e.status IS DISTINCT FROM 'cancelled'
    AND e.finish_position IS NOT NULL`;

function pointParams(config: CareerConfig): [string[], number[], number[], number[], number[]] {
  const entries = Object.entries(config.racePoints);
  return [
    entries.map(([key]) => key),
    entries.map(([, points]) => points[0]),
    entries.map(([, points]) => points[1]),
    entries.map(([, points]) => points[2]),
    entries.map(([, points]) => points[3]),
  ];
}

const POINTS_TABLE_SQL = `pts(class_key, p1, p2, p3, p4) AS (
    SELECT * FROM unnest($2::text[], $3::int[], $4::int[], $5::int[], $6::int[])
  )`;

export async function careerPointsOf(db: Pool | PoolClient, playerId: string, config: CareerConfig): Promise<number> {
  const result = await db.query<{ points: string }>(
    `WITH ${POINTS_TABLE_SQL}
     SELECT COALESCE(SUM(${POINTS_SQL}), 0)::bigint AS points
       FROM race_entries e
       JOIN races r ON r.id = e.race_id
       JOIN pts ON pts.class_key = ${CLASS_SQL}
      WHERE ${COUNTED_SQL}`,
    [playerId, ...pointParams(config)],
  );
  return Number(result.rows[0]?.points ?? 0);
}

/** Son bitmiş yarışlar + her birinin kariyer puanı (yeni → eski; eşitlikte yarış kimliği). */
export async function careerHistoryOf(
  db: Pool | PoolClient,
  playerId: string,
  config: CareerConfig,
  limit: number,
): Promise<CareerHistoryRow[]> {
  const result = await db.query<{
    race_id: string;
    name: string;
    start_time: Date;
    track_id: string | null;
    class_key: string;
    finish_position: number;
    participant_limit: number;
    points: number;
  }>(
    `WITH ${POINTS_TABLE_SQL}
     SELECT r.id AS race_id, r.name, r.start_time, r.track_id, pts.class_key, e.finish_position,
            r.participant_limit, (${POINTS_SQL})::int AS points
       FROM race_entries e
       JOIN races r ON r.id = e.race_id
       JOIN pts ON pts.class_key = ${CLASS_SQL}
      WHERE ${COUNTED_SQL}
      ORDER BY r.start_time DESC, r.id DESC
      LIMIT $7`,
    [playerId, ...pointParams(config), limit],
  );
  return result.rows.map((row) => ({
    raceId: row.race_id,
    raceName: row.name,
    startTime: row.start_time,
    trackId: row.track_id,
    classKey: row.class_key,
    finishPosition: Number(row.finish_position),
    fieldSize: Number(row.participant_limit),
    points: Number(row.points),
  }));
}
