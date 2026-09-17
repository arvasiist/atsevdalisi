import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer, uniqueUsername } from './test-helpers';

/**
 * FAZ 1 wiring — brief §7 Player, ilk uçtan uca (gerçek PostgreSQL'e karşı)
 * dilim.
 *
 * AUDIT_REPORT.md Bulgu S1/S4 hardening (bu oturum) — `POST /players`
 * `@Public()` kalır ve artık kayıt sonrası HEMEN bir `AuthSession`
 * (`{token, player}`) döner (bkz. `player.controller.ts` doc yorumu);
 * `GET /players/:id` ise artık `@CurrentPlayer()` + `assertSelf` gerektirir
 * — başka bir oyuncunun id'sini isteyen bir istek artık 404 DEĞİL, 403
 * alır (eski "var olmayan id için 404" testinin kapsamı ARTIK BAŞKA BİR
 * OYUNCUNUN id'sine erişim denemesiyle örtüşüyor, çünkü `assertSelf`
 * veritabanı sorgusundan ÖNCE çalışır — bkz. `player.controller.ts`).
 *
 * Ortak bootstrap/oyuncu-kaydı yardımcıları artık `test-helpers.ts`'te
 * paylaşılır (bkz. o dosyanın doc yorumu).
 *
 * ÖNEMLİ — bu test GERÇEK bir PostgreSQL bağlantısı gerektirir
 * (`DATABASE_URL` ortam değişkeni, şeması `npm run migrate` ile
 * uygulanmış olmalı). Bu, bu geliştirme ortamında ÇALIŞTIRILAMAZ; gerçek
 * doğrulama GitHub Actions CI'da yapılır (bkz. `.github/workflows/ci.yml`
 * "postgres" servisi).
 */
describe('Player (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/players (POST) geçerli bir kayıtla başlangıç bakiyesine sahip yeni bir oyuncu ve bir oturum token döner', async () => {
    const username = uniqueUsername();
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username, displayName: 'Test Oyuncu' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.length).toBeGreaterThan(0);
    expect(response.body.data.player.level).toBe(1);
    expect(response.body.data.player.xp).toBe(0);
    expect(typeof response.body.data.player.money).toBe('number');
    expect(response.body.data.player.money).toBeGreaterThan(0);
    expect(response.body.data.player.id).toBeDefined();
  });

  it('/api/v1/players (POST) aynı kullanıcı adıyla ikinci kayıt denemesi 409 döner', async () => {
    const username = uniqueUsername();
    await request(app.getHttpServer()).post('/api/v1/players').send({ username, displayName: 'İlk' }).expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username, displayName: 'İkinci' });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe('USERNAME_ALREADY_TAKEN');
  });

  it('/api/v1/players (POST) geçersiz formatlı kullanıcı adı 400 döner', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: 'AB', displayName: 'Test' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('/api/v1/players/:id (GET) Authorization header olmadan 401 döner', async () => {
    const player = await registerTestPlayer(app, 'Yetkisiz Deneme');
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${player.playerId}`);
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('/api/v1/players/:id (GET) kendi profilini isteyen oyuncuya profili döner', async () => {
    const player = await registerTestPlayer(app, 'Getirilecek Oyuncu');

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}`)
      .set('Authorization', player.authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(player.playerId);
    expect(fetched.body.data.displayName).toBe('Getirilecek Oyuncu');
  });

  it('/api/v1/players/:id (GET) başka bir oyuncunun profilini isteyen istek 403 döner (AUDIT_REPORT.md S4)', async () => {
    const viewer = await registerTestPlayer(app, 'Gözlemci');
    const other = await registerTestPlayer(app, 'Başka Oyuncu');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${other.playerId}`)
      .set('Authorization', viewer.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/players/:id (GET) var olmayan bir id (kendi id si olmadığı için) 403 döner', async () => {
    const viewer = await registerTestPlayer(app, 'Gözlemci İki');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${randomUUID()}`)
      .set('Authorization', viewer.authHeader);

    expect(response.status).toBe(403);
  });

  it('/api/v1/players/:id (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const viewer = await registerTestPlayer(app, 'Gözlemci Üç');

    const response = await request(app.getHttpServer())
      .get('/api/v1/players/not-a-uuid')
      .set('Authorization', viewer.authHeader);

    expect(response.status).toBe(400);
  });
});
