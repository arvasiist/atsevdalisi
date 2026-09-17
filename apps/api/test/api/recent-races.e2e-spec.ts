import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli:
 * `GET /players/:id/recent-races`. `stable.e2e-spec.ts`/`race.e2e-spec.ts`
 * ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL + Redis
 * gerektirir — `RedisModule` `@Global()` olduğundan `RaceModule` zaten
 * Redis'e bağımlı, bkz. `race.e2e-spec.ts` doc yorumu; bu ortamda
 * ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S2/S4 hardening (bu oturum) — `POST /horses/:id/
 * practice-race` artık `HorseOwnerGuardByParam` (bkz. `race.controller.ts`),
 * `GET /players/:id/recent-races` artık `assertSelf` (bkz.
 * `recent-races.controller.ts`) ile korunur. "var olmayan bir oyuncu için
 * 404" eski senaryosu `assertSelf`'in use-case'den ÖNCE çalışması
 * nedeniyle ARTIK ULAŞILAMAZ — bkz. `player.e2e-spec.ts`'teki AYNI
 * değişiklik ve gerekçe; 403 testiyle DEĞİŞTİRİLDİ.
 */
describe('Recent races — Ana Sayfa "Son Yarış Sonuçları" (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/players/:id/recent-races (GET) — hiç yarış koşmamış bir oyuncu için boş dizi döner', async () => {
    const { playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/recent-races`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('/api/v1/players/:id/recent-races (GET) Authorization header olmadan 401 döner', async () => {
    const { playerId } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/recent-races`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/players/:id/recent-races (GET) başkasının yarış geçmişini isteyen istek 403 döner (AUDIT_REPORT.md S4)', async () => {
    const target = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${target.playerId}/recent-races`)
      .set('Authorization', attacker.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/players/:id/recent-races (GET) — pratik yarış sonrası sonucu gerçek verilerle döner', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/recent-races`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    const entry = response.body.data[0];
    expect(entry.raceId).toBe(raceResponse.body.data.raceId);
    expect(entry.horseId).toBe(horseId);
    expect(typeof entry.horseName).toBe('string');
    expect(entry.horseName.length).toBeGreaterThan(0);
    expect(entry.distanceMeters).toBe(raceResponse.body.data.distanceMeters);
    expect(entry.surface).toBe(raceResponse.body.data.surface);
    expect(typeof entry.finishPosition).toBe('number');
    expect(typeof entry.finalTimeMs).toBe('number');
    expect(typeof entry.performanceScore).toBe('number');
    expect(typeof entry.finishedAt).toBe('string');

    const playerFinish = raceResponse.body.data.finalResult.find(
      (finish: { horseId: string }) => finish.horseId === horseId,
    );
    expect(entry.finishPosition).toBe(playerFinish.finishPosition);
    expect(entry.finalTimeMs).toBe(playerFinish.finishTimeMs);
  });

  it('/api/v1/players/:id/recent-races (GET) — en yeni yarış listenin başında döner ve limit parametresine uyar', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const firstRace = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const secondRace = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/recent-races?limit=1`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].raceId).toBe(secondRace.body.data.raceId);
    expect(response.body.data[0].raceId).not.toBe(firstRace.body.data.raceId);
  });

  it('/api/v1/players/:id/recent-races (GET) var olmayan (kendisi olmayan) bir oyuncu id si için 403 döner', async () => {
    const { authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${randomUUID()}/recent-races`)
      .set('Authorization', authHeader);
    expect(response.status).toBe(403);
  });

  it('/api/v1/players/:id/recent-races (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const { authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .get('/api/v1/players/not-a-uuid/recent-races')
      .set('Authorization', authHeader);
    expect(response.status).toBe(400);
  });
});
