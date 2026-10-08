import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { MarketListingExpiryScheduler } from '../../src/infrastructure/scheduler/market-listing-expiry.scheduler';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * SABİT FİYATLI İLAN SÜRE DOLUMU (08.10.2026, migration 0077). Kanıtlananlar:
 *   (1) Zamanlayıcı turu süresi dolan ilanı — hiç okunmasa bile — `expired`
 *       yapar ve satıcıya TEK `listing_expired` bildirimi yazar; ikinci tur
 *       hiçbir şey yapmaz.
 *   (2) Geçiş yalnızca `active` satırda olur: satılmış ilan süresi geçmiş
 *       görünse bile `expired`a GERİ YAZILMAZ (eski "oku, sonra koşulsuz
 *       yaz" süpürmesinin yarış hatası).
 *   (3) Müzayede bu turda süpürülmez (emaneti kapanış yönetir).
 *   (4) Okuma anındaki süpürme aynı ifadedir (bildirim dahil); süresi dolan
 *       atın yeniden ilana çıkması engellenmez.
 */
describe('İlan süre dolumu (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: MarketListingExpiryScheduler;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(MarketListingExpiryScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function list(
    seller: RegisteredTestPlayer & { horseId: string },
    body: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await http()
      .post('/api/v1/market/listings')
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: 1200, expiresInHours: 24, ...body })
      .expect(201);
    return response.body.data.id as string;
  }

  const backdate = (listingId: string) =>
    pool.query("UPDATE market_listings SET expires_at = now() - interval '1 minute' WHERE id = $1", [listingId]);

  const status = async (listingId: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM market_listings WHERE id = $1', [listingId])).rows[0]!
      .status;

  const expiryNotifications = (playerId: string) =>
    pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM notifications WHERE player_id = $1 AND type = 'listing_expired'",
      [playerId],
    );

  it('tur süresi dolan ilanı okunmadan expired yapar; satıcıya tek bildirim; ikinci tur no-op', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Süreli Satıcı');
    const listingId = await list(seller);
    await backdate(listingId);

    const first = await scheduler.tickNow();
    expect(first?.expired).toContain(listingId);
    expect(await status(listingId)).toBe('expired');
    const notes = await expiryNotifications(seller.playerId);
    expect(notes.rows).toHaveLength(1);
    expect(notes.rows[0]!.payload).toMatchObject({ listingId, horseId: seller.horseId, price: 1200 });
    expect(typeof notes.rows[0]!.payload.horseName).toBe('string');

    const second = await scheduler.tickNow();
    expect(second?.expired ?? []).not.toContain(listingId);
    expect((await expiryNotifications(seller.playerId)).rows).toHaveLength(1);

    // At yeniden ilana çıkabilir (tek aktif ilan kısıtı artık engellemez).
    await list(seller);
  });

  it('satılmış ilan süresi geçmiş görünse de expired yapılmaz; müzayede bu turda süpürülmez', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Satılmış Satıcı');
    const soldId = await list(seller);
    // Satış, süpürme ile yarışmış gibi: satır `sold`, süresi geçmiş.
    await pool.query("UPDATE market_listings SET status = 'sold', expires_at = now() - interval '1 minute' WHERE id = $1", [
      soldId,
    ]);

    const auctionSeller = await registerTestPlayerWithStarterHorse(app, 'Müzayedeci');
    const auctionId = await list(auctionSeller, { listingType: 'auction' });
    await backdate(auctionId);

    const result = await scheduler.tickNow();
    expect(result?.expired).not.toContain(soldId);
    expect(result?.expired).not.toContain(auctionId);
    expect(await status(soldId)).toBe('sold');
    expect(await status(auctionId)).toBe('active');
    expect((await expiryNotifications(seller.playerId)).rows).toHaveLength(0);
    expect((await expiryNotifications(auctionSeller.playerId)).rows).toHaveLength(0);
  });

  it('okuma anındaki süpürme aynı ifade: ilan expired görünür ve satıcı bildirimi alır', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Okunan Satıcı');
    const listingId = await list(seller);
    await backdate(listingId);

    const read = await http()
      .get(`/api/v1/market/listings/${listingId}`)
      .set('Authorization', seller.authHeader)
      .expect(200);
    expect(read.body.data.status).toBe('expired');
    expect((await expiryNotifications(seller.playerId)).rows).toHaveLength(1);
  });
});
