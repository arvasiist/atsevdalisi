import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadReferralConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, recordSharedFinishedRace, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * 16.10.2026 — sosyal brief §7/§11: davet kodu, bağlama, ödül koşulları,
 * tekrar/eşzamanlılık, tavan, arkadaşlık istisnası.
 */
describe('Arkadaş daveti + davet ödülü (e2e)', () => {
  const config = loadReferralConfig();
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const overview = async (player: RegisteredTestPlayer) =>
    (await http().get('/api/v1/referrals').set('Authorization', player.authHeader).expect(200)).body.data;
  const attach = (player: RegisteredTestPlayer, code: string) =>
    http().post('/api/v1/referrals/attach').set('Authorization', player.authHeader).send({ code });
  const claim = async (player: RegisteredTestPlayer) =>
    (await http().post('/api/v1/referrals/claim').set('Authorization', player.authHeader).expect(200)).body.data;
  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  /** Davetliyi ödül koşullarına getirir (SQL fikstürü: e-posta doğrulandı + bitmiş yarışlar). */
  async function qualify(invitee: RegisteredTestPlayer, partner: RegisteredTestPlayer): Promise<void> {
    await pool.query(
      `INSERT INTO player_credentials (player_id, email, password_hash, email_verified_at)
       VALUES ($1, $2, 'test-hash', now())`,
      [invitee.playerId, `${invitee.playerId}@ornek.test`],
    );
    for (let index = 0; index < config.conditions.minFinishedRaces; index += 1) {
      await recordSharedFinishedRace(app, [invitee, partner]);
    }
  }

  it('kod sunucuda üretilir, sabittir; davetli bağlanır, ikinci bağlama ve kendi kodu reddedilir', async () => {
    const inviter = await registerTestPlayer(app, 'Davet Eden');
    const invitee = await registerTestPlayer(app, 'Davetli');
    const first = await overview(inviter);
    expect(first.code).toMatch(/^[A-Z2-9]{6,16}$/);
    expect((await overview(inviter)).code).toBe(first.code);

    expect((await overview(invitee)).canAttach).toBe(true);
    const attached = await attach(invitee, first.code.toLowerCase()).expect(200);
    expect(attached.body.data.inviter.playerId).toBe(inviter.playerId);
    expect((await overview(invitee)).invitedBy).toMatchObject({ playerId: inviter.playerId, rewarded: false });
    expect((await overview(invitee)).canAttach).toBe(false);

    const again = await attach(invitee, first.code).expect(409);
    expect(again.body.error.code).toBe('REFERRAL_ALREADY_ATTACHED');
    const self = await attach(inviter, first.code).expect(400);
    expect(self.body.error.code).toBe('REFERRAL_SELF');
    expect((await attach(invitee, 'YOKBOYLE1').expect(404)).body.error.code).toBe('REFERRAL_CODE_NOT_FOUND');
  });

  it('eski hesap davet kodu bağlayamaz; karşılıklı davet reddedilir', async () => {
    const inviter = await registerTestPlayer(app, 'Pencere Eden');
    const old = await registerTestPlayer(app, 'Eski Hesap');
    await pool.query("UPDATE players SET created_at = now() - make_interval(hours => $2) WHERE id = $1", [
      old.playerId,
      config.attachWindowHours + 1,
    ]);
    const code = (await overview(inviter)).code;
    expect((await attach(old, code).expect(409)).body.error.code).toBe('REFERRAL_ATTACH_WINDOW_CLOSED');

    const a = await registerTestPlayer(app, 'Karşılıklı A');
    const b = await registerTestPlayer(app, 'Karşılıklı B');
    await attach(b, (await overview(a)).code).expect(200);
    await attach(a, (await overview(b)).code).expect(400);
  });

  it('ödül yalnızca koşullar sağlanınca, iki tarafa bir kez; defter + bildirim; ikinci talep sıfır', async () => {
    const inviter = await registerTestPlayer(app, 'Ödül Eden');
    const invitee = await registerTestPlayer(app, 'Ödül Davetli');
    const partner = await registerTestPlayer(app, 'Ödül Ortak');
    await attach(invitee, (await overview(inviter)).code).expect(200);

    expect(await claim(inviter)).toMatchObject({ claimed: 0, amount: 0 });
    expect((await overview(inviter)).referrals[0]).toMatchObject({ status: 'pending', emailVerified: false, finishedRaces: 0 });

    await qualify(invitee, partner);
    const view = await overview(inviter);
    expect(view.claimableCount).toBe(1);
    expect(view.referrals[0].status).toBe('ready');

    const inviterBefore = await money(inviter.playerId);
    const inviteeBefore = await money(invitee.playerId);
    const result = await claim(inviter);
    expect(result).toMatchObject({ claimed: 1, amount: config.rewards.inviter });
    expect(result.balanceAfter).toBe(inviterBefore + config.rewards.inviter);
    expect(await money(inviter.playerId)).toBe(inviterBefore + config.rewards.inviter);
    expect(await money(invitee.playerId)).toBe(inviteeBefore + config.rewards.invitee);

    const ledger = await pool.query<{ player_id: string; type: string; amount: string }>(
      "SELECT player_id, type, amount FROM economy_transactions WHERE type IN ('referral_reward', 'referral_welcome_reward') AND player_id = ANY($1::uuid[])",
      [[inviter.playerId, invitee.playerId]],
    );
    expect(ledger.rows).toHaveLength(2);
    const notes = await pool.query(
      "SELECT player_id FROM notifications WHERE type = 'referral_reward' AND player_id = ANY($1::uuid[])",
      [[inviter.playerId, invitee.playerId]],
    );
    expect(notes.rowCount).toBe(2);

    expect(await claim(inviter)).toMatchObject({ claimed: 0, amount: 0 });
    expect(await money(inviter.playerId)).toBe(inviterBefore + config.rewards.inviter);
    expect((await overview(invitee)).invitedBy.rewarded).toBe(true);
  });

  it('eşzamanlı iki talep aynı ödülü iki kez ödemez', async () => {
    const inviter = await registerTestPlayer(app, 'Eşzamanlı Eden');
    const invitee = await registerTestPlayer(app, 'Eşzamanlı Davetli');
    const partner = await registerTestPlayer(app, 'Eşzamanlı Ortak');
    await attach(invitee, (await overview(inviter)).code).expect(200);
    await qualify(invitee, partner);
    const before = await money(inviter.playerId);
    const results = await Promise.all([
      http().post('/api/v1/referrals/claim').set('Authorization', inviter.authHeader).expect(200),
      http().post('/api/v1/referrals/claim').set('Authorization', inviter.authHeader).expect(200),
    ]);
    expect(results.map((response) => response.body.data.claimed).sort()).toEqual([0, 1]);
    expect(await money(inviter.playerId)).toBe(before + config.rewards.inviter);
  });

  it('günlük tavan: koşulu sağlayan fazla davetliler "capped" kalır', async () => {
    const inviter = await registerTestPlayer(app, 'Tavan Eden');
    const partner = await registerTestPlayer(app, 'Tavan Ortak');
    const code = (await overview(inviter)).code;
    const count = config.maxRewardedPerInviterPerDay + 1;
    for (let index = 0; index < count; index += 1) {
      const invitee = await registerTestPlayer(app, `Tavan Davetli ${index}`);
      await attach(invitee, code).expect(200);
      await qualify(invitee, partner);
    }
    const result = await claim(inviter);
    expect(result).toMatchObject({ claimed: config.maxRewardedPerInviterPerDay, capped: 1 });
    expect((await overview(inviter)).referrals.filter((row: { status: string }) => row.status === 'capped')).toHaveLength(1);
  });

  it('davet bağı arkadaşlık kapısını açar (birlikte yarışmadan istek + kabul)', async () => {
    const inviter = await registerTestPlayer(app, 'Kapı Eden');
    const invitee = await registerTestPlayer(app, 'Kapı Davetli');
    const stranger = await registerTestPlayer(app, 'Kapı Yabancı');
    await attach(invitee, (await overview(inviter)).code).expect(200);

    const request1 = await http()
      .post(`/api/v1/players/${invitee.playerId}/friend-requests`)
      .set('Authorization', invitee.authHeader)
      .send({ addresseeId: inviter.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${inviter.playerId}/friend-requests/${request1.body.data.requestId as string}/respond`)
      .set('Authorization', inviter.authHeader)
      .send({ action: 'accept' })
      .expect(200);

    const refused = await http()
      .post(`/api/v1/players/${invitee.playerId}/friend-requests`)
      .set('Authorization', invitee.authHeader)
      .send({ addresseeId: stranger.playerId })
      .expect(409);
    expect(refused.body.error.code).toBe('FRIENDSHIP_REQUIRES_SHARED_RACE');
  });

  it('engelli çift bağlanamaz; engel sonradan konursa ödül ödenmez', async () => {
    const inviter = await registerTestPlayer(app, 'Engel Eden');
    const invitee = await registerTestPlayer(app, 'Engel Davetli');
    const partner = await registerTestPlayer(app, 'Engel Ortak');
    const code = (await overview(inviter)).code;
    await http()
      .post(`/api/v1/players/${inviter.playerId}/blocks`)
      .set('Authorization', inviter.authHeader)
      .send({ blockedId: invitee.playerId })
      .expect(201);
    expect((await attach(invitee, code).expect(403)).body.error.code).toBe('PLAYER_BLOCKED');

    await http().delete(`/api/v1/players/${inviter.playerId}/blocks/${invitee.playerId}`).set('Authorization', inviter.authHeader).expect(200);
    await attach(invitee, code).expect(200);
    await qualify(invitee, partner);
    await http()
      .post(`/api/v1/players/${invitee.playerId}/blocks`)
      .set('Authorization', invitee.authHeader)
      .send({ blockedId: inviter.playerId })
      .expect(201);
    expect(await claim(inviter)).toMatchObject({ claimed: 0 });
  });
});
