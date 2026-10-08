import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAchievementsConfig, loadGiftConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  recordSharedFinishedRace,
  registerTestPlayer,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * DOSTLUK HEDİYESİ + ARKADAŞ BAŞARIMI (08.10.2026, migration 0074).
 * Kanıtlananlar:
 *   (1) "Hepsine gönder" uygun her arkadaşa bir hediye yazar, gönderenden para
 *       DÜŞMEZ; aynı gün ikinci basış hiçbir şey yazmaz; engelli arkadaş atlanır.
 *   (2) Toplama PARA YOLUDUR: bakiye + TEK `friend_gift_collect` defter satırı
 *       (referansı `collect_id`), ikinci toplama sıfır.
 *   (3) Günlük toplama sınırı kilit altında; fazlası yarına kalır; süresi
 *       geçmiş hediye toplanmaz.
 *   (4) Günlük görev "dostluk hediyesi gönder" ilerler ve ödenir.
 *   (5) "Her 5 arkadaşa 100 çip" başarımı ödenir (defter satırıyla).
 */
describe('Dostluk hediyesi (e2e)', () => {
  const friendGift = loadGiftConfig().friendGift;
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

  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    await recordSharedFinishedRace(app, [a, b]);
    const created = await http()
      .post(`/api/v1/players/${a.playerId}/friend-requests`)
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${b.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  const board = async (player: RegisteredTestPlayer) =>
    (await http().get('/api/v1/friend-gifts').set('Authorization', player.authHeader).expect(200)).body.data;

  const sendAll = async (player: RegisteredTestPlayer) =>
    (await http().post('/api/v1/friend-gifts/send-all').set('Authorization', player.authHeader).expect(200)).body.data;

  const collect = async (player: RegisteredTestPlayer) =>
    (await http().post('/api/v1/friend-gifts/collect').set('Authorization', player.authHeader).expect(200)).body.data;

  it('hepsine gönder: gönderen ödemez, günde bir kez, engelli arkadaş atlanır', async () => {
    const sender = await registerTestPlayer(app, 'Cömert');
    const [b, c, blocked] = await Promise.all([
      registerTestPlayer(app, 'Dost B'),
      registerTestPlayer(app, 'Dost C'),
      registerTestPlayer(app, 'Küs D'),
    ]);
    await makeFriends(sender, b);
    await makeFriends(sender, c);
    await makeFriends(sender, blocked);
    await http()
      .post(`/api/v1/players/${blocked.playerId}/blocks`)
      .set('Authorization', blocked.authHeader)
      .send({ blockedId: sender.playerId })
      .expect((response) => expect([200, 201]).toContain(response.status));

    const before = await money(sender.playerId);
    expect((await board(sender)).friendCount).toBe(2);
    expect(await sendAll(sender)).toEqual({ sent: 2, alreadySentToday: 0 });
    expect(await sendAll(sender)).toEqual({ sent: 0, alreadySentToday: 2 });
    expect(await money(sender.playerId)).toBe(before);
    expect((await board(sender)).sentToday).toBe(2);

    const received = await board(b);
    expect(received.pendingCount).toBe(1);
    expect(received.pendingAmount).toBe(friendGift.amount);
    expect(received.pending[0].sender.playerId).toBe(sender.playerId);
    expect(typeof received.pendingAmount).toBe('number');
    expect((await board(blocked)).pendingCount).toBe(0);
  });

  it('topla: bakiye + tek defter satırı; ikinci toplama sıfır', async () => {
    const sender = await registerTestPlayer(app, 'Gönderen');
    const recipient = await registerTestPlayer(app, 'Toplayan');
    await makeFriends(sender, recipient);
    await sendAll(sender);

    const before = await money(recipient.playerId);
    const result = await collect(recipient);
    expect(result).toMatchObject({ collected: 1, amount: friendGift.amount, stillPending: 0 });
    expect(result.balanceAfter).toBe(before + friendGift.amount);
    expect(await money(recipient.playerId)).toBe(before + friendGift.amount);

    const ledger = await pool.query(
      `SELECT amount, reference_type, reference_id, balance_before, balance_after FROM economy_transactions
        WHERE player_id = $1 AND type = 'friend_gift_collect'`,
      [recipient.playerId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(friendGift.amount);
    expect(Number(ledger.rows[0].balance_after) - Number(ledger.rows[0].balance_before)).toBe(friendGift.amount);
    const explained = await pool.query('SELECT SUM(amount)::bigint AS total FROM friend_gifts WHERE collect_id = $1', [
      ledger.rows[0].reference_id,
    ]);
    expect(Number(explained.rows[0].total)).toBe(friendGift.amount);

    expect(await collect(recipient)).toMatchObject({ collected: 0, amount: 0 });
    expect(await money(recipient.playerId)).toBe(before + friendGift.amount);
  });

  it('günlük toplama sınırı: fazlası yarına kalır; süresi geçmiş hediye toplanmaz', async () => {
    const sender = await registerTestPlayer(app, 'Çok Gönderen');
    const recipient = await registerTestPlayer(app, 'Sınırlı');
    const extra = friendGift.dailyCollectLimit + 3;
    // Fikstür: aynı gönderenden farklı günlere ait (bugün yazılmış) bekleyen hediyeler.
    for (let index = 0; index < extra; index += 1) {
      await pool.query(
        `INSERT INTO friend_gifts (sender_id, recipient_id, amount, gift_day, created_at)
         VALUES ($1, $2, $3, (now() - make_interval(days => $4::int))::date, now())`,
        [sender.playerId, recipient.playerId, friendGift.amount, index + 1],
      );
    }
    await pool.query(
      `INSERT INTO friend_gifts (sender_id, recipient_id, amount, gift_day, created_at)
       VALUES ($1, $2, $3, (now() - interval '200 days')::date, now() - make_interval(days => $4::int))`,
      [sender.playerId, recipient.playerId, friendGift.amount, friendGift.expiryDays + 1],
    );
    expect((await board(recipient)).pendingCount).toBe(extra);

    const before = await money(recipient.playerId);
    const result = await collect(recipient);
    expect(result).toMatchObject({
      collected: friendGift.dailyCollectLimit,
      amount: friendGift.dailyCollectLimit * friendGift.amount,
      remainingCollectsToday: 0,
      stillPending: 3,
    });
    expect(await collect(recipient)).toMatchObject({ collected: 0, stillPending: 3 });
    expect(await money(recipient.playerId)).toBe(before + friendGift.dailyCollectLimit * friendGift.amount);
    expect((await board(recipient)).remainingCollectsToday).toBe(0);
  });

  it('günlük görev "dostluk hediyesi gönder" ilerler ve ödenir', async () => {
    const quest = loadQuestsConfig().daily.find((item) => item.metric === 'friend_gifts_sent')!;
    expect(quest).toBeDefined();
    const sender = await registerTestPlayer(app, 'Görevli');
    const friend = await registerTestPlayer(app, 'Görev Dostu');
    await makeFriends(sender, friend);
    await sendAll(sender);

    const before = await money(sender.playerId);
    await http()
      .post(`/api/v1/quests/${quest.key}/claim`)
      .set('Authorization', sender.authHeader)
      .expect(200);
    expect(await money(sender.playerId)).toBe(before + quest.rewardMoney);
  });

  it('her 5 arkadaşa 100 çip: arkadaş başarımı ödenir', async () => {
    const first = loadAchievementsConfig()
      .achievements.filter((item) => item.metric === 'friend_count')
      .sort((a, b) => a.target - b.target)[0]!;
    const social = await registerTestPlayer(app, 'Sosyal');
    const friends = await Promise.all(
      Array.from({ length: first.target }, (_, index) => registerTestPlayer(app, `Arkadaş ${index}`)),
    );
    // Hedefin bir eksiğinde ödül alınamaz.
    for (const friend of friends.slice(0, -1)) await makeFriends(social, friend);
    await http()
      .post(`/api/v1/achievements/${first.key}/claim`)
      .set('Authorization', social.authHeader)
      .expect(409);

    await makeFriends(social, friends.at(-1)!);
    const boardView = (await http().get('/api/v1/achievements').set('Authorization', social.authHeader).expect(200))
      .body.data;
    expect(boardView.achievements.find((item: { key: string }) => item.key === first.key).progress).toBe(first.target);

    const before = await money(social.playerId);
    await http()
      .post(`/api/v1/achievements/${first.key}/claim`)
      .set('Authorization', social.authHeader)
      .expect(200);
    expect(await money(social.playerId)).toBe(before + first.rewardMoney);
  });
});
