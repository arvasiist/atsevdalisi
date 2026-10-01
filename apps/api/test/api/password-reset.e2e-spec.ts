import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL_SENDER } from '../../src/application/ports/email-sender';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { OutboxEmailSender } from '../../src/infrastructure/email/outbox-email-sender';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, uniqueUsername } from './test-helpers';

/**
 * ŞİFRE SIFIRLAMA (30.09.2026, migration 0047).
 *
 * **KANITLANAN:**
 *  1. Uçtan uca: istek → e-postadaki bağlantı → yeni şifre → yeni şifreyle
 *     giriş; eski şifre artık geçmez.
 *  2. Kayıtlı olmayan e-posta AYNI 202 yanıtı alır ve e-posta gitmez
 *     (enumerasyon yok).
 *  3. Bağlantı tek kullanımlıktır, süresi dolunca geçmez, veritabanında
 *     yalnızca ÖZETİ vardır.
 *  4. Kısa şifre 400 döner ve bağlantıyı TÜKETMEZ.
 *  5. `minIntervalSeconds` içinde ikinci e-posta gönderilmez.
 *  6. Başarılı sıfırlama oyuncunun diğer bekleyen bağlantılarını geçersiz kılar.
 *
 * Testte `RESEND_API_KEY` yoktur → `OutboxEmailSender`; e-posta giden
 * kutusundan okunur.
 */
describe('Şifre sıfırlama (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let outbox: OutboxEmailSender;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    const sender = app.get(EMAIL_SENDER);
    if (!(sender instanceof OutboxEmailSender)) {
      throw new Error('Test ortamında OutboxEmailSender bekleniyordu (RESEND_API_KEY tanımlı olmamalı).');
    }
    outbox = sender;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    outbox.outbox.length = 0;
  });

  const OLD_PASSWORD = 'eski-sifre-123';
  const NEW_PASSWORD = 'yeni-sifre-456';

  async function registeredAccount(): Promise<{ email: string; playerId: string }> {
    const guest = await registerTestPlayerWithStarterHorse(app, 'Sıfırlayan');
    const email = `${uniqueUsername('sifirla')}@ornek.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/credentials')
      .set('Authorization', guest.authHeader)
      .send({ email, password: OLD_PASSWORD })
      .expect(201);
    return { email, playerId: guest.playerId };
  }

  function requestReset(email: unknown) {
    return request(app.getHttpServer()).post('/api/v1/auth/password-reset/request').send({ email });
  }

  function confirm(token: string, password: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/password-reset/confirm').send({ token, password });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/login/password').send({ email, password });
  }

  function tokenFromLastEmail(to: string): string {
    const mail = [...outbox.outbox].reverse().find((item) => item.to === to);
    expect(mail).toBeDefined();
    const match = /reset\?token=([^\s]+)/.exec(mail?.text ?? '');
    expect(match).not.toBeNull();
    return decodeURIComponent(match?.[1] ?? '');
  }

  it('uçtan uca: e-postadaki bağlantıyla yeni şifre belirlenir; eski şifre artık geçmez', async () => {
    const { email, playerId } = await registeredAccount();

    const accepted = await requestReset(email.toUpperCase()).expect(202);
    expect(accepted.body.data).toEqual({ accepted: true });
    const token = tokenFromLastEmail(email);

    await confirm(token, NEW_PASSWORD).expect(200);

    const session = await login(email, NEW_PASSWORD).expect(200);
    expect(session.body.data.player.id).toBe(playerId);
    await login(email, OLD_PASSWORD).expect(401);
  });

  it('kayıtlı olmayan e-posta AYNI 202 yanıtını alır ve e-posta gitmez', async () => {
    const response = await requestReset(`${uniqueUsername('yok')}@ornek.com`).expect(202);
    expect(response.body.data).toEqual({ accepted: true });
    expect(outbox.outbox).toHaveLength(0);
  });

  it('bağlantı tek kullanımlıktır ve veritabanında yalnızca ÖZETİ saklanır', async () => {
    const { email, playerId } = await registeredAccount();
    await requestReset(email).expect(202);
    const token = tokenFromLastEmail(email);

    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM password_reset_tokens WHERE player_id = $1',
      [playerId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).not.toBe(token);
    expect(stored.rows[0].token_hash).not.toContain(token);

    await confirm(token, NEW_PASSWORD).expect(200);
    const reused = await confirm(token, 'baska-sifre-789').expect(400);
    expect(reused.body.error.code).toBe('INVALID_RESET_TOKEN');
    await login(email, NEW_PASSWORD).expect(200);
  });

  it('süresi dolmuş bağlantı geçmez; uydurma bağlantı da aynı hatayı alır', async () => {
    const { email, playerId } = await registeredAccount();
    await requestReset(email).expect(202);
    const token = tokenFromLastEmail(email);
    await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE player_id = $1", [
      playerId,
    ]);

    const expired = await confirm(token, NEW_PASSWORD).expect(400);
    const forged = await confirm('uydurma-bir-baglanti', NEW_PASSWORD).expect(400);
    expect(expired.body.error.code).toBe('INVALID_RESET_TOKEN');
    expect(forged.body.error.code).toBe('INVALID_RESET_TOKEN');
    await login(email, OLD_PASSWORD).expect(200);
  });

  it('kısa yeni şifre 400 döner ve bağlantıyı TÜKETMEZ', async () => {
    const { email } = await registeredAccount();
    await requestReset(email).expect(202);
    const token = tokenFromLastEmail(email);

    await confirm(token, 'kisa').expect(400);
    await confirm(token, NEW_PASSWORD).expect(200);
  });

  it('kısa aralıkta ikinci istek e-posta GÖNDERMEZ (yanıt yine 202)', async () => {
    const { email } = await registeredAccount();
    await requestReset(email).expect(202);
    await requestReset(email).expect(202);
    expect(outbox.outbox.filter((mail) => mail.to === email)).toHaveLength(1);
  });

  it('başarılı sıfırlama oyuncunun DİĞER bekleyen bağlantılarını geçersiz kılar', async () => {
    const { email, playerId } = await registeredAccount();
    await requestReset(email).expect(202);
    const first = tokenFromLastEmail(email);
    // Aralık kuralını geçmek için ilk isteği geçmişe al.
    await pool.query("UPDATE password_reset_tokens SET created_at = now() - interval '1 hour' WHERE player_id = $1", [
      playerId,
    ]);
    await requestReset(email).expect(202);
    const second = tokenFromLastEmail(email);
    expect(second).not.toBe(first);

    await confirm(second, NEW_PASSWORD).expect(200);
    await confirm(first, 'baska-sifre-789').expect(400);
  });
});
