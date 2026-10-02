import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AuctionSettleScheduler } from '../../src/infrastructure/scheduler/auction-settle.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * MÜZAYEDE (02.10.2026, migration 0055) — PARA YOLU.
 *
 * **KANITLANAN:**
 *  1. Müzayede bitişsiz açılamaz; "hemen al" ile alınamaz; sabit fiyatlıya
 *     teklif verilemez; satıcı kendi ilanına teklif veremez.
 *  2. Teklif emanete alınır; geçilen teklif AYNI işlemde iade edilir; aynı
 *     teklifin tekrarı ikinci emanet alamaz (`BID_TOO_LOW`).
 *  3. Teklifli müzayede iptal edilemez; tembel süre süpürmesi onu `expired`
 *     YAPMAZ (emanet askıda kalırdı).
 *  4. Kapanış: at alıcıya, emanet satıcıya; ikinci tur ikinci ödeme yapmaz;
 *     defter her oyuncunun bakiye farkını satır satır açıklar.
 *  5. Satış gerçekleşemezse (at artık satıcının değil) emanet iade edilir.
 *  6. Eşzamanlı iki teklif: tam biri kazanır, para korunur.
 */
describe('Müzayede (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: AuctionSettleScheduler;
  const url = '/api/v1/market/listings';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(AuctionSettleScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function player(name: string): Promise<RegisteredTestPlayer & { horseId: string }> {
    const p = await registerTestPlayerWithStarterHorse(app, name);
    await pool.query('UPDATE players SET money = 10000 WHERE id = $1', [p.playerId]);
    return p;
  }

  async function money(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
      playerId,
    ]);
    return Number(result.rows[0]!.money);
  }

  async function ledgerSum(playerId: string, listingId: string): Promise<number> {
    const result = await pool.query<{ total: string | null }>(
      'SELECT SUM(amount) AS total FROM economy_transactions WHERE player_id = $1 AND reference_id = $2',
      [playerId, listingId],
    );
    return Number(result.rows[0]!.total ?? 0);
  }

  async function createAuction(seller: RegisteredTestPlayer & { horseId: string }, price = 500) {
    const response = await http()
      .post(url)
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price, listingType: 'auction', expiresInHours: 24 })
      .expect(201);
    return response.body.data.id as string;
  }

  function bid(p: RegisteredTestPlayer, listingId: string, amount: unknown) {
    return http()
      .post(`${url}/${listingId}/bids`)
      .set('Authorization', p.authHeader)
      .send({ amount });
  }

  async function endNow(listingId: string): Promise<void> {
    await pool.query(
      "UPDATE market_listings SET expires_at = now() - interval '1 second' WHERE id = $1",
      [listingId],
    );
  }

  it('kurallar: bitişsiz müzayede yok, hemen al yok, kendi ilanına teklif yok', async () => {
    const seller = await player('Müzayede Kural');
    const bidder = await player('Müzayede Kural Alıcı');

    const noEnd = await http()
      .post(url)
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: 500, listingType: 'auction' })
      .expect(400);
    expect(noEnd.body.error.code).toBe('AUCTION_REQUIRES_END_TIME');
    await http()
      .post(url)
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: 500, listingType: 'barter', expiresInHours: 24 })
      .expect(400);

    const listingId = await createAuction(seller);
    const listed = await http().get(`${url}/${listingId}`).expect(200);
    expect(listed.body.data.auction).toEqual({
      currentBid: null,
      bidCount: 0,
      minimumNextBid: 500,
      leaderId: null,
    });

    const buy = await http()
      .post(`${url}/${listingId}/buy`)
      .set('Authorization', bidder.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(buy.body.error.code).toBe('LISTING_IS_AUCTION');

    expect((await bid(seller, listingId, 600).expect(400)).body.error.code).toBe(
      'CANNOT_BID_OWN_LISTING',
    );
    expect((await bid(bidder, listingId, 499).expect(409)).body.error.code).toBe('BID_TOO_LOW');
    await bid(bidder, listingId, '600').expect(400);

    const fixedSeller = await player('Sabit Fiyat Satıcı');
    const fixed = await http()
      .post(url)
      .set('Authorization', fixedSeller.authHeader)
      .send({ horseId: fixedSeller.horseId, price: 300 })
      .expect(201);
    expect((await bid(bidder, fixed.body.data.id, 400).expect(409)).body.error.code).toBe(
      'LISTING_NOT_AUCTION',
    );
  });

  it('emanet + iade, tekrar korumalı, iptal/süpürme kapalı; kapanışta at ve para el değiştirir', async () => {
    const seller = await player('Satıcı');
    const a = await player('Teklifçi A');
    const b = await player('Teklifçi B');
    const listingId = await createAuction(seller);

    const placed = await bid(a, listingId, 500).expect(200);
    expect(placed.body.data.bidderMoney).toBe(9500);
    expect(placed.body.data.listing.auction).toMatchObject({
      currentBid: 500,
      bidCount: 1,
      leaderId: a.playerId,
      minimumNextBid: 525, // max(ceil(500 × %5), 10)
    });
    // Aynı teklifin tekrarı (ağ yeniden denemesi) ikinci emanet ALAMAZ.
    expect((await bid(a, listingId, 500).expect(409)).body.error.code).toBe('BID_TOO_LOW');
    expect(await money(a.playerId)).toBe(9500);

    expect((await bid(b, listingId, 524).expect(409)).body.error.code).toBe('BID_TOO_LOW');
    await bid(b, listingId, 600).expect(200);
    expect(await money(a.playerId)).toBe(10000); // geçilince AYNI işlemde iade
    expect(await money(b.playerId)).toBe(9400);
    await bid(a, listingId, 700).expect(200);
    expect(await money(b.playerId)).toBe(10000);
    expect(await money(a.playerId)).toBe(9300);

    const cancel = await http()
      .delete(`${url}/${listingId}`)
      .set('Authorization', seller.authHeader)
      .expect(409);
    expect(cancel.body.error.code).toBe('AUCTION_HAS_BIDS');

    // Süre doldu: tembel süpürme (her okuma) müzayedeyi `expired` YAPMAZ.
    await endNow(listingId);
    await http().get(url).expect(200);
    await http().get(`${url}/${listingId}`).expect(200);
    const still = await pool.query<{ status: string }>(
      'SELECT status FROM market_listings WHERE id = $1',
      [listingId],
    );
    expect(still.rows[0]!.status).toBe('active');
    expect((await bid(b, listingId, 900).expect(409)).body.error.code).toBe('LISTING_EXPIRED');

    const sellerBefore = await money(seller.playerId);
    const first = await scheduler.tickNow();
    expect(first?.sold).toBeGreaterThanOrEqual(1);
    const second = await scheduler.tickNow();
    expect(second).toEqual({ sold: 0, expired: 0 });

    const horse = await pool.query<{ owner_id: string }>(
      'SELECT owner_id FROM horses WHERE id = $1',
      [seller.horseId],
    );
    expect(horse.rows[0]!.owner_id).toBe(a.playerId);
    expect(await money(seller.playerId)).toBe(sellerBefore + 700);
    expect(await money(a.playerId)).toBe(9300);
    expect(await money(b.playerId)).toBe(10000);
    const listing = await http().get(`${url}/${listingId}`).expect(200);
    expect(listing.body.data.status).toBe('sold');
    expect(listing.body.data.auction.currentBid).toBe(700);

    // Defter, her oyuncunun bu ilandaki bakiye farkını TAM açıklar.
    expect(await ledgerSum(a.playerId, listingId)).toBe(-700);
    expect(await ledgerSum(b.playerId, listingId)).toBe(0);
    expect(await ledgerSum(seller.playerId, listingId)).toBe(700);
  });

  it('teklifsiz müzayede kapanışta süresi dolar; teklifsiz iptal edilebilir', async () => {
    const seller = await player('Teklifsiz');
    const listingId = await createAuction(seller);
    await endNow(listingId);
    await scheduler.tickNow();
    const listing = await http().get(`${url}/${listingId}`).expect(200);
    expect(listing.body.data.status).toBe('expired');

    const other = await player('Teklifsiz İptal');
    const cancelId = await createAuction(other);
    const cancelled = await http()
      .delete(`${url}/${cancelId}`)
      .set('Authorization', other.authHeader)
      .expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
  });

  it('satış gerçekleşemezse (at artık satıcının değil) emanet iade edilir', async () => {
    const seller = await player('Kaybolan At');
    const bidder = await player('Kaybolan At Alıcı');
    const third = await player('Üçüncü Sahip');
    const listingId = await createAuction(seller);
    await bid(bidder, listingId, 800).expect(200);
    expect(await money(bidder.playerId)).toBe(9200);

    await pool.query('UPDATE horses SET owner_id = $2 WHERE id = $1', [
      seller.horseId,
      third.playerId,
    ]);
    await endNow(listingId);
    await scheduler.tickNow();

    expect(await money(bidder.playerId)).toBe(10000);
    expect(await ledgerSum(bidder.playerId, listingId)).toBe(0);
    const horse = await pool.query<{ owner_id: string }>(
      'SELECT owner_id FROM horses WHERE id = $1',
      [seller.horseId],
    );
    expect(horse.rows[0]!.owner_id).toBe(third.playerId);
    const status = await pool.query<{ status: string }>(
      'SELECT status FROM market_bids WHERE listing_id = $1',
      [listingId],
    );
    expect(status.rows.map((row) => row.status)).toEqual(['refunded']);
  });

  it('eşzamanlı iki teklif: tam biri kazanır, para korunur', async () => {
    const seller = await player('Yarışan Teklif');
    const a = await player('Yarışan A');
    const b = await player('Yarışan B');
    const listingId = await createAuction(seller);

    const results = await Promise.all([bid(a, listingId, 500), bid(b, listingId, 500)]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    const total = (await money(a.playerId)) + (await money(b.playerId));
    expect(total).toBe(20000 - 500);
    const leading = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM market_bids WHERE listing_id = $1 AND status = 'leading'",
      [listingId],
    );
    expect(leading.rows[0]!.n).toBe(1);
  });
});
