import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { ErrorCode, type AuthSessionInfo, type SessionTokens } from '@at-sevdalisi/shared-types';
import { TOKEN_SERVICE, type TokenService } from '../../src/application/ports/token.service';
import { AuthSessionUseCase, hashRefreshToken } from '../../src/application/use-cases/auth-session.use-case';
import { EMAIL_SENDER } from '../../src/application/ports/email-sender';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { OutboxEmailSender } from '../../src/infrastructure/email/outbox-email-sender';
import { bootstrapTestApp, uniqueUsername } from './test-helpers';

/**
 * OTURUM (02.10.2026, migration 0057) — kısa ömürlü erişim token'ı + dönen
 * refresh token + çıkış / tüm cihazlardan çıkış / cihaz listesi.
 *
 * Kanıtlanan şeyler:
 * - Kayıt yanıtı refresh token taşır; DB'de yalnızca ÖZETİ vardır.
 * - Yenileme token'ı döndürür; ESKİ token tekrar sunulursa oturum KAPANIR
 *   ve o oturumun erişim token'ı da ANINDA reddedilir (çalıntı tespiti).
 * - Çıkış erişim token'ını ANINDA öldürür (imza hâlâ geçerliyken).
 * - Tüm cihazlardan çıkış ESKİ (`sid`siz) token'ları da öldürür.
 * - Başkasının oturumu kapatılamaz (404, varlığı sızdırılmaz).
 * - Eski token kabul edilir ve oturuma yükseltilir; oturumlu token
 *   yükseltilemez (409).
 * - Şifre sıfırlama tüm oturumları kapatır.
 * - Oturum sınırı aşılınca en eski oturum kapanır.
 */
describe('Oturum: refresh token + çıkış (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let tokens: TokenService;
  const settings = loadAuthConfig().session;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    tokens = app.get<TokenService>(TOKEN_SERVICE);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function register(userAgent = 'TestBrowser/1.0'): Promise<SessionTokens & { playerId: string }> {
    const response = await request(server())
      .post('/api/v1/players')
      .set('User-Agent', userAgent)
      .send({ username: uniqueUsername('oturum'), displayName: 'Oturum' })
      .expect(201);
    const data = response.body.data as SessionTokens & { player: { id: string } };
    return { ...data, playerId: data.player.id };
  }

  const me = (token: string, playerId: string) =>
    request(server()).get(`/api/v1/players/${playerId}`).set('Authorization', `Bearer ${token}`);
  const refresh = (refreshToken: unknown) => request(server()).post('/api/v1/auth/refresh').send({ refreshToken });

  it('kayıt refresh token döner; DB yalnızca özeti tutar; erişim süresi config\'ten', async () => {
    const before = Date.now();
    const session = await register();
    expect(typeof session.refreshToken).toBe('string');
    expect(session.refreshToken.length).toBeGreaterThan(20);
    const expiresIn = new Date(session.accessTokenExpiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(settings.accessTokenTtlSeconds * 1000 - 5000);
    expect(expiresIn).toBeLessThanOrEqual(settings.accessTokenTtlSeconds * 1000 + 5000);

    const rows = await pool.query<{ refresh_token_hash: string; user_agent: string }>(
      'SELECT refresh_token_hash, user_agent FROM auth_sessions WHERE player_id = $1',
      [session.playerId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.refresh_token_hash).toBe(hashRefreshToken(session.refreshToken));
    expect(rows.rows[0]!.refresh_token_hash).not.toContain(session.refreshToken);
    expect(rows.rows[0]!.user_agent).toBe('TestBrowser/1.0');

    await me(session.token, session.playerId).expect(200);
  });

  it('yenileme token\'ı döndürür; eski token TEKRAR sunulursa oturum kapanır', async () => {
    const session = await register();
    const rotated = (await refresh(session.refreshToken).expect(200)).body.data as SessionTokens;
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    await me(rotated.token, session.playerId).expect(200);

    // Çalınan eski token kullanılıyor → oturum kapanır.
    const reused = await refresh(session.refreshToken).expect(401);
    expect(reused.body.error.code).toBe(ErrorCode.InvalidRefreshToken);
    const row = await pool.query<{ revoke_reason: string }>(
      'SELECT revoke_reason FROM auth_sessions WHERE player_id = $1',
      [session.playerId],
    );
    expect(row.rows[0]!.revoke_reason).toBe('reuse_detected');

    // Meşru sahibin yeni token'ı da artık geçmez (hangisi çalıntı bilinemez).
    await refresh(rotated.refreshToken).expect(401);
    const denied = await me(rotated.token, session.playerId).expect(401);
    expect(denied.body.error.code).toBe(ErrorCode.Unauthorized);
  });

  it('bozuk / uydurma / eksik refresh token AYNI 401', async () => {
    for (const bad of [undefined, '', 42, 'uydurma-token', 'x'.repeat(10_000)]) {
      const response = await refresh(bad).expect(401);
      expect(response.body.error.code).toBe(ErrorCode.InvalidRefreshToken);
    }
  });

  it('çıkış erişim token\'ını ANINDA öldürür (imza hâlâ geçerli)', async () => {
    const session = await register();
    await request(server()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${session.token}`).expect(200);
    await me(session.token, session.playerId).expect(401);
    await refresh(session.refreshToken).expect(401);
  });

  it('cihaz listesi yalnızca çağıranın aktif oturumlarını gösterir; başkasınınki kapatılamaz', async () => {
    const owner = await register('Desktop');
    const second = (await refresh(owner.refreshToken).expect(200)).body.data as SessionTokens;
    // İkinci cihaz: aynı hesaba şifresiz ikinci oturum açmanın yolu yok —
    // doğrudan SQL'le ikinci bir satır açmak yerine yükseltme yolunu
    // kullanırız (eski token → yeni oturum).
    const legacy = tokens.sign({ sub: owner.playerId }, 3600);
    const phone = (
      await request(server())
        .post('/api/v1/auth/session')
        .set('Authorization', `Bearer ${legacy}`)
        .set('User-Agent', 'Phone')
        .expect(200)
    ).body.data as SessionTokens;

    const list = (
      await request(server()).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${second.token}`).expect(200)
    ).body.data as AuthSessionInfo[];
    expect(list).toHaveLength(2);
    expect(list.filter((item) => item.current)).toHaveLength(1);
    expect(list.find((item) => item.current)!.userAgent).toBe('Desktop');
    const phoneSession = list.find((item) => item.userAgent === 'Phone')!;
    expect(phoneSession).toBeDefined();

    // Davetsiz misafir sahibin telefon oturumunu kapatamaz (IDOR).
    const intruder = await register();
    const idor = await request(server())
      .delete(`/api/v1/auth/sessions/${phoneSession.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(404);
    expect(idor.body.error.code).toBe(ErrorCode.SessionNotFound);
    await me(phone.token, owner.playerId).expect(200);

    // Sahip kapatır → telefon token'ı ölür, masaüstü yaşar.
    await request(server())
      .delete(`/api/v1/auth/sessions/${phoneSession.id}`)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200);
    await me(phone.token, owner.playerId).expect(401);
    await me(second.token, owner.playerId).expect(200);
    // Var olmayan oturum da AYNI 404.
    await request(server())
      .delete(`/api/v1/auth/sessions/${randomUUID()}`)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(404);
  });

  it('eski (sid\'siz) token kabul edilir ve yükseltilir; oturumlu token yükseltilemez', async () => {
    const session = await register();
    const legacy = tokens.sign({ sub: session.playerId }, 3600);
    await me(legacy, session.playerId).expect(200);

    const denied = await request(server())
      .post('/api/v1/auth/session')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(409);
    expect(denied.body.error.code).toBe(ErrorCode.SessionUpgradeNotAllowed);

    const upgraded = (
      await request(server()).post('/api/v1/auth/session').set('Authorization', `Bearer ${legacy}`).expect(200)
    ).body.data as SessionTokens;
    await me(upgraded.token, session.playerId).expect(200);
    await refresh(upgraded.refreshToken).expect(200);
  });

  it('tüm cihazlardan çıkış eski token\'ları da öldürür; sonra açılan oturum çalışır', async () => {
    const session = await register();
    const legacy = tokens.sign({ sub: session.playerId }, 3600);
    // `iat` saniye hassasiyetindedir — kesimle aynı saniyede basılmış eski
    // token da reddedilir; yine de testi saat sınırına bağlamamak için bekle.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await request(server()).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${session.token}`).expect(200);

    await me(session.token, session.playerId).expect(401);
    await me(legacy, session.playerId).expect(401);
    await refresh(session.refreshToken).expect(401);

    // Hesap kaybolmadı: kesimden SONRA açılan oturum (giriş yolunun
    // kullandığı `issue`) çalışır — kesim yeni oturumları etkilemez.
    const fresh = await app.get(AuthSessionUseCase).issue(session.playerId, 'Yeni');
    await me(fresh.token, session.playerId).expect(200);
  });

  it('şifre sıfırlama tüm oturumları kapatır (aynı transaction)', async () => {
    const outbox = app.get(EMAIL_SENDER);
    if (!(outbox instanceof OutboxEmailSender)) throw new Error('OutboxEmailSender bekleniyordu.');
    const session = await register();
    const email = `${uniqueUsername('oturum')}@ornek.com`;
    await request(server())
      .post('/api/v1/auth/credentials')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ email, password: 'eski-sifre-123' })
      .expect(201);
    await request(server()).post('/api/v1/auth/password-reset/request').send({ email }).expect(202);
    const mail = [...outbox.outbox].reverse().find((item) => item.to === email);
    const token = decodeURIComponent(/reset\?token=([^\s]+)/.exec(mail?.text ?? '')?.[1] ?? '');
    expect(token).not.toBe('');
    await request(server())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'yeni-sifre-456' })
      .expect(200);

    await me(session.token, session.playerId).expect(401);
    await refresh(session.refreshToken).expect(401);
    const reasons = await pool.query<{ revoke_reason: string }>(
      'SELECT revoke_reason FROM auth_sessions WHERE player_id = $1',
      [session.playerId],
    );
    expect(reasons.rows.map((row) => row.revoke_reason)).toEqual(['password_reset']);

    // Yeni şifreyle giriş yeni bir oturum açar.
    const login = await request(server())
      .post('/api/v1/auth/login/password')
      .send({ email, password: 'yeni-sifre-456' })
      .expect(200);
    await me(login.body.data.token as string, session.playerId).expect(200);
  });

  it('oturum sınırı aşılınca EN ESKİ oturum kapanır', async () => {
    const session = await register();
    const legacy = tokens.sign({ sub: session.playerId }, 3600);
    const opened: SessionTokens[] = [session];
    for (let index = 1; index <= settings.maxActiveSessionsPerPlayer; index += 1) {
      const upgraded = await request(server())
        .post('/api/v1/auth/session')
        .set('Authorization', `Bearer ${legacy}`)
        .expect(200);
      opened.push(upgraded.body.data as SessionTokens);
    }
    const active = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM auth_sessions WHERE player_id = $1 AND revoked_at IS NULL',
      [session.playerId],
    );
    expect(Number(active.rows[0]!.count)).toBe(settings.maxActiveSessionsPerPlayer);
    await me(session.token, session.playerId).expect(401);
    await me(opened[opened.length - 1]!.token, session.playerId).expect(200);
  });
});
