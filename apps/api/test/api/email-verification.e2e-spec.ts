import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@at-sevdalisi/shared-types';
import { EMAIL_SENDER } from '../../src/application/ports/email-sender';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { OutboxEmailSender } from '../../src/infrastructure/email/outbox-email-sender';
import { bootstrapTestApp, registerTestPlayer, uniqueUsername, type RegisteredTestPlayer } from './test-helpers';

/**
 * E-POSTA DOĞRULAMA (02.10.2026, migration 0058).
 *
 * Kanıtlanan şeyler: kayıt doğrulama e-postası yollar; bağlantı tek
 * kullanımlıktır ve DB'de yalnızca özeti vardır; süresi dolmuş/uydurma
 * bağlantı AYNI 400; e-posta değişirse eski bağlantı geçmez; misafir 409;
 * doğrulanmış hesap 409; kısa aralıkta ikinci istek e-posta yollamaz;
 * `GET /auth/credentials` durumu taşır.
 */
describe('E-posta doğrulama (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let outbox: OutboxEmailSender;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    const sender = app.get(EMAIL_SENDER);
    if (!(sender instanceof OutboxEmailSender)) throw new Error('OutboxEmailSender bekleniyordu.');
    outbox = sender;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    outbox.outbox.length = 0;
  });

  const server = () => app.getHttpServer();

  async function registered(): Promise<{ player: RegisteredTestPlayer; email: string }> {
    const player = await registerTestPlayer(app, 'Doğrulayan');
    const email = `${uniqueUsername('dogrula')}@ornek.com`;
    await request(server())
      .post('/api/v1/auth/credentials')
      .set('Authorization', player.authHeader)
      .send({ email, password: 'sifre-12345' })
      .expect(201);
    return { player, email };
  }

  function verificationTokens(to: string): string[] {
    return outbox.outbox
      .filter((mail) => mail.to === to && /doğrula/.test(mail.subject))
      .map((mail) => decodeURIComponent(/verify\?token=([^\s]+)/.exec(mail.text)?.[1] ?? ''));
  }

  const status = (player: RegisteredTestPlayer) =>
    request(server()).get('/api/v1/auth/credentials').set('Authorization', player.authHeader).expect(200);
  const verify = (token: unknown) => request(server()).post('/api/v1/auth/email/verify').send({ token });
  const requestLink = (player: RegisteredTestPlayer) =>
    request(server()).post('/api/v1/auth/email/verification').set('Authorization', player.authHeader);

  it('kayıt doğrulama e-postası yollar; bağlantı e-postayı doğrular ve tek kullanımlıktır', async () => {
    const { player, email } = await registered();
    expect((await status(player)).body.data.emailVerified).toBe(false);

    const [token] = verificationTokens(email);
    expect(token).toBeTruthy();
    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM email_verification_tokens WHERE player_id = $1',
      [player.playerId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash).not.toContain(token!);

    await verify(token).expect(200);
    expect((await status(player)).body.data.emailVerified).toBe(true);

    const again = await verify(token).expect(400);
    expect(again.body.error.code).toBe(ErrorCode.InvalidVerificationToken);

    const already = await requestLink(player).expect(409);
    expect(already.body.error.code).toBe(ErrorCode.EmailAlreadyVerified);
  });

  it('uydurma / boş / süresi dolmuş bağlantı AYNI 400', async () => {
    for (const bad of [undefined, '', 'uydurma', 7, 'x'.repeat(5000)]) {
      const response = await verify(bad).expect(400);
      expect(response.body.error.code).toBe(ErrorCode.InvalidVerificationToken);
    }
    const { player, email } = await registered();
    const [token] = verificationTokens(email);
    await pool.query("UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute' WHERE player_id = $1", [
      player.playerId,
    ]);
    await verify(token).expect(400);
    expect((await status(player)).body.data.emailVerified).toBe(false);
  });

  it('e-posta değiştiyse eski bağlantı yeni adresi doğrulayamaz', async () => {
    const { player, email } = await registered();
    const [token] = verificationTokens(email);
    await pool.query('UPDATE player_credentials SET email = $2 WHERE player_id = $1', [
      player.playerId,
      `${uniqueUsername('yeni')}@ornek.com`,
    ]);
    await verify(token).expect(400);
    expect((await status(player)).body.data.emailVerified).toBe(false);
  });

  it('yeniden gönderme: kısa aralıkta e-posta gitmez; aralık geçince yeni bağlantı gelir', async () => {
    const { player, email } = await registered();
    const throttled = await requestLink(player).expect(202);
    expect(throttled.body.data).toEqual({ sent: false });
    expect(verificationTokens(email)).toHaveLength(1);

    await pool.query(
      "UPDATE email_verification_tokens SET created_at = now() - interval '1 hour' WHERE player_id = $1",
      [player.playerId],
    );
    const sent = await requestLink(player).expect(202);
    expect(sent.body.data).toEqual({ sent: true });
    const tokens = verificationTokens(email);
    expect(tokens).toHaveLength(2);

    // Herhangi biri doğrular; ardından ikisi de tükenir.
    await verify(tokens[1]).expect(200);
    await verify(tokens[0]).expect(400);
  });

  it('misafir 409 NO_ACCOUNT_EMAIL; token yoksa 401', async () => {
    const guest = await registerTestPlayer(app, 'Misafir');
    const response = await requestLink(guest).expect(409);
    expect(response.body.error.code).toBe(ErrorCode.NoAccountEmail);
    expect((await status(guest)).body.data.emailVerified).toBe(false);
    await request(server()).post('/api/v1/auth/email/verification').expect(401);
  });
});
