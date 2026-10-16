import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TribuneGiftEvent } from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';
import { tribuneGiftOwnerShare } from '../../src/domain/grandstand/tribune-gift';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * TRİBÜN HEDİYESİ (08.10.2026, migration 0075). Kanıtlananlar:
 *   (1) Yetki tribünle AYNI kapı: biletsiz izleyici 403.
 *   (2) PARA YOLU: gönderen fiyatı öder, atı KOŞTURAN oyuncu payını alır;
 *       iki defter satırı + bildirim; aynı `Idempotency-Key` ikinci kez
 *       tahsil etmez; anahtarsız istek 400.
 *   (3) Yarış odasındaki sokete `race.tribuneGift` yayılır.
 *   (4) Kurallar: kendi atına, yarışta olmayan ata, bilinmeyen hediye,
 *       yetersiz bakiye, günlük sınır, engel, kapanmış pencere → reddedilir
 *       ve hiçbir para hareketi olmaz.
 */
const WAIT_MS = 20_000;

describe('Tribün hediyesi (e2e)', () => {
  const config = loadGrandstandConfig().tribuneGifts;
  const carrot = config.items[0]!;
  let app: INestApplication;
  let pool: Pool;
  let baseUrl: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);
  const ledgerCount = async (playerId: string) =>
    Number(
      (
        await pool.query(
          "SELECT COUNT(*) FROM economy_transactions WHERE player_id = $1 AND type IN ('tribune_gift_debit', 'tribune_gift_credit')",
          [playerId],
        )
      ).rows[0].count,
    );

  /** Sahip bir pratik yarış koşar (bitmiş, katılım `player_id`li); izleyici bilet alır. */
  async function raceWithSpectator(label: string) {
    const owner = await registerTestPlayerWithStarterHorse(app, `${label} Sahibi`);
    const viewer = await registerTestPlayerWithStarterHorse(app, `${label} İzleyici`);
    const race = await http()
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    return { owner, viewer, raceId: race.body.data.raceId as string };
  }

  async function buyTicket(raceId: string, authHeader: string): Promise<void> {
    await http()
      .post(`/api/v1/races/${raceId}/tickets`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
  }

  const giftUrl = (raceId: string) => `/api/v1/races/${raceId}/tribune-gifts`;

  async function connect(token: string): Promise<Socket> {
    const client = io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
    if (!client.connected) {
      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('bağlantı zaman aşımı')), WAIT_MS);
      });
    }
    return client;
  }

  async function subscribe(client: Socket, raceId: string): Promise<void> {
    const roster = new Promise<void>((resolve, reject) => {
      client.once('race.roster', () => resolve());
      client.once('race.error', (payload: { message: string }) => reject(new Error(payload.message)));
      setTimeout(() => reject(new Error('race.roster zaman aşımı')), WAIT_MS);
    });
    client.emit('race.subscribe', { raceId });
    await roster;
  }

  it('biletsiz izleyici 403; biletli izleyici hediye gönderir — para, defter, bildirim, yayın, tekrar koruması', async () => {
    const { owner, viewer, raceId } = await raceWithSpectator('Hediye');
    await http().get(giftUrl(raceId)).set('Authorization', viewer.authHeader).expect(403);
    await buyTicket(raceId, viewer.authHeader);

    const board = (await http().get(giftUrl(raceId)).set('Authorization', viewer.authHeader).expect(200)).body.data;
    expect(board.open).toBe(true);
    expect(board.recipients).toEqual([
      expect.objectContaining({ horseId: owner.horseId, ownerDisplayName: 'Hediye Sahibi' }),
    ]);
    expect(board.items.map((item: { key: string }) => item.key)).toEqual(config.items.map((item) => item.key));

    const ownerSocket = await connect(owner.token);
    try {
      await subscribe(ownerSocket, raceId);
      const broadcast = new Promise<TribuneGiftEvent>((resolve, reject) => {
        ownerSocket.once('race.tribuneGift', (event: TribuneGiftEvent) => resolve(event));
        setTimeout(() => reject(new Error('race.tribuneGift zaman aşımı')), WAIT_MS);
      });

      const viewerBefore = await money(viewer.playerId);
      const ownerBefore = await money(owner.playerId);
      const key = randomUUID();
      const sent = await http()
        .post(giftUrl(raceId))
        .set('Authorization', viewer.authHeader)
        .set('Idempotency-Key', key)
        .send({ horseId: owner.horseId, giftKey: carrot.key })
        .expect(201);
      const share = tribuneGiftOwnerShare(carrot.price, config.ownerSharePercent);
      expect(sent.body.data).toMatchObject({ giftKey: carrot.key, price: carrot.price, ownerAmount: share });
      expect(await money(viewer.playerId)).toBe(viewerBefore - carrot.price);
      expect(await money(owner.playerId)).toBe(ownerBefore + share);

      const event = await broadcast;
      expect(event).toMatchObject({
        raceId,
        horseId: owner.horseId,
        giftKey: carrot.key,
        senderDisplayName: 'Hediye İzleyici',
        tribuneGiftId: sent.body.data.tribuneGiftId,
      });

      // Aynı anahtar → aynı yanıt, ikinci tahsil YOK.
      const replay = await http()
        .post(giftUrl(raceId))
        .set('Authorization', viewer.authHeader)
        .set('Idempotency-Key', key)
        .send({ horseId: owner.horseId, giftKey: carrot.key });
      expect(replay.body.data.tribuneGiftId).toBe(sent.body.data.tribuneGiftId);
      expect(await money(viewer.playerId)).toBe(viewerBefore - carrot.price);
      await http()
        .post(giftUrl(raceId))
        .set('Authorization', viewer.authHeader)
        .send({ horseId: owner.horseId, giftKey: carrot.key })
        .expect(400);
    } finally {
      ownerSocket.disconnect();
    }

    const ledger = await pool.query(
      `SELECT player_id, type, amount, reference_id FROM economy_transactions
        WHERE type IN ('tribune_gift_debit', 'tribune_gift_credit') AND reference_type = 'tribune_gifts'
          AND player_id IN ($1, $2) ORDER BY type`,
      [viewer.playerId, owner.playerId],
    );
    expect(ledger.rows.map((row) => [row.player_id, row.type, Number(row.amount)])).toEqual([
      [owner.playerId, 'tribune_gift_credit', tribuneGiftOwnerShare(carrot.price, config.ownerSharePercent)],
      [viewer.playerId, 'tribune_gift_debit', -carrot.price],
    ]);
    const notification = await pool.query(
      "SELECT payload FROM notifications WHERE player_id = $1 AND type = 'tribune_gift_received'",
      [owner.playerId],
    );
    expect(notification.rows).toHaveLength(1);
    expect(notification.rows[0].payload).toMatchObject({ raceId, giftKey: carrot.key, playerId: viewer.playerId });

    const after = (await http().get(giftUrl(raceId)).set('Authorization', viewer.authHeader).expect(200)).body.data;
    expect(after.perHorse).toEqual([{ horseId: owner.horseId, counts: { [carrot.key]: 1 } }]);
    expect(after.recent[0]).toMatchObject({ giftKey: carrot.key, senderDisplayName: 'Hediye İzleyici' });
    expect(after.sentToday).toBe(1);
  }, 60_000);

  it('kurallar: kendi atı, yarışta olmayan at, bilinmeyen hediye, bakiye, engel, pencere — para hareketi yok', async () => {
    const { owner, viewer, raceId } = await raceWithSpectator('Kural');
    await buyTicket(raceId, viewer.authHeader);
    const send = (who: { authHeader: string }, body: Record<string, unknown>) =>
      http().post(giftUrl(raceId)).set('Authorization', who.authHeader).set('Idempotency-Key', randomUUID()).send(body);

    const self = await send(owner, { horseId: owner.horseId, giftKey: carrot.key }).expect(409);
    expect(self.body.error.code).toBe('TRIBUNE_GIFT_NOT_ALLOWED');
    const notInRace = await send(viewer, { horseId: viewer.horseId, giftKey: carrot.key }).expect(409);
    expect(notInRace.body.error.code).toBe('TRIBUNE_GIFT_NOT_ALLOWED');
    const unknown = await send(viewer, { horseId: owner.horseId, giftKey: 'elmas-yuzuk' }).expect(400);
    expect(unknown.body.error.code).toBe('INVALID_TRIBUNE_GIFT');
    await send(viewer, { horseId: 'kaplan', giftKey: carrot.key }).expect(400);

    const trophy = config.items.reduce((max, item) => (item.price > max.price ? item : max));
    await pool.query('UPDATE players SET money = $2 WHERE id = $1', [viewer.playerId, trophy.price - 1]);
    const poor = await send(viewer, { horseId: owner.horseId, giftKey: trophy.key }).expect(409);
    expect(poor.body.error.code).toBe('INSUFFICIENT_FUNDS');
    await pool.query('UPDATE players SET money = 5000 WHERE id = $1', [viewer.playerId]);

    await http()
      .post(`/api/v1/players/${owner.playerId}/blocks`)
      .set('Authorization', owner.authHeader)
      .send({ blockedId: viewer.playerId })
      .expect((response) => expect([200, 201]).toContain(response.status));
    const blocked = await send(viewer, { horseId: owner.horseId, giftKey: carrot.key }).expect(403);
    expect(blocked.body.error.code).toBe('PLAYER_BLOCKED');
    await http()
      .delete(`/api/v1/players/${owner.playerId}/blocks/${viewer.playerId}`)
      .set('Authorization', owner.authHeader)
      .expect((response) => expect(response.status).toBeLessThan(300));

    await pool.query(`UPDATE races SET start_time = now() - make_interval(hours => $2::int) WHERE id = $1`, [
      raceId,
      config.giftWindowHours + 1,
    ]);
    const closed = await send(viewer, { horseId: owner.horseId, giftKey: carrot.key }).expect(409);
    expect(closed.body.error.code).toBe('TRIBUNE_GIFT_NOT_ALLOWED');
    expect((await http().get(giftUrl(raceId)).set('Authorization', viewer.authHeader).expect(200)).body.data.open).toBe(
      false,
    );

    expect(await ledgerCount(viewer.playerId)).toBe(0);
    expect(await ledgerCount(owner.playerId)).toBe(0);
  }, 60_000);

  it('brief §8.3: yarıştan sonra at satılsa da hediye atı KOŞTURAN oyuncuya gider (yeni sahibe değil)', async () => {
    const { owner, viewer, raceId } = await raceWithSpectator('Satılan');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'Satılan Alıcı');
    // Yarış bitti; at sonradan el değiştirdi (pazar satışının sonucu ile aynı satır).
    await pool.query('UPDATE horses SET owner_id = $2 WHERE id = $1', [owner.horseId, buyer.playerId]);
    await buyTicket(raceId, viewer.authHeader);
    const board = (await http().get(giftUrl(raceId)).set('Authorization', viewer.authHeader).expect(200)).body.data;
    expect(board.recipients).toEqual([expect.objectContaining({ horseId: owner.horseId, ownerDisplayName: 'Satılan Sahibi' })]);

    const ownerBefore = await money(owner.playerId);
    const buyerBefore = await money(buyer.playerId);
    await http()
      .post(giftUrl(raceId))
      .set('Authorization', viewer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId, giftKey: carrot.key })
      .expect(201);
    expect(await money(owner.playerId)).toBe(ownerBefore + tribuneGiftOwnerShare(carrot.price, config.ownerSharePercent));
    expect(await money(buyer.playerId)).toBe(buyerBefore);
    expect(await ledgerCount(buyer.playerId)).toBe(0);
    // Yeni sahip bu yarışta koşmadı: o ata hediye gönderebilir, alıcı yine koşturandır.
    await buyTicket(raceId, buyer.authHeader);
    await http()
      .post(giftUrl(raceId))
      .set('Authorization', buyer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId, giftKey: carrot.key })
      .expect(201);
    // Koşturan kendi atına hediye ATAMAZ (kendi kendine hediye yok).
    await http()
      .post(giftUrl(raceId))
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId, giftKey: carrot.key })
      .expect(409);
  });

  it('günlük sınır gönderenin kilidi altında sayılır', async () => {
    const { owner, viewer, raceId } = await raceWithSpectator('Sınır');
    await buyTicket(raceId, viewer.authHeader);
    // Fikstür: bugün sınır kadar hediye gönderilmiş.
    for (let index = 0; index < config.dailyLimit; index += 1) {
      await pool.query(
        `INSERT INTO tribune_gifts (race_id, horse_id, sender_id, recipient_id, gift_key, price, owner_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [raceId, owner.horseId, viewer.playerId, owner.playerId, carrot.key, carrot.price, 1],
      );
    }
    const before = await money(viewer.playerId);
    const limited = await http()
      .post(giftUrl(raceId))
      .set('Authorization', viewer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId, giftKey: carrot.key })
      .expect(409);
    expect(limited.body.error.code).toBe('TRIBUNE_GIFT_DAILY_LIMIT');
    expect(await money(viewer.playerId)).toBe(before);
  });
});
