import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestBoardView } from '@at-sevdalisi/shared-types';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AuctionSettleScheduler } from '../../src/infrastructure/scheduler/auction-settle.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  sendConcurrentRequests,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B). Kanıtlananlar:
 *  (1) İlerleme GERÇEK eylemden türetilir (yarış, antrenman, bakım, alım) —
 *      istemci ilerleme gönderemez.
 *  (2) Ödeme PARA YOLUDUR: bakiye + `quest_reward`/`event_reward` defter
 *      satırı aynı transaction'da; ikinci talep 409, eşzamanlı iki talepten
 *      yalnızca biri ödenir.
 *  (3) Etkinlik penceresi: başlamadan önceki eylem sayılmaz; arşivlenen
 *      etkinlik görünmez ve ödenmez; yönetim yetkisi DB'den.
 */
describe('Görevler + etkinlikler (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const config = loadQuestsConfig();
  const findQuest = (metric: string, period: 'daily' | 'weekly') => config[period].find((q) => q.metric === metric)!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const board = async (player: RegisteredTestPlayer): Promise<QuestBoardView> =>
    (await http().get('/api/v1/quests').set('Authorization', player.authHeader).expect(200)).body.data;
  const money = async (playerId: string): Promise<number> =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);
  const practice = (player: RegisteredTestPlayer & { horseId: string }) =>
    http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
  const claim = (player: RegisteredTestPlayer, key: string) =>
    http().post(`/api/v1/quests/${key}/claim`).set('Authorization', player.authHeader);
  const makeAdmin = async (): Promise<RegisteredTestPlayer> => {
    const admin = await registerTestPlayer(app, 'Etkinlik Yöneticisi');
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);
    return admin;
  };
  const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

  it('yeni oyuncu: her görev 0 ilerleme; tamamlanmamış görev 409, bilinmeyen anahtar 404', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Görev Yeni');
    const view = await board(player);
    expect(view.daily.quests.map((q) => q.key)).toEqual(config.daily.map((q) => q.key));
    expect(view.weekly.quests.map((q) => q.key)).toEqual(config.weekly.map((q) => q.key));
    expect([...view.daily.quests, ...view.weekly.quests].every((q) => q.progress === 0 && !q.claimed)).toBe(true);

    const race = findQuest('races_entered', 'daily');
    const early = await claim(player, race.key).expect(409);
    expect(early.body.error.code).toBe('QUEST_NOT_COMPLETED');
    expect((await claim(player, 'olmayan-gorev').expect(404)).body.error.code).toBe('QUEST_NOT_FOUND');
    expect((await claim(player, 'KÖTÜ_ANAHTAR').expect(404)).body.error.code).toBe('QUEST_NOT_FOUND');
    await http().get('/api/v1/quests').expect(401);
  });

  it('yarış → günlük görev tamamlanır; ödül bakiye + defter satırıyla AYNI tutarda yazılır; ikinci talep 409', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Görev Yarış');
    await practice(player);
    const race = findQuest('races_entered', 'daily');
    const progress = (await board(player)).daily.quests.find((q) => q.key === race.key)!;
    expect(progress.progress).toBe(1);

    const before = await money(player.playerId);
    const paid = await claim(player, race.key).expect(200);
    expect(paid.body.data).toEqual({ rewardMoney: race.rewardMoney, balanceAfter: before + race.rewardMoney });
    expect(await money(player.playerId)).toBe(before + race.rewardMoney);

    const ledger = await pool.query(
      `SELECT amount, balance_before, balance_after, reference_type FROM economy_transactions
        WHERE player_id = $1 AND type = 'quest_reward'`,
      [player.playerId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(race.rewardMoney);
    expect(Number(ledger.rows[0].balance_after) - Number(ledger.rows[0].balance_before)).toBe(race.rewardMoney);
    expect(ledger.rows[0].reference_type).toBe('quest_claims');

    expect((await claim(player, race.key).expect(409)).body.error.code).toBe('QUEST_ALREADY_CLAIMED');
    expect((await board(player)).daily.quests.find((q) => q.key === race.key)!.claimed).toBe(true);
    // Haftalık yarış görevi de aynı yarışı sayar (ayrı pencere, ayrı talep).
    expect((await board(player)).weekly.quests.find((q) => q.metric === 'races_entered')!.progress).toBe(1);
  });

  it('eşzamanlı iki talep: yalnızca biri ödenir, tek defter satırı', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Görev Yarışma');
    await practice(player);
    const race = findQuest('races_entered', 'daily');
    const before = await money(player.playerId);
    const responses = await sendConcurrentRequests(4, () => claim(player, race.key));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    expect(await money(player.playerId)).toBe(before + race.rewardMoney);
    const count = await pool.query(
      "SELECT COUNT(*)::int AS n FROM economy_transactions WHERE player_id = $1 AND type = 'quest_reward'",
      [player.playerId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('antrenman ve bakım sayılır; dinlenme antrenman sayılmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Görev Antrenman');
    await http()
      .post(`/api/v1/horses/${player.horseId}/train`)
      .set('Authorization', player.authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
      .expect(200);
    await http()
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'groom' })
      .expect(200);
    // Dinlenme satırı SQL ile: sayılmadığını kanıtlamak için (API'nin bekleme süresinden bağımsız).
    await pool.query(
      `INSERT INTO training_sessions (horse_id, type, intensity, duration_minutes) VALUES ($1, 'rest', 'low', 30)`,
      [player.horseId],
    );
    const view = await board(player);
    expect(view.daily.quests.find((q) => q.metric === 'trainings')!.progress).toBe(1);
    expect(view.daily.quests.find((q) => q.metric === 'care_actions')!.progress).toBe(1);
    const care = findQuest('care_actions', 'daily');
    if (care.target <= 1) await claim(player, care.key).expect(200);
  });

  it('başkasının atı için yapılan antrenman sayılmaz (yalnızca kendi atların)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Görev Sahip');
    const other = await registerTestPlayerWithStarterHorse(app, 'Görev Başkası');
    await http()
      .post(`/api/v1/horses/${owner.horseId}/train`)
      .set('Authorization', owner.authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
      .expect(200);
    expect((await board(other)).daily.quests.find((q) => q.metric === 'trainings')!.progress).toBe(0);
  });

  it('at alımı: asgari fiyatın altındaki el değiştirme sayılmaz, üstündeki sayılır', async () => {
    const buy = findQuest('horse_purchases', 'weekly');
    const sellerCheap = await registerTestPlayerWithStarterHorse(app, 'Görev Ucuz Satıcı');
    const seller = await registerTestPlayerWithStarterHorse(app, 'Görev Satıcı');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'Görev Alıcı');
    const listAndBuy = async (s: typeof seller, price: number) => {
      const listing = await http()
        .post('/api/v1/market/listings')
        .set('Authorization', s.authHeader)
        .send({ horseId: s.horseId, price })
        .expect(201);
      await http()
        .post(`/api/v1/market/listings/${listing.body.data.id}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);
    };
    await listAndBuy(sellerCheap, config.horsePurchaseMinPrice - 1);
    expect((await board(buyer)).weekly.quests.find((q) => q.key === buy.key)!.progress).toBe(0);
    await listAndBuy(seller, config.horsePurchaseMinPrice);
    expect((await board(buyer)).weekly.quests.find((q) => q.key === buy.key)!.progress).toBe(1);
  });

  it('kazanılmış müzayede de at alımı sayılır', async () => {
    const buy = findQuest('horse_purchases', 'weekly');
    const seller = await registerTestPlayerWithStarterHorse(app, 'Görev Müzayedeci');
    const bidder = await registerTestPlayerWithStarterHorse(app, 'Görev Teklifçi');
    const listing = await http()
      .post('/api/v1/market/listings')
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: config.horsePurchaseMinPrice, listingType: 'auction', expiresInHours: 24 })
      .expect(201);
    const listingId = listing.body.data.id as string;
    await http()
      .post(`/api/v1/market/listings/${listingId}/bids`)
      .set('Authorization', bidder.authHeader)
      .send({ amount: config.horsePurchaseMinPrice })
      .expect(200);
    expect((await board(bidder)).weekly.quests.find((q) => q.key === buy.key)!.progress).toBe(0);
    await pool.query("UPDATE market_listings SET expires_at = now() - interval '1 second' WHERE id = $1", [listingId]);
    await app.get(AuctionSettleScheduler).tickNow();
    expect((await board(bidder)).weekly.quests.find((q) => q.key === buy.key)!.progress).toBe(1);
    expect((await board(seller)).weekly.quests.find((q) => q.key === buy.key)!.progress).toBe(0);
  });

  describe('etkinlikler', () => {
    it('yetki: oyuncu ve moderatör açamaz (403); geçersiz girdi 400', async () => {
      const player = await registerTestPlayer(app, 'Etkinlik Oyuncu');
      const moderator = await registerTestPlayer(app, 'Etkinlik Moderatör');
      await pool.query('UPDATE players SET is_moderator = true WHERE id = $1', [moderator.playerId]);
      const body = { title: 'Kupa', metric: 'races_entered', target: 1, rewardMoney: 100, endsAt: inOneHour() };
      for (const actor of [player, moderator]) {
        const denied = await http().post('/api/v1/admin/events').set('Authorization', actor.authHeader).send(body);
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('ADMIN_REQUIRED');
      }
      // Var olmayan kimlikte de 403 (404'ten önce).
      await http()
        .post(`/api/v1/admin/events/${randomUUID()}/archive`)
        .set('Authorization', player.authHeader)
        .expect(403);
      const admin = await makeAdmin();
      const bad = await http()
        .post('/api/v1/admin/events')
        .set('Authorization', admin.authHeader)
        .send({ ...body, metric: 'para_bas' })
        .expect(400);
      expect(bad.body.error.code).toBe('INVALID_LIVE_EVENT');
    });

    it('açılıştan önceki yarış sayılmaz; sonraki sayılır; ödül event_reward ile bir kez ödenir; denetim kaydı yazılır', async () => {
      const admin = await makeAdmin();
      const player = await registerTestPlayerWithStarterHorse(app, 'Etkinlik Yarışçı');
      await practice(player); // etkinlikten ÖNCE
      await pool.query(
        'UPDATE live_events SET archived_at = now(), archived_by = created_by WHERE archived_at IS NULL',
      );
      const created = await http()
        .post('/api/v1/admin/events')
        .set('Authorization', admin.authHeader)
        .send({ title: 'Bugünün kupası', description: 'Bir yarış koş', metric: 'races_entered', target: 1, rewardMoney: 777, endsAt: inOneHour() })
        .expect(201);
      const eventId = created.body.data.id as string;
      expect(typeof created.body.data.rewardMoney).toBe('number');

      let event = (await board(player)).events.find((e) => e.id === eventId)!;
      expect(event.progress).toBe(0);
      const early = await http().post(`/api/v1/events/${eventId}/claim`).set('Authorization', player.authHeader).expect(409);
      expect(early.body.error.code).toBe('QUEST_NOT_COMPLETED');

      await practice(player);
      event = (await board(player)).events.find((e) => e.id === eventId)!;
      expect(event.progress).toBe(1);
      const before = await money(player.playerId);
      await http().post(`/api/v1/events/${eventId}/claim`).set('Authorization', player.authHeader).expect(200);
      expect(await money(player.playerId)).toBe(before + 777);
      await http().post(`/api/v1/events/${eventId}/claim`).set('Authorization', player.authHeader).expect(409);
      const ledger = await pool.query(
        "SELECT COUNT(*)::int AS n FROM economy_transactions WHERE player_id = $1 AND type = 'event_reward'",
        [player.playerId],
      );
      expect(ledger.rows[0].n).toBe(1);

      const audit = await pool.query(
        "SELECT admin_id FROM admin_audit_log WHERE action = 'live_event.created' AND target_id = $1",
        [eventId],
      );
      expect(audit.rows).toEqual([{ admin_id: admin.playerId }]);
      const list = await http().get('/api/v1/admin/events').set('Authorization', admin.authHeader).expect(200);
      expect(list.body.data.find((e: { id: string }) => e.id === eventId).claimCount).toBe(1);
    });

    it('arşivlenen etkinlik görünmez ve ödenmez; ileri tarihli etkinlik henüz görünmez', async () => {
      const admin = await makeAdmin();
      const player = await registerTestPlayerWithStarterHorse(app, 'Etkinlik Arşiv');
      await pool.query(
        'UPDATE live_events SET archived_at = now(), archived_by = created_by WHERE archived_at IS NULL',
      );
      const created = await http()
        .post('/api/v1/admin/events')
        .set('Authorization', admin.authHeader)
        .send({ title: 'Kısa', metric: 'races_entered', target: 1, rewardMoney: 50, endsAt: inOneHour() })
        .expect(201);
      const future = await http()
        .post('/api/v1/admin/events')
        .set('Authorization', admin.authHeader)
        .send({
          title: 'Yarın',
          metric: 'race_wins',
          target: 1,
          rewardMoney: 50,
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        })
        .expect(201);
      await practice(player);
      expect((await board(player)).events.map((e) => e.id)).toEqual([created.body.data.id]);
      await http().post(`/api/v1/events/${future.body.data.id}/claim`).set('Authorization', player.authHeader).expect(404);

      await http()
        .post(`/api/v1/admin/events/${created.body.data.id}/archive`)
        .set('Authorization', admin.authHeader)
        .expect(200);
      expect((await board(player)).events).toEqual([]);
      const gone = await http()
        .post(`/api/v1/events/${created.body.data.id}/claim`)
        .set('Authorization', player.authHeader)
        .expect(404);
      expect(gone.body.error.code).toBe('QUEST_NOT_FOUND');
      await http()
        .post(`/api/v1/admin/events/${created.body.data.id}/archive`)
        .set('Authorization', admin.authHeader)
        .expect(404);
    });

    it('aynı pencerede en fazla maxLive etkinlik', async () => {
      const admin = await makeAdmin();
      await pool.query(
        'UPDATE live_events SET archived_at = now(), archived_by = created_by WHERE archived_at IS NULL',
      );
      const body = { title: 'Sınır', metric: 'trainings', target: 1, rewardMoney: 10, endsAt: inOneHour() };
      for (let index = 0; index < config.events.maxLive; index += 1) {
        await http().post('/api/v1/admin/events').set('Authorization', admin.authHeader).send(body).expect(201);
      }
      const over = await http().post('/api/v1/admin/events').set('Authorization', admin.authHeader).send(body).expect(409);
      expect(over.body.error.code).toBe('LIVE_EVENT_LIMIT_REACHED');
      await pool.query(
        'UPDATE live_events SET archived_at = now(), archived_by = created_by WHERE archived_at IS NULL',
      );
    });
  });
});
