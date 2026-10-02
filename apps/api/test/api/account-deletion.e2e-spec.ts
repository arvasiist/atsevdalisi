import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import { ErrorCode, type AccountDeletionCheck } from '@at-sevdalisi/shared-types';
import { DELETED_DISPLAY_NAME, deletedUsername } from '../../src/domain/account/account-deletion';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  uniqueUsername,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * HESAP SİLME (02.10.2026, migration 0059).
 *
 * Kanıtlanan şeyler:
 * - Onay (kullanıcı adı) ve e-postalı hesapta şifre şarttır; yanlış şifre
 *   403'tür (401 DEĞİL — istemci 401'de oturumu siler).
 * - Silme sonrası: token ve refresh ANINDA geçersiz, e-postayla giriş yok,
 *   kişisel veri (e-posta, şifre, mesaj, arkadaşlık, bildirim) silinmiş,
 *   oyuncu anonim, eski kullanıcı adı serbest, profil 404 — ama DEFTER
 *   satırları DEĞİŞMEDİ (değiştirilemez defter; satır silinemez).
 * - Parası emanette olan hesap silinemez (lider müzayede teklifi) ve
 *   reddedilen silme HİÇBİR ŞEY yazmaz.
 * - Tek başına lider kulübü kapanır; üyesi olan lider engellenir.
 */
describe('Hesap silme (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const check = (player: RegisteredTestPlayer) =>
    request(server()).get('/api/v1/account/deletion').set('Authorization', player.authHeader);
  const remove = (player: RegisteredTestPlayer, body: Record<string, unknown>) =>
    request(server()).post('/api/v1/account/delete').set('Authorization', player.authHeader).send(body);

  async function ledgerCount(playerId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM economy_transactions WHERE player_id = $1',
      [playerId],
    );
    return Number(result.rows[0]!.count);
  }

  async function playerRow(playerId: string) {
    const result = await pool.query<{ username: string; display_name: string; deleted_at: Date | null }>(
      'SELECT username, display_name, deleted_at FROM players WHERE id = $1',
      [playerId],
    );
    return result.rows[0]!;
  }

  it('misafir: engel yok, şifre istenmez; yanlış onay 400; doğru onayla silinir ve token ölür', async () => {
    const guest = await registerTestPlayer(app, 'Silinecek Misafir');
    const status = (await check(guest).expect(200)).body.data as AccountDeletionCheck;
    expect(status).toEqual({ blockers: [], requiresPassword: false });

    const mismatch = await remove(guest, { confirmUsername: 'baskasi' }).expect(400);
    expect(mismatch.body.error.code).toBe(ErrorCode.DeletionConfirmationMismatch);
    expect((await playerRow(guest.playerId)).deleted_at).toBeNull();

    await remove(guest, { confirmUsername: ` ${guest.username.toUpperCase()} ` }).expect(200);
    const after = await request(server())
      .get(`/api/v1/players/${guest.playerId}`)
      .set('Authorization', guest.authHeader)
      .expect(401);
    expect(after.body.error.code).toBe(ErrorCode.Unauthorized);
  });

  it('kayıtlı hesap: şifre şart (yanlışsa 403); silinince kişisel veri gider, defter kalır', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Kayıtlı Silinen');
    const friend = await registerTestPlayer(app, 'Arkadaş');
    const email = `${uniqueUsername('sil')}@ornek.com`;
    await request(server())
      .post('/api/v1/auth/credentials')
      .set('Authorization', owner.authHeader)
      .send({ email, password: 'sifre-12345' })
      .expect(201);
    const login = await request(server())
      .post('/api/v1/auth/login/password')
      .send({ email, password: 'sifre-12345' })
      .expect(200);
    const refreshToken = login.body.data.refreshToken as string;

    const [low, high] = [owner.playerId, friend.playerId].sort();
    await pool.query(
      "INSERT INTO friendships (player_low_id, player_high_id, requested_by_id, status) VALUES ($1, $2, $1, 'accepted')",
      [low, high],
    );
    await pool.query('INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1, $2, $3), ($2, $1, $3)', [
      owner.playerId,
      friend.playerId,
      'merhaba',
    ]);
    // Defterde en az bir satır olsun (sahte yatırma — test ortamında açık).
    await request(server())
      .post(`/api/v1/players/${owner.playerId}/wallet/deposit`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: loadEconomyConfig().mockDeposit.minAmount })
      .expect(200);
    const ledgerBefore = await ledgerCount(owner.playerId);
    expect(ledgerBefore).toBeGreaterThan(0);

    expect(((await check(owner).expect(200)).body.data as AccountDeletionCheck).requiresPassword).toBe(true);
    const wrong = await remove(owner, { confirmUsername: owner.username, password: 'yanlis-sifre' }).expect(403);
    expect(wrong.body.error.code).toBe(ErrorCode.DeletionPasswordInvalid);
    await remove(owner, { confirmUsername: owner.username }).expect(403);

    await remove(owner, { confirmUsername: owner.username, password: 'sifre-12345' }).expect(200);

    // Oturumlar ve giriş yolları kapandı.
    await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    await request(server()).post('/api/v1/auth/login/password').send({ email, password: 'sifre-12345' }).expect(401);

    // Anonim satır; eski kullanıcı adı serbest, profil 404.
    const row = await playerRow(owner.playerId);
    expect(row.username).toBe(deletedUsername(owner.playerId));
    expect(row.display_name).toBe(DELETED_DISPLAY_NAME);
    expect(row.deleted_at).toBeInstanceOf(Date);
    await request(server()).get(`/api/v1/players/profile/${owner.username}`).expect(404);
    await request(server())
      .post('/api/v1/players')
      .send({ username: owner.username, displayName: 'Yeni Sahip' })
      .expect(201);

    // Kişisel veri gitti.
    for (const [sql, params] of [
      ['SELECT 1 FROM player_credentials WHERE player_id = $1', [owner.playerId]],
      ['SELECT 1 FROM direct_messages WHERE sender_id = $1 OR recipient_id = $1', [owner.playerId]],
      ['SELECT 1 FROM friendships WHERE player_low_id = $1 OR player_high_id = $1', [owner.playerId]],
      ['SELECT 1 FROM notifications WHERE player_id = $1', [owner.playerId]],
      ['SELECT 1 FROM auth_sessions WHERE player_id = $1 AND (revoked_at IS NULL OR user_agent IS NOT NULL)', [owner.playerId]],
    ] as const) {
      expect((await pool.query(sql, [...params])).rows).toHaveLength(0);
    }
    // Defter DEĞİŞMEDİ.
    expect(await ledgerCount(owner.playerId)).toBe(ledgerBefore);
  });

  it('parası emanette olan hesap silinemez; reddedilen silme hiçbir şey yazmaz', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Satıcı');
    const bidder = await registerTestPlayer(app, 'Teklifçi');
    await pool.query('UPDATE players SET money = 10000 WHERE id IN ($1, $2)', [seller.playerId, bidder.playerId]);
    const listing = await request(server())
      .post('/api/v1/market/listings')
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: 500, listingType: 'auction', expiresInHours: 24 })
      .expect(201);
    const listingId = listing.body.data.id as string;
    await request(server())
      .post(`/api/v1/market/listings/${listingId}/bids`)
      .set('Authorization', bidder.authHeader)
      .send({ amount: 500 })
      .expect(200);

    const bidderCheck = (await check(bidder).expect(200)).body.data as AccountDeletionCheck;
    expect(bidderCheck.blockers.map((b) => b.code)).toEqual(['auction_leading_bid']);
    const sellerCheck = (await check(seller).expect(200)).body.data as AccountDeletionCheck;
    expect(sellerCheck.blockers.map((b) => b.code)).toEqual(['auction_with_bids']);

    const blocked = await remove(bidder, { confirmUsername: bidder.username }).expect(409);
    expect(blocked.body.error.code).toBe(ErrorCode.AccountDeletionBlocked);
    expect(blocked.body.error.message).toMatch(/müzayede/);
    const row = await playerRow(bidder.playerId);
    expect(row.deleted_at).toBeNull();
    expect(row.username).toBe(bidder.username);
    await request(server()).get(`/api/v1/players/${bidder.playerId}`).set('Authorization', bidder.authHeader).expect(200);
  });

  it('teklifsiz ilan iptal edilir; tek başına liderin kulübü kapanır; üyesi olan lider engellenir', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Tek Lider');
    const listing = await request(server())
      .post('/api/v1/market/listings')
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: 900 })
      .expect(201);
    const soloClub = randomUUID();
    await pool.query(
      "INSERT INTO clubs (id, leader_id, name, name_key) VALUES ($1, $2, $3, $3)",
      [soloClub, seller.playerId, uniqueUsername('kulup')],
    );
    await pool.query("INSERT INTO club_members (player_id, club_id, role) VALUES ($1, $2, 'leader')", [
      seller.playerId,
      soloClub,
    ]);

    await remove(seller, { confirmUsername: seller.username }).expect(200);
    const status = await pool.query<{ status: string }>('SELECT status FROM market_listings WHERE id = $1', [
      listing.body.data.id,
    ]);
    expect(status.rows[0]!.status).toBe('cancelled');
    expect((await pool.query('SELECT 1 FROM clubs WHERE id = $1', [soloClub])).rows).toHaveLength(0);

    // Üyesi olan lider.
    const leader = await registerTestPlayer(app, 'Kalabalık Lider');
    const member = await registerTestPlayer(app, 'Üye');
    const club = randomUUID();
    await pool.query("INSERT INTO clubs (id, leader_id, name, name_key) VALUES ($1, $2, $3, $3)", [
      club,
      leader.playerId,
      uniqueUsername('kulup'),
    ]);
    await pool.query(
      "INSERT INTO club_members (player_id, club_id, role) VALUES ($1, $3, 'leader'), ($2, $3, 'member')",
      [leader.playerId, member.playerId, club],
    );
    const blocked = await remove(leader, { confirmUsername: leader.username }).expect(409);
    expect(blocked.body.error.message).toMatch(/liderliği devret/);
  });

  it('silinmiş oyuncu sıralamada görünmez', async () => {
    const guest = await registerTestPlayer(app, 'Sıralama');
    await remove(guest, { confirmUsername: guest.username }).expect(200);
    const board = await request(server()).get('/api/v1/leaderboard').expect(200);
    expect(JSON.stringify(board.body.data)).not.toContain(guest.playerId);
  });
});
