import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDENTITY_PROVIDER_VERIFIER, type IdentityProviderVerifier } from '../../src/application/ports/identity-provider';
import { InvalidProviderTokenError } from '../../src/domain/auth/errors';
import type { VerifiedProviderIdentity } from '../../src/domain/player/auth-provider';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, uniqueUsername } from './test-helpers';

/**
 * GOOGLE GİRİŞİ + HESAP BAĞLAMA (01.10.2026, migration 0048).
 *
 * Testte gerçek bir Google belgesi üretilemez; belge doğrulayıcı
 * (`IDENTITY_PROVIDER_VERIFIER`) sahtesiyle değiştirilir: `gecerli:<sub>`
 * biçimindeki belge o `sub` ile doğrulanmış sayılır, başka her şey
 * `InvalidProviderTokenError`dır. Gerçek doğrulayıcının imza/audience
 * kontrolü bu dosyanın konusu DEĞİLDİR; konu, doğrulanmış bir kimliğin
 * hangi oyuncuya bağlandığıdır.
 *
 * **KANITLANAN:**
 *  1. Misafir Google bağlar; token'SIZ yeni cihaz Google ile AYNI oyuncuya,
 *     aynı ata döner. `GET /auth/credentials` bağlantıyı gösterir.
 *  2. Aynı kimliği yeniden bağlamak tekrarlanabilir (200, tek satır).
 *  3. Başka oyuncunun Google hesabı bağlanamaz (409) — hesaplar birleşmez.
 *  4. Bir oyuncuya ikinci Google hesabı bağlanamaz (409) — eşzamanlı
 *     iki istekte bile (migration 0048 kısıtı).
 *  5. Geçersiz belge 401, bilinmeyen sağlayıcı 400, token'sız istek 401;
 *     hiçbirinde satır yazılmaz.
 *  6. `GET /auth/providers` herkese açıktır; kimlik bilgisi yokken `null` döner.
 */
const VALID_PREFIX = 'gecerli:';

class FakeGoogleVerifier implements IdentityProviderVerifier {
  verifyGoogleIdToken(idToken: string): Promise<VerifiedProviderIdentity> {
    if (!idToken.startsWith(VALID_PREFIX)) {
      return Promise.reject(new InvalidProviderTokenError('Sahte doğrulayıcı: geçersiz belge.'));
    }
    const sub = idToken.slice(VALID_PREFIX.length);
    return Promise.resolve({ provider: 'google', providerUserId: sub, email: `${sub}@gmail.com` });
  }

  verifyAppleIdToken(): Promise<VerifiedProviderIdentity> {
    return Promise.reject(new InvalidProviderTokenError('Sahte doğrulayıcı: Apple yok.'));
  }
}

describe('Google girişi + hesap bağlama (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp((builder) =>
      builder.overrideProvider(IDENTITY_PROVIDER_VERIFIER).useValue(new FakeGoogleVerifier()),
    );
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function googleToken(): string {
    return `${VALID_PREFIX}${uniqueUsername('g')}`;
  }

  function link(authHeader: string | null, body: Record<string, unknown>) {
    const call = request(app.getHttpServer()).post('/api/v1/auth/link');
    if (authHeader !== null) {
      call.set('Authorization', authHeader);
    }
    return call.send(body);
  }

  function googleLogin(idToken: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ provider: 'google', idToken });
  }

  async function linkCount(playerId: string): Promise<number> {
    const result = await pool.query('SELECT 1 FROM player_auth_providers WHERE player_id = $1', [playerId]);
    return result.rowCount ?? 0;
  }

  it('misafir Google bağlar; token SIZ yeni cihaz Google ile aynı oyuncuya ve aynı ata döner', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Google Bağlayan');
    const token = googleToken();

    const linked = await link(guest.authHeader, { provider: 'google', idToken: token }).expect(200);
    expect(linked.body.data).toEqual({ provider: 'google' });

    const status = await request(app.getHttpServer())
      .get('/api/v1/auth/credentials')
      .set('Authorization', guest.authHeader)
      .expect(200);
    expect(status.body.data).toEqual({ email: null, emailVerified: false, linkedProviders: ['google'] });

    const session = await googleLogin(token).expect(200);
    expect(session.body.data.player.id).toBe(guest.playerId);
    const horses = await request(app.getHttpServer())
      .get('/api/v1/horses')
      .query({ ownerId: guest.playerId })
      .set('Authorization', `Bearer ${session.body.data.token as string}`)
      .expect(200);
    expect((horses.body.data as Array<{ id: string }>).map((horse) => horse.id)).toContain(guest.horseId);
  });

  it('bağlanmamış Google hesabıyla ilk giriş YENİ oyuncu açar; ikinci giriş aynı oyuncuya döner', async () => {
    const token = googleToken();
    const first = await googleLogin(token).expect(200);
    const second = await googleLogin(token).expect(200);
    expect(second.body.data.player.id).toBe(first.body.data.player.id);
    expect(await linkCount(first.body.data.player.id as string)).toBe(1);
  });

  it('aynı kimliği yeniden bağlamak tekrarlanabilir — tek satır kalır', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Tekrar Bağlayan');
    const token = googleToken();
    await link(guest.authHeader, { provider: 'google', idToken: token }).expect(200);
    await link(guest.authHeader, { provider: 'google', idToken: token }).expect(200);
    expect(await linkCount(guest.playerId)).toBe(1);
  });

  it('başka oyuncuya bağlı Google hesabı bağlanamaz (409) — hesaplar birleşmez', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Asıl Sahip');
    const other = await registerTestPlayerWithStarterHorse(app, 'Diğer Oyuncu');
    const token = googleToken();
    await link(owner.authHeader, { provider: 'google', idToken: token }).expect(200);

    const taken = await link(other.authHeader, { provider: 'google', idToken: token }).expect(409);
    expect(taken.body.error.code).toBe('PROVIDER_IDENTITY_TAKEN');
    expect(await linkCount(other.playerId)).toBe(0);
    const session = await googleLogin(token).expect(200);
    expect(session.body.data.player.id).toBe(owner.playerId);
  });

  it('bir oyuncuya ikinci Google hesabı bağlanamaz (409)', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'İki Google');
    await link(guest.authHeader, { provider: 'google', idToken: googleToken() }).expect(200);

    const second = await link(guest.authHeader, { provider: 'google', idToken: googleToken() }).expect(409);
    expect(second.body.error.code).toBe('PROVIDER_ALREADY_LINKED');
    expect(await linkCount(guest.playerId)).toBe(1);
  });

  it('eşzamanlı iki farklı Google hesabı: biri bağlanır, diğeri 409 (migration 0048 kısıtı)', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Eşzamanlı Bağlayan');
    const responses = await Promise.all(
      [googleToken(), googleToken(), googleToken(), googleToken()].map((token) =>
        link(guest.authHeader, { provider: 'google', idToken: token }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(response.body.error.code).toBe('PROVIDER_ALREADY_LINKED');
    }
    expect(await linkCount(guest.playerId)).toBe(1);
  });

  it('geçersiz belge 401, bilinmeyen sağlayıcı 400, token\'sız istek 401 — hiçbirinde satır yazılmaz', async () => {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Hatalı Bağlama');

    const forged = await link(guest.authHeader, { provider: 'google', idToken: 'uydurma-belge' }).expect(401);
    expect(forged.body.error.code).toBe('INVALID_PROVIDER_TOKEN');
    await link(guest.authHeader, { provider: 'facebook', idToken: googleToken() }).expect(400);
    await link(guest.authHeader, { provider: 'google', idToken: 42 }).expect(400);
    await link(null, { provider: 'google', idToken: googleToken() }).expect(401);

    expect(await linkCount(guest.playerId)).toBe(0);
  });

  it('GET /auth/providers herkese açıktır; kimlik bilgisi yokken googleClientId null döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/providers').expect(200);
    expect(response.body.data).toEqual({ googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null });
  });
});
