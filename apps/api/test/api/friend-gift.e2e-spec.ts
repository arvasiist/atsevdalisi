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
 *   (1) "Hepsine gönder" uygun her arkadaşa bir hediye yazar; 16.10.2026'dan
 *       beri GÖNDEREN ÖDER (tek `friend_gift_send` satırı); aynı gün ikinci
 *       basış hiçbir şey yazmaz/düşmez; engelli arkadaş atlanır. Günlük
 *       gönderim bütçesi ve bakiye kilit altında; eşzamanlı basışlar çift
 *       tahsilat yapmaz; süresi dolan ödenmiş hediye gönderene iade edilir.
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

  const ledgerRows = async (playerId: string, type: string) =>
    (
      await pool.query(
        `SELECT amount, reference_id, balance_before, balance_after FROM economy_transactions
          WHERE player_id = $1 AND type = $2 ORDER BY created_at, id`,
        [playerId, type],
      )
    ).rows;

  it('hepsine gönder: GÖNDEREN öder (tek defter satırı), günde bir kez, engelli arkadaş atlanır, kişi başı sonuç', async () => {
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
    const preview = await board(sender);
    expect(preview.friendCount).toBe(2);
    expect(preview.sendCost).toBe(friendGift.amount);
    expect(preview.remainingSendBudget).toBe(friendGift.dailySendBudget);
    expect(preview.nextRecipients.map((friend: { playerId: string }) => friend.playerId).sort()).toEqual(
      [b.playerId, c.playerId].sort(),
    );

    const first = await sendAll(sender);
    expect(first).toMatchObject({ sent: 2, alreadySentToday: 0, cost: 2 * friendGift.amount, refunded: 0 });
    expect(first.balanceAfter).toBe(before - 2 * friendGift.amount);
    expect(first.recipients.every((recipient: { status: string }) => recipient.status === 'sent')).toBe(true);
    expect(await money(sender.playerId)).toBe(before - 2 * friendGift.amount);
    const debit = await ledgerRows(sender.playerId, 'friend_gift_send');
    expect(debit).toHaveLength(1);
    expect(Number(debit[0].amount)).toBe(-2 * friendGift.amount);
    const explained = await pool.query('SELECT SUM(sender_paid)::bigint AS total FROM friend_gifts WHERE send_id = $1', [
      debit[0].reference_id,
    ]);
    expect(Number(explained.rows[0].total)).toBe(2 * friendGift.amount);

    // Aynı gün ikinci basış: hiçbir şey yazılmaz, para düşmez.
    const second = await sendAll(sender);
    expect(second).toMatchObject({ sent: 0, alreadySentToday: 2, cost: 0 });
    expect(second.recipients.every((recipient: { status: string }) => recipient.status === 'already_sent')).toBe(true);
    expect(await money(sender.playerId)).toBe(before - 2 * friendGift.amount);
    expect(await ledgerRows(sender.playerId, 'friend_gift_send')).toHaveLength(1);
    const after = await board(sender);
    expect(after.sentToday).toBe(2);
    expect(after.spentToday).toBe(2 * friendGift.amount);
    expect(after.nextRecipients).toEqual([]);

    const received = await board(b);
    expect(received.pendingCount).toBe(1);
    expect(received.pendingAmount).toBe(friendGift.amount);
    expect(received.pending[0].sender.playerId).toBe(sender.playerId);
    expect(typeof received.pendingAmount).toBe('number');
    expect((await board(blocked)).pendingCount).toBe(0);
  });

  it('günlük gönderim bütçesi ve bakiye KİLİT ALTINDA: aşan arkadaş atlanır, kimin neden atlandığı söylenir', async () => {
    const sender = await registerTestPlayer(app, 'Bütçeli');
    const [x, y] = await Promise.all([registerTestPlayer(app, 'Bütçe X'), registerTestPlayer(app, 'Bütçe Y')]);
    const outsider = await registerTestPlayer(app, 'Bütçe Dışı');
    await makeFriends(sender, x);
    await makeFriends(sender, y);
    // Fikstür: bugün bütçenin bir hediye eksiği harcanmış (başka bir alıcıya).
    expect((await board(sender)).spentToday).toBe(0);
    const dayKey = (
      await pool.query<{ day: string }>(
        `SELECT to_char((now() + make_interval(mins => $1::int))::date, 'YYYY-MM-DD') AS day`,
        [loadQuestsConfig().timezoneOffsetMinutes],
      )
    ).rows[0]!.day;
    await pool.query(
      `INSERT INTO friend_gifts (sender_id, recipient_id, amount, sender_paid, gift_day, created_at)
       VALUES ($1, $2, $3, $4, $5::date, now())`,
      [sender.playerId, outsider.playerId, friendGift.amount, friendGift.dailySendBudget - friendGift.amount, dayKey],
    );
    const preview = await board(sender);
    expect(preview.remainingSendBudget).toBe(friendGift.amount);
    expect(preview.nextRecipients).toHaveLength(1);
    expect(preview.limitedBy).toBe('budget');

    const result = await sendAll(sender);
    expect(result.sent).toBe(1);
    expect(result.recipients.map((recipient: { status: string }) => recipient.status).sort()).toEqual([
      'budget_exhausted',
      'sent',
    ]);
    expect((await board(sender)).remainingSendBudget).toBe(0);

    // Bakiye: tek hediyelik para → biri gider, diğeri "bakiye yetmedi".
    const poor = await registerTestPlayer(app, 'Az Paralı');
    await makeFriends(poor, x);
    await makeFriends(poor, y);
    await pool.query('UPDATE players SET money = $2 WHERE id = $1', [poor.playerId, friendGift.amount]);
    const poorResult = await sendAll(poor);
    expect(poorResult.sent).toBe(1);
    expect(poorResult.recipients.some((recipient: { status: string }) => recipient.status === 'insufficient_funds')).toBe(
      true,
    );
    expect(await money(poor.playerId)).toBe(0);
    expect((await board(poor)).limitedBy).toBe('funds');
    const nothing = await sendAll(poor);
    expect(nothing).toMatchObject({ sent: 0, cost: 0 });
    expect(await money(poor.playerId)).toBe(0);
  });

  it('eşzamanlı beş "Hepsine Gönder": arkadaş başına tek hediye, tek tahsilat', async () => {
    const sender = await registerTestPlayer(app, 'Hızlı Parmak');
    const friends = await Promise.all([registerTestPlayer(app, 'Eş 1'), registerTestPlayer(app, 'Eş 2')]);
    for (const friend of friends) await makeFriends(sender, friend);
    const before = await money(sender.playerId);
    const results = await Promise.all(Array.from({ length: 5 }, () => sendAll(sender)));
    expect(results.reduce((sum, result) => sum + (result.sent as number), 0)).toBe(2);
    expect(await money(sender.playerId)).toBe(before - 2 * friendGift.amount);
    const debits = await ledgerRows(sender.playerId, 'friend_gift_send');
    expect(debits.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(-2 * friendGift.amount);
    const rows = await pool.query('SELECT COUNT(*)::int AS count FROM friend_gifts WHERE sender_id = $1', [
      sender.playerId,
    ]);
    expect(rows.rows[0].count).toBe(2);
  });

  it('süresi dolan, toplanmamış ÖDENMİŞ hediye gönderene bir kez iade edilir; alıcı onu toplayamaz', async () => {
    const sender = await registerTestPlayer(app, 'İadeli');
    const recipient = await registerTestPlayer(app, 'Unutkan');
    await pool.query(
      `INSERT INTO friend_gifts (sender_id, recipient_id, amount, sender_paid, gift_day, created_at)
       VALUES ($1, $2, $3, $3, (now() - interval '30 days')::date, now() - make_interval(days => $4::int))`,
      [sender.playerId, recipient.playerId, friendGift.amount, friendGift.expiryDays + 1],
    );
    // Eski (0087 öncesi) oyunun hediyesi: gönderen ödememişti → iade YOK.
    await pool.query(
      `INSERT INTO friend_gifts (sender_id, recipient_id, amount, gift_day, created_at)
       VALUES ($1, $2, $3, (now() - interval '31 days')::date, now() - make_interval(days => $4::int))`,
      [sender.playerId, recipient.playerId, friendGift.amount, friendGift.expiryDays + 2],
    );
    expect((await board(recipient)).pendingCount).toBe(0);
    const before = await money(sender.playerId);
    const result = await sendAll(sender);
    expect(result.refunded).toBe(friendGift.amount);
    expect(await money(sender.playerId)).toBe(before + friendGift.amount);
    const refunds = await ledgerRows(sender.playerId, 'friend_gift_refund');
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(friendGift.amount);
    expect((await sendAll(sender)).refunded).toBe(0);
    expect(await collect(recipient)).toMatchObject({ collected: 0, amount: 0 });
  });

  it('alıcı hesabını silerse gönderenin ÖDEDİĞİ hediye silinmez; süresi dolunca gönderene döner', async () => {
    const sender = await registerTestPlayer(app, 'Kayıpsız');
    const leaver = await registerTestPlayer(app, 'Giden');
    await makeFriends(sender, leaver);
    await sendAll(sender);
    await http()
      .post('/api/v1/account/delete')
      .set('Authorization', leaver.authHeader)
      .send({ confirmUsername: leaver.username })
      .expect(200);
    const kept = await pool.query('SELECT sender_paid FROM friend_gifts WHERE sender_id = $1 AND recipient_id = $2', [
      sender.playerId,
      leaver.playerId,
    ]);
    expect(kept.rows).toHaveLength(1);
    expect(Number(kept.rows[0].sender_paid)).toBe(friendGift.amount);
    // Süre dolmuş gibi: bir sonraki gönderimde iade.
    await pool.query(
      "UPDATE friend_gifts SET created_at = now() - make_interval(days => $2::int) WHERE sender_id = $1",
      [sender.playerId, friendGift.expiryDays + 1],
    );
    const before = await money(sender.playerId);
    expect((await sendAll(sender)).refunded).toBe(friendGift.amount);
    expect(await money(sender.playerId)).toBe(before + friendGift.amount);
  });

  it('arkadaş başarımı engelli arkadaşı SAYMAZ (brief §6.2)', async () => {
    const owner = await registerTestPlayer(app, 'Sayılan');
    const [friendA, friendB] = await Promise.all([registerTestPlayer(app, 'Sayım A'), registerTestPlayer(app, 'Sayım B')]);
    await makeFriends(owner, friendA);
    await makeFriends(owner, friendB);
    const progress = async () =>
      (await http().get('/api/v1/achievements').set('Authorization', owner.authHeader).expect(200)).body.data.achievements.find(
        (item: { metric: string }) => item.metric === 'friend_count',
      ).progress;
    expect(await progress()).toBe(2);
    await http()
      .post(`/api/v1/players/${friendB.playerId}/blocks`)
      .set('Authorization', friendB.authHeader)
      .send({ blockedId: owner.playerId })
      .expect((response) => expect([200, 201]).toContain(response.status));
    expect(await progress()).toBe(1);
  });

  it('alıcıya friend_gift_received bildirimi hediyeyle aynı işlemde düşer; aynı gün tekrar gönderim yeni bildirim üretmez (brief §6.4)', async () => {
    const sender = await registerTestPlayer(app, 'Bildiren');
    const recipient = await registerTestPlayer(app, 'Haber Alan');
    await makeFriends(sender, recipient);
    await sendAll(sender);
    await sendAll(sender);

    const giftNotifications = async (player: RegisteredTestPlayer) =>
      (
        await http()
          .get(`/api/v1/players/${player.playerId}/notifications`)
          .set('Authorization', player.authHeader)
          .expect(200)
      ).body.data.notifications.filter((item: { type: string }) => item.type === 'friend_gift_received');

    const received = await giftNotifications(recipient);
    expect(received).toHaveLength(1);
    const gift = (
      await pool.query('SELECT id FROM friend_gifts WHERE sender_id = $1 AND recipient_id = $2', [
        sender.playerId,
        recipient.playerId,
      ])
    ).rows[0];
    expect(received[0].payload).toMatchObject({
      giftId: gift.id,
      senderId: sender.playerId,
      amount: friendGift.amount,
    });
    expect(typeof received[0].payload.senderName).toBe('string');
    expect(await giftNotifications(sender)).toHaveLength(0);
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
