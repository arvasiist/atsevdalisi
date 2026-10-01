import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, uniqueUsername } from './test-helpers';

/**
 * E-POSTA + ŞİFRE GİRİŞİ (30.09.2026, migration 0046).
 *
 * Sorun: hesaplar yalnızca tarayıcıdaki token'da yaşıyordu; tarayıcı verisi
 * silinince / cihaz değişince / 30 günlük token dolunca oyuncu atlarını ve
 * parasını kalıcı olarak kaybediyordu.
 *
 * **KANITLANAN:**
 *  1. Misafir "Hesabını kaydet" der; token'SIZ bir istemci (yeni cihaz)
 *     e-posta + şifreyle AYNI oyuncuya döner — atlar ve para aynıdır.
 *  2. Yanlış şifre ile kayıtlı olmayan e-posta AYNI 401 + AYNI mesajı alır.
 *  3. E-posta büyük/küçük harf duyarsız tekildir; ikinci kayıt 409.
 *  4. Geçersiz girdi 400'dür ve hiçbir satır yazılmaz.
 *  5. Şifre düz metin saklanmaz (scrypt özeti).
 *  6. Kaydetme token ister; giriş istemez.
 */
describe('E-posta + şifre girişi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const PASSWORD = 'dogru-sifre-123';

  function uniqueEmail(): string {
    return `${uniqueUsername('eposta')}@ornek.com`;
  }

  function save(authHeader: string | null, body: Record<string, unknown>) {
    const call = request(app.getHttpServer()).post('/api/v1/auth/credentials');
    if (authHeader !== null) {
      call.set('Authorization', authHeader);
    }
    return call.send(body);
  }

  function login(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/v1/auth/login/password').send(body);
  }

  it('misafir hesabını kaydeder; token SIZ yeni cihaz aynı oyuncuya, aynı atlara ve paraya döner', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Kaydeden Misafir');
    const email = uniqueEmail();
    const moneyBefore = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [guest.playerId]);

    const saved = await save(guest.authHeader, { email: `  ${email.toUpperCase()} `, password: PASSWORD }).expect(201);
    expect(saved.body.data.email).toBe(email);

    const status = await request(app.getHttpServer())
      .get('/api/v1/auth/credentials')
      .set('Authorization', guest.authHeader)
      .expect(200);
    expect(status.body.data.email).toBe(email);

    const session = await login({ email, password: PASSWORD }).expect(200);
    expect(session.body.data.player.id).toBe(guest.playerId);
    expect(session.body.data.player.money).toBe(Number(moneyBefore.rows[0].money));

    // Yeni token gerçekten yetkilendirir ve at aynı oyuncudadır.
    const horses = await request(app.getHttpServer())
      .get('/api/v1/horses')
      .query({ ownerId: guest.playerId })
      .set('Authorization', `Bearer ${session.body.data.token as string}`)
      .expect(200);
    expect((horses.body.data as Array<{ id: string }>).map((horse) => horse.id)).toContain(guest.horseId);
  });

  it('yanlış şifre ile kayıtlı olmayan e-posta AYNI 401 ve AYNI mesajı alır', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Yanlış Şifreci');
    const email = uniqueEmail();
    await save(guest.authHeader, { email, password: PASSWORD }).expect(201);

    const wrongPassword = await login({ email, password: 'baska-bir-sifre' }).expect(401);
    const unknownEmail = await login({ email: uniqueEmail(), password: PASSWORD }).expect(401);

    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('e-posta harf duyarsız tekildir (409) ve bir hesap ikinci kez kaydedilemez (409)', async () => {
    const first = await registerTestPlayerWithStarterHorse(app, 'İlk Sahip');
    const second = await registerTestPlayerWithStarterHorse(app, 'İkinci Deneyen');
    const email = uniqueEmail();
    await save(first.authHeader, { email, password: PASSWORD }).expect(201);

    const taken = await save(second.authHeader, { email: email.toUpperCase(), password: PASSWORD }).expect(409);
    expect(taken.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const again = await save(first.authHeader, { email: uniqueEmail(), password: PASSWORD }).expect(409);
    expect(again.body.error.code).toBe('CREDENTIALS_ALREADY_SET');
  });

  it('geçersiz e-posta / kısa şifre 400 döner ve hiçbir satır yazılmaz', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Hatalı Girdi');

    await save(guest.authHeader, { email: 'eposta-degil', password: PASSWORD }).expect(400);
    await save(guest.authHeader, { email: uniqueEmail(), password: 'kisa' }).expect(400);
    await save(guest.authHeader, { email: 42, password: PASSWORD }).expect(400);

    const rows = await pool.query('SELECT 1 FROM player_credentials WHERE player_id = $1', [guest.playerId]);
    expect(rows.rows).toHaveLength(0);
  });

  it('şifre düz metin SAKLANMAZ — scrypt özeti tutulur', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Özet Kontrol');
    await save(guest.authHeader, { email: uniqueEmail(), password: PASSWORD }).expect(201);

    const row = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM player_credentials WHERE player_id = $1',
      [guest.playerId],
    );
    expect(row.rows[0].password_hash.startsWith('scrypt$')).toBe(true);
    expect(row.rows[0].password_hash).not.toContain(PASSWORD);
  });

  it('kaydetme token ister (401); giriş token istemez; misafirin durumu email:null', async () => {
    await save(null, { email: uniqueEmail(), password: PASSWORD }).expect(401);

    const guest = await registerTestPlayerWithStarterHorse(app, 'Saf Misafir');
    const status = await request(app.getHttpServer())
      .get('/api/v1/auth/credentials')
      .set('Authorization', guest.authHeader)
      .expect(200);
    expect(status.body.data.email).toBeNull();
  });
});
