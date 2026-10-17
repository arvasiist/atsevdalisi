import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCareConfig, loadTrainingConfig } from '@at-sevdalisi/game-config';
import { calculateStatGain } from '../../src/domain/training/training';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 17.10.2026 (brief §14 "Beslenme ve su ihtiyacı", migration 0102). İhtiyaç
 * son beslenme/sudan TÜRETİLİR; yeni at tok başlar; aç/susuz atın antrenman
 * kazancı en kötü ihtiyacın çarpanıyla düşer; yem + su ihtiyacı karşılar.
 */
describe('Yem/su ihtiyacı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const care = loadCareConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const listedHorse = async (player: RegisteredTestPlayer) =>
    (
      await http().get(`/api/v1/horses?ownerId=${player.playerId}`).set('Authorization', player.authHeader).expect(200)
    ).body.data.find((horse: { id: string }) => horse.id === player.horseId);

  /** Kazancı yalnızca ihtiyaç çarpanı değiştirsin: kişilik + vitaller nötr, stat 50. */
  const neutralize = async (player: RegisteredTestPlayer) => {
    await pool.query(
      'UPDATE horse_stats SET speed = 50, focus = 50, competitiveness = 50, stress_resistance = 50, obedience = 50 WHERE horse_id = $1',
      [player.horseId],
    );
    await pool.query(
      "UPDATE horses SET potential = 90, health = 100, fatigue = 0, energy = 100, status = 'active' WHERE id = $1",
      [player.horseId],
    );
  };
  const train = async (player: RegisteredTestPlayer) =>
    (
      await http()
        .post(`/api/v1/horses/${player.horseId}/train`)
        .set('Authorization', player.authHeader)
        .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
        .expect(200)
    ).body.data;
  const expectedGain = (needsFactor: number, fitness: number) =>
    calculateStatGain(loadTrainingConfig(), {
      trainingType: 'speed',
      intensity: 'low',
      durationMinutes: 30,
      currentStatValue: 50,
      potential: 90,
      vitals: { health: 100, fitness, fatigue: 0, energy: 100, morale: 0 },
      needsFactor,
    });

  it('yeni at tok başlar; ihtiyaç zamanla doğar ve antrenmanı düşürür; yem + su karşılar', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'İhtiyaç Sahibi');
    const fresh = await listedHorse(player);
    expect(fresh.needs).toMatchObject({ feed: { level: 'ok' }, water: { level: 'ok' }, trainingFactor: 1 });

    // Hiç beslenmemiş, su verilmemiş at: ölçüm çıpası 30 saat önce.
    // Yem aralığı 24 sa → "zamanı geldi"; su 12 sa → iki katı aşıldı, "acil".
    await pool.query("UPDATE horses SET needs_anchor_at = now() - interval '30 hours' WHERE id = $1", [player.horseId]);
    const hungry = await listedHorse(player);
    expect(hungry.needs).toMatchObject({
      feed: { level: 'due' },
      water: { level: 'urgent' },
      trainingFactor: care.needs.trainingFactorByLevel.urgent,
    });

    await neutralize(player);
    const fitness = Number((await pool.query('SELECT fitness FROM horses WHERE id = $1', [player.horseId])).rows[0].fitness);
    const weak = await train(player);
    expect(weak.needs.trainingFactor).toBe(care.needs.trainingFactorByLevel.urgent);
    expect(weak.statChanges.speed).toBeCloseTo(expectedGain(care.needs.trainingFactorByLevel.urgent, fitness), 6);
    expect(weak.statChanges.speed).toBeLessThan(expectedGain(1, fitness));

    // Takviye karın doyurmaz; saman (karın doyuran, ücretsiz) + su ihtiyacı karşılar.
    await pool.query("INSERT INTO horse_feed_log (horse_id, player_id, item_type, fed_at) VALUES ($1, $2, 'vitamin', now())", [
      player.horseId,
      player.playerId,
    ]);
    expect((await listedHorse(player)).needs.feed.level).toBe('due');
    await http()
      .post(`/api/v1/horses/${player.horseId}/feed`)
      .set('Authorization', player.authHeader)
      .send({ feedType: 'saman' })
      .expect(200);
    await http()
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'water' })
      .expect(200);
    const fed = await listedHorse(player);
    expect(fed.needs).toMatchObject({ feed: { level: 'ok' }, water: { level: 'ok' }, trainingFactor: 1 });

    await neutralize(player);
    const fitness2 = Number((await pool.query('SELECT fitness FROM horses WHERE id = $1', [player.horseId])).rows[0].fitness);
    const strong = await train(player);
    expect(strong.needs.trainingFactor).toBe(1);
    expect(strong.statChanges.speed).toBeCloseTo(expectedGain(1, fitness2), 6);
  });

  it('ihtiyaç yalnızca sahibinin listesinde; herkese açık at ucu taşımaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'İhtiyaç Gizli');
    const other = await registerTestPlayerWithStarterHorse(app, 'İhtiyaç Yabancı');
    const publicView = (
      await http().get(`/api/v1/horses/${player.horseId}`).set('Authorization', other.authHeader).expect(200)
    ).body.data;
    expect(publicView.needs).toBeUndefined();
  });
});
