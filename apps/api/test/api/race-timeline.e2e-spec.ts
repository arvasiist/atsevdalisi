import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { simulateRace, type RaceSimulationInput } from '../../src/domain/race/race-engine';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium) — `GET /races/:id/timeline` (bkz.
 * `race-timeline.controller.ts`, `get-race-timeline.use-case.ts`,
 * `postgres-race.repository.ts` `findTimelineByRaceId`/`isPlayerParticipant`).
 *
 * `race.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir).
 */
describe('Race — Tam Alan Replay / Timeline (e2e, AUDIT_REPORT.md R2)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/races/:id/timeline (GET) — TÜM katılımcıları (oyuncu + botlar) segmentleriyle birlikte döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Replay Testi');

    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const { raceId } = raceResponse.body.data;
    // config/race.config.json PRACTICE_RACE_BOT_COUNT (5) + oyuncunun atı = 6 (bkz. race.e2e-spec.ts).
    expect(raceResponse.body.data.finalResult).toHaveLength(6);

    const timelineResponse = await request(app.getHttpServer())
      .get(`/api/v1/races/${raceId}/timeline`)
      .set('Authorization', authHeader)
      .expect(200);

    const timeline = timelineResponse.body.data;
    expect(timeline.raceId).toBe(raceId);
    expect(timeline.entrants).toHaveLength(6);

    const playerEntrant = timeline.entrants.find((entrant: { horseId: string | null }) => entrant.horseId === horseId);
    expect(playerEntrant).toBeDefined();
    expect(playerEntrant.isBot).toBe(false);
    expect(playerEntrant.botLabel).toBeNull();
    expect(playerEntrant.horseName).toBeTruthy();
    expect(playerEntrant.segments.length).toBeGreaterThan(0);

    const botEntrants = timeline.entrants.filter((entrant: { isBot: boolean }) => entrant.isBot);
    expect(botEntrants).toHaveLength(5);
    for (const bot of botEntrants) {
      expect(bot.horseId).toBeNull();
      expect(bot.horseName).toBeNull();
      expect(typeof bot.botLabel).toBe('string');
      // AUDIT_REPORT.md Bulgu R2'nin çözdüğü TAM OLARAK bu: botlar da artık
      // KENDİ segment telemetrisiyle kalıcı — önceden bu dizi HER ZAMAN
      // boştu çünkü botlar hiç `race_entries`'e yazılmıyordu.
      expect(bot.segments.length).toBeGreaterThan(0);
      expect(bot.finishPosition).toBeGreaterThanOrEqual(1);
      expect(bot.finishPosition).toBeLessThanOrEqual(6);
    }

    const finishPositions = timeline.entrants.map((entrant: { finishPosition: number }) => entrant.finishPosition);
    expect(new Set(finishPositions).size).toBe(6);
    expect([...finishPositions].sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

    // AUDIT_REPORT.md Bulgu R3 (bu oturum) — "Draw/post-position" artık
    // gerçek bir çekilişten türetiliyor (bkz. `gate-assignment.ts` doc
    // yorumu) — TÜM 6 katılımcı (oyuncu + botlar) [1,6] aralığında BENZERSİZ
    // bir kapı numarası almalı, `null` KALMAMALI (önceden HER ZAMAN null'dı).
    const gatePositions = timeline.entrants.map((entrant: { gatePosition: number | null }) => entrant.gatePosition);
    expect(gatePositions.every((gp: number | null) => gp !== null)).toBe(true);
    expect(new Set(gatePositions).size).toBe(6);
    expect([...gatePositions].sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('/api/v1/races/:id/timeline (GET) — DB\'den okunan tam alan, simulationSeed ile YENİDEN SİMÜLE edilen alanla BİREBİR eşleşir (brief §58 deterministik replay)', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Deterministik Replay Testi');
    const config = app.get(AppConfigService);

    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const { raceId } = raceResponse.body.data;

    const timelineResponse = await request(app.getHttpServer())
      .get(`/api/v1/races/${raceId}/timeline`)
      .set('Authorization', authHeader)
      .expect(200);
    const timeline = timelineResponse.body.data;

    const raceRow = await pool.query<{
      distance_m: number;
      surface: 'grass' | 'dirt' | 'synthetic';
      weather: 'sunny' | 'rainy' | 'windy' | 'cloudy' | 'hot' | 'cold';
      simulation_seed: string;
    }>('SELECT distance_m, surface, weather, simulation_seed FROM races WHERE id = $1', [raceId]);
    const race = raceRow.rows[0];

    // DB'den GERÇEK `horse_snapshot`'ları geri okuyarak — YENİDEN
    // SİMÜLASYON yolu bu, DB OKUMA yolu ise yukarıdaki `timeline` — brief
    // §58'in "aynı seed + aynı snapshot + aynı config = aynı sonuç"
    // garantisini İKİ BAĞIMSIZ yoldan (kalıcı satırlar vs. yeniden hesaplama)
    // doğrular.
    const snapshotRows = await pool.query<{ horse_id: string | null; bot_label: string | null; horse_snapshot: RaceEntrantSnapshot }>(
      'SELECT horse_id, bot_label, horse_snapshot FROM race_entries WHERE race_id = $1',
      [raceId],
    );
    const playerRow = snapshotRows.rows.find((row) => row.horse_id !== null);
    const botRows = snapshotRows.rows
      .filter((row) => row.bot_label !== null)
      .sort((a, b) => Number(a.bot_label!.replace('bot-', '')) - Number(b.bot_label!.replace('bot-', '')));
    expect(playerRow).toBeDefined();

    const entries: RaceEntrantSnapshot[] = [playerRow!.horse_snapshot, ...botRows.map((row) => row.horse_snapshot)];

    const simulationInput: RaceSimulationInput = {
      raceId,
      simulationSeed: race.simulation_seed,
      distanceMeters: race.distance_m,
      surface: race.surface,
      weather: race.weather,
      temperatureC: null,
      entries,
      raceConfig: config.race,
      weatherConfig: config.weather,
    };
    const resimulated = simulateRace(simulationInput);

    for (const dbEntrant of timeline.entrants) {
      const simulationLabel: string = dbEntrant.isBot ? dbEntrant.botLabel : dbEntrant.horseId;
      const resimulatedFinish = resimulated.finalResult.find((entry) => entry.horseId === simulationLabel);
      expect(resimulatedFinish).toBeDefined();
      expect(resimulatedFinish!.finishPosition).toBe(dbEntrant.finishPosition);
      expect(resimulatedFinish!.finishTimeMs).toBe(dbEntrant.finalTimeMs);
      // `performance_score` DB'de NUMERIC(6,2) olduğundan (Postgres 2 ondalığa
      // YUVARLAR), yeniden simüle edilen HAM (yuvarlanmamış) değerle birebir
      // değil, 1 ondalık hassasiyetle (±0.05 tolerans) karşılaştırılır — bu,
      // rastgele bir tolerans DEĞİL, YALNIZCA DB'nin kendi yuvarlama adımından
      // kaynaklanan beklenen sapımı karşılar.
      expect(resimulatedFinish!.performanceScore).toBeCloseTo(dbEntrant.performanceScore, 1);
    }
  });

  it('/api/v1/races/:id/timeline (GET) — bu yarışta hiçbir atı olmayan bir oyuncu için 403 FORBIDDEN döner', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Yarış Sahibi');
    const outsider = await registerTestPlayer(app, 'Yabancı');

    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const { raceId } = raceResponse.body.data;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/races/${raceId}/timeline`)
      .set('Authorization', outsider.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/races/:id/timeline (GET) var olmayan bir yarış için 404 RACE_NOT_FOUND döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/races/${randomUUID()}/timeline`)
      .set('Authorization', someone.authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RACE_NOT_FOUND');
  });

  it('/api/v1/races/:id/timeline (GET) Authorization header olmadan 401 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer()).get(`/api/v1/races/${raceResponse.body.data.raceId}/timeline`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/races/:id/timeline (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .get('/api/v1/races/not-a-uuid/timeline')
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(400);
  });
});
