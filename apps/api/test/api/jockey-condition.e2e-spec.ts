import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeJockeyCondition } from '../../src/domain/jockey/condition';
import { effectiveJockeySkill } from '../../src/domain/jockey/jockey';
import { DEFAULT_RACE_TACTIC } from '../../src/domain/race/validation';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * JOKEY DURUMU (08.10.2026). Kanıtlananlar — hepsi GERÇEK pratik yarışla:
 *   (1) `GET /players/:id/jockey` → `condition`, DB'deki binişlerden
 *       bağımsız olarak hesaplanan durumla birebir (form + yorgunluk).
 *   (2) Sonraki yarışın dondurulan `jockeySkillComposite`i bu çarpanı İÇERİR.
 *   (3) Yorgunluk pencereye bağlıdır: binişler pencereden çıkınca düşer,
 *       form (pencereden bağımsız) kalır.
 */
describe('Jokey formu + yorgunluğu (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const skills = { startSkill: 70, tacticalSkill: 70, sprintSkill: 70, horseControl: 70, riskManagement: 70, trackKnowledge: 70 };

  async function setupPlayerWithJockey(): Promise<{ player: RegisteredTestPlayer; jockeyId: string }> {
    const player = await registerTestPlayerWithStarterHorse(app, 'Jokeyli');
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    const jockey = await pool.query<{ id: string }>(
      `INSERT INTO jockeys (name, experience, start_skill, tactical_skill, sprint_skill, horse_control,
                            risk_management, track_knowledge, salary, owner_id)
       VALUES ($1, 0, 70, 70, 70, 70, 70, 70, 0, $2) RETURNING id`,
      [`Durum Jokeyi ${randomUUID().slice(0, 8)}`, player.playerId],
    );
    return { player, jockeyId: jockey.rows[0]!.id };
  }

  async function race(player: RegisteredTestPlayer): Promise<void> {
    await pool.query(
      "UPDATE horses SET health = 100, energy = 100, fatigue = 0, morale = 80, status = 'active' WHERE id = $1",
      [player.horseId],
    );
    await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
  }

  /** Durumu üretim kodundan BAĞIMSIZ bir sorguyla okur ve saf fonksiyona verir. */
  async function expectedCondition(jockeyId: string) {
    const { formSampleSize, fatigueWindowHours } = config.jockey.condition;
    const placements = await pool.query<{ finish_position: number; field_size: string }>(
      `SELECT e.finish_position,
              (SELECT COUNT(*) FROM race_entries x WHERE x.race_id = e.race_id AND x.finish_position IS NOT NULL) AS field_size
         FROM race_entries e JOIN races r ON r.id = e.race_id
        WHERE e.jockey_id = $1 AND r.status = 'finished'
        ORDER BY r.start_time DESC LIMIT $2`,
      [jockeyId, formSampleSize],
    );
    const window = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM race_entries e JOIN races r ON r.id = e.race_id
        WHERE e.jockey_id = $1 AND r.status = 'finished' AND r.start_time > now() - ($2 * interval '1 hour')`,
      [jockeyId, fatigueWindowHours],
    );
    return computeJockeyCondition(
      {
        recentPlacements: placements.rows.map((row) => ({
          finishPosition: Number(row.finish_position),
          fieldSize: Number(row.field_size),
        })),
        ridesInWindow: Number(window.rows[0]!.n),
      },
      config.jockey.condition,
    );
  }

  const conditionOf = async (player: RegisteredTestPlayer) =>
    (await http().get(`/api/v1/players/${player.playerId}/jockey`).set('Authorization', player.authHeader).expect(200))
      .body.data.condition;

  it('durum binişlerden türetilir, sonraki yarışın kadrosuna donar; pencere dışı yorgunluk düşer', async () => {
    const { player, jockeyId } = await setupPlayerWithJockey();
    const fresh = await conditionOf(player);
    expect(fresh).toMatchObject({ form: 'unknown', ridesInWindow: 0, fatiguePercent: 0, multiplier: 1 });

    const rides = config.jockey.condition.freeRidesInWindow + 2;
    for (let index = 0; index < rides; index += 1) {
      await race(player);
    }

    const expected = await expectedCondition(jockeyId);
    expect(expected.ridesInWindow).toBe(rides);
    expect(expected.fatiguePercent).toBeGreaterThan(0);
    expect(expected.form).not.toBe('unknown');
    const view = await conditionOf(player);
    expect(view).toEqual({ ...expected, multiplier: expect.closeTo(expected.multiplier, 10) });

    // Sonraki yarışın dondurulan jokey puanı çarpanı içerir.
    await pool.query("UPDATE horse_stats SET temperament = 30 WHERE horse_id = $1", [player.horseId]);
    const pair = await pool.query<{ average: string | null }>(
      'SELECT AVG(performance_score) AS average FROM race_entries WHERE horse_id = $1 AND jockey_id = $2 AND performance_score IS NOT NULL',
      [player.horseId, jockeyId],
    );
    await race(player);
    const entry = await pool.query<{ horse_snapshot: { jockeySkillComposite: number } }>(
      `SELECT horse_snapshot FROM race_entries WHERE horse_id = $1 AND bot_label IS NULL ORDER BY created_at DESC LIMIT 1`,
      [player.horseId],
    );
    const frozen = entry.rows[0]!.horse_snapshot.jockeySkillComposite;
    const inputs = {
      jockey: { ...skills, experience: 0 },
      horse: { temperament: 30, racingStyle: DEFAULT_RACE_TACTIC.racingStyle },
      previousPairAveragePerformance: pair.rows[0]!.average === null ? null : Number(pair.rows[0]!.average),
    };
    expect(frozen).toBeCloseTo(effectiveJockeySkill({ ...inputs, conditionMultiplier: expected.multiplier }, config.jockey), 6);
    expect(frozen).not.toBeCloseTo(effectiveJockeySkill(inputs, config.jockey), 6);

    // Binişler pencereden çıkar → yorgunluk sıfır; form aynı kalır.
    await pool.query(
      `UPDATE races SET start_time = start_time - ($2 * interval '1 hour')
        WHERE id IN (SELECT race_id FROM race_entries WHERE jockey_id = $1)`,
      [jockeyId, config.jockey.condition.fatigueWindowHours + 1],
    );
    const rested = await conditionOf(player);
    expect(rested.ridesInWindow).toBe(0);
    expect(rested.fatiguePercent).toBe(0);
    expect(rested.form).not.toBe('unknown');
    expect(rested).toEqual({ ...(await expectedCondition(jockeyId)), multiplier: expect.closeTo(rested.multiplier, 10) });
  });
});
