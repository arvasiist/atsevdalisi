import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer } from './test-helpers';

/**
 * FAZ 1 wiring — İkinci dilim: `RegisterPlayerUseCase` artık yeni oyuncuya
 * bir başlangıç atı da veriyor (bkz. `domain/horse/horse.ts`
 * `createStarterHorse`, docs/ROADMAP.md). Bu dosya, `player.e2e-spec.ts`
 * ile AYNI bootstrap desenini kullanır ve AYNI şekilde GERÇEK bir
 * PostgreSQL bağlantısı gerektirir (bu ortamda ÇALIŞTIRILAMAZ, bkz.
 * docs/ARCHITECTURE.md §9 — yalnızca CI'da doğrulanır).
 *
 * AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — `GET /horses?ownerId=`
 * artık `assertSelf` ile korunur (bkz. `horse.controller.ts` doc yorumu):
 * yalnızca oturum sahibi KENDİ atlarını listeleyebilir. `GET /horses/:id`
 * ise BİLEREK `@Public()` kalır (At Pazarı tarama akışı gerektirir) — bu
 * yüzden o çağrılar auth header GEREKTİRMEZ.
 */
describe('Horse (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerPlayer(): Promise<{ id: string; authHeader: string }> {
    const player = await registerTestPlayer(app, 'At Sahibi');
    return { id: player.playerId, authHeader: player.authHeader };
  }

  it('/api/v1/players (POST) — yeni oyuncu otomatik olarak bir başlangıç atı alır', async () => {
    const player = await registerPlayer();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.id}`)
      .set('Authorization', player.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    const horse = response.body.data[0];
    expect(horse.ownerId).toBe(player.id);
    expect(horse.level).toBe(1);
    expect(horse.status).toBe('active');
    expect(horse.gender).toBe('gelding');
    expect(horse.health).toBe(100);
    // AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — docs/SECURITY.md §9,
    // bkz. `apps/api/src/api/dto/horse.mapper.ts`. Ham `potential` HİÇBİR
    // ZAMAN HTTP yanıtına sızmamalı, yerine bir `potentialEstimate` ARALIĞI
    // dönmelidir.
    expect(horse).not.toHaveProperty('potential');
    expect(JSON.stringify(response.body)).not.toContain('"potential"');
    expect(horse.potentialEstimate).toBeDefined();
    expect(horse.potentialEstimate.min).toBeLessThanOrEqual(horse.potentialEstimate.max);
  });

  it('/api/v1/horses (GET) Authorization header olmadan 401 döner', async () => {
    const player = await registerPlayer();
    const response = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${player.id}`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/horses (GET) başka bir oyuncunun atlarını listelemeye çalışan istek 403 döner (AUDIT_REPORT.md S4)', async () => {
    const owner = await registerPlayer();
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${owner.id}`)
      .set('Authorization', attacker.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id (GET) az önce oluşturulan atı döner (public, auth gerekmez)', async () => {
    const player = await registerPlayer();
    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.id}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const horseId = listResponse.body.data[0].id;

    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${horseId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(horseId);
    expect(response.body.data.ownerId).toBe(player.id);
    // AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — `listByOwner` testindeki
    // AYNI gizlilik kontrolü, TEK BİR at detayı uç noktası için de geçerli.
    expect(response.body.data).not.toHaveProperty('potential');
    expect(JSON.stringify(response.body)).not.toContain('"potential"');
    expect(response.body.data.potentialEstimate).toBeDefined();
  });

  it('/api/v1/horses/:id (GET) var olmayan bir id için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${randomUUID()}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/horses/not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses (GET) ownerId eksikse 400 döner', async () => {
    const someone = await registerPlayer();
    const response = await request(app.getHttpServer())
      .get('/api/v1/horses')
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses (GET) var olmayan (kendisi olmayan) bir sahip id si için 403 döner', async () => {
    const someone = await registerPlayer();
    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${randomUUID()}`)
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(403);
  });
});
