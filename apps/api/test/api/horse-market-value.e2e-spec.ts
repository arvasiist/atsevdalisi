import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * `docs/AUDIT_REPORT.md`'nin "§25 Stable görsel yönetim ekranı" bulgusunun
 * "piyasa değeri tahmini (`calculateMarketValue()` domain'de VAR ama
 * hiçbir yerden ÇAĞRILMIYOR — ayrı dilim)" notunu kapatır (bu turda
 * EKLENDİ). `race-timeline.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI
 * kısıt (GERÇEK PostgreSQL gerektirir — bu yüzden bu dosya sandbox'ta
 * ÇALIŞTIRILAMAZ, yalnızca CI'da).
 */
describe('Horse — Market Value (e2e, AUDIT_REPORT.md §25)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/market-value (GET) — yeni bir başlangıç atı için pozitif, sonlu bir tahmini değer döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Değer Testi');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses/${horseId}/market-value`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(response.body.data.horseId).toBe(horseId);
    expect(Number.isFinite(response.body.data.estimatedValue)).toBe(true);
    expect(response.body.data.estimatedValue).toBeGreaterThan(0);
  });

  it('/api/v1/horses/:id/market-value (GET) — `@Public()` olduğundan Authorization header OLMADAN da 200 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Halka Açık Değer Testi');

    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${horseId}/market-value`).expect(200);

    expect(response.body.data.horseId).toBe(horseId);
  });

  it('/api/v1/horses/:id/market-value (GET) — var olmayan bir at için 404 döner (500 DEĞİL)', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${randomUUID()}/market-value`).expect(404);

    expect(response.body.success).toBe(false);
  });

  it('/api/v1/horses/:id/market-value (GET) — bir pratik yarış koştuktan sonra da (health/form değiştikten sonra) hâlâ geçerli bir sayı döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarış Sonrası Değer Testi');

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses/${horseId}/market-value`)
      .set('Authorization', authHeader)
      .expect(200);

    // Bkz. `get-horse-market-value.use-case.ts` doc yorumu — artık en az
    // bir sonuçlanmış yarışı olduğundan `raceHistory` `null` DEĞİL, gerçek
    // bir { racesRun, wins } nesnesinden türetilir; bu da hâlâ pozitif,
    // sonlu bir sayı üretmelidir (çökmez, `NaN` dönmez).
    expect(Number.isFinite(response.body.data.estimatedValue)).toBe(true);
    expect(response.body.data.estimatedValue).toBeGreaterThan(0);
  });
});
