import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * FAZ 1 wiring, on birinci dilim — `POST /market/listings`, `GET
 * /market/listings/:id`, `POST /market/listings/:id/buy`, `DELETE
 * /market/listings/:id` (brief §30 At Pazarı, docs/API.md §5). On ikinci
 * dilim — `GET /market/listings` (tarama) ve `GET /market/my-listings`
 * (İlanlarım) salt-okunur uç noktaları eklendi. On üçüncü dilim —
 * `POST /market/listings`'e opsiyonel `expiresInHours` eklendi ve süresi
 * dolan ilanların TEMBEL süpürmeyle gerçekten `expired`'a çevrildiği
 * doğrulandı (bkz. `PostgresMarketListingRepository.sweepExpiredListings`
 * doc yorumu — testler DB'ye doğrudan `pool.query` ile geçmiş bir
 * `expires_at` yazarak süreyi simüle eder, gerçek zaman geçmesini
 * BEKLEMEZ). `stable.e2e-spec.ts`/
 * `race.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL + Redis gerektirir, bu ortamda ÇALIŞTIRILAMAZ — bkz.
 * docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S2/S4 hardening (bu oturum) — bkz.
 * `market.controller.ts` doc yorumları:
 *  - `POST /market/listings` artık `HorseOwnerGuardByBodyField` (KENDİ
 *    atını satışa çıkarabilir).
 *  - `GET /market/listings` (tarama) VE `GET /market/listings/:id`
 *    BİLEREK `@Public()` kalır (herkes tarayabilir/tek bir ilana bakabilir).
 *  - `GET /market/my-listings` artık `assertSelf` (yalnızca KENDİ
 *    ilanların).
 *  - `POST /market/listings/:id/buy` artık `buyerId`'yi GÖVDEDEN
 *    ALMIYOR — alıcı kimliği YALNIZCA `@CurrentPlayer()`'dan gelir;
 *    `Idempotency-Key` kapsamı artık `request.player.id` (`'player'`
 *    kapsamı, bkz. `idempotency-scope.decorator.ts`).
 *  - `DELETE /market/listings/:id` artık `ListingOwnerGuard` (yalnızca
 *    KENDİ ilanını iptal edebilir).
 */
describe('Market — At Pazarı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerSellerWithHorse(): Promise<RegisteredTestPlayer & { horseId: string }> {
    return registerTestPlayerWithStarterHorse(app, 'At Pazarı Oyuncusu');
  }

  async function registerBuyer(): Promise<RegisteredTestPlayer> {
    return registerTestPlayer(app, 'Alıcı');
  }

  describe('POST /api/v1/market/listings', () => {
    it('geçerli bir at + fiyat ile yeni bir ilan oluşturur (201), sellerId atın sahibidir', async () => {
      const { horseId, playerId, authHeader } = await registerSellerWithHorse();

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.horseId).toBe(horseId);
      expect(response.body.data.sellerId).toBe(playerId);
      expect(response.body.data.price).toBe(1000);
      expect(response.body.data.listingType).toBe('fixed_price');
      expect(response.body.data.status).toBe('active');
    });

    it('Authorization header olmadan 401 döner', async () => {
      const { horseId } = await registerSellerWithHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000 });
      expect(response.status).toBe(401);
    });

    it('başkasının atını satışa çıkarmaya çalışan istek 403 döner (AUDIT_REPORT.md S2/S4)', async () => {
      const owner = await registerSellerWithHorse();
      const attacker = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', attacker.authHeader)
        .send({ horseId: owner.horseId, price: 1000 });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('var olmayan bir at için 404 HORSE_NOT_FOUND döner', async () => {
      const someone = await registerBuyer();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', someone.authHeader)
        .send({ horseId: randomUUID(), price: 1000 });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
    });

    it('aynı at için ikinci bir ilan oluşturmaya çalışılırsa 409 HORSE_ALREADY_LISTED döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1500 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('HORSE_ALREADY_LISTED');
    });

    it('eşzamanlı iki ilan oluşturma isteğinden (aynı at) yalnızca BİRİ 201 döner, diğeri 409 HORSE_ALREADY_LISTED alır', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();

      const [responseA, responseB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/market/listings')
          .set('Authorization', authHeader)
          .send({ horseId, price: 1000 }),
        request(app.getHttpServer())
          .post('/api/v1/market/listings')
          .set('Authorization', authHeader)
          .send({ horseId, price: 1500 }),
      ]);

      const statuses = [responseA.status, responseB.status].sort();
      expect(statuses).toEqual([201, 409]);
      const conflicting = responseA.status === 409 ? responseA : responseB;
      expect(conflicting.body.error.code).toBe('HORSE_ALREADY_LISTED');

      const activeRows = await pool.query(
        "SELECT id FROM market_listings WHERE horse_id = $1 AND status = 'active'",
        [horseId],
      );
      expect(activeRows.rows).toHaveLength(1);
    });

    it('negatif bir fiyat için 400 döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: -100 });
      expect(response.status).toBe(400);
    });

    it('expiresInHours verilirse ilerideki bir expiresAt ile ilan oluşturur', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const before = Date.now();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000, expiresInHours: 48 })
        .expect(201);

      expect(response.body.data.expiresAt).not.toBeNull();
      const expiresAtMs = new Date(response.body.data.expiresAt).getTime();
      expect(expiresAtMs).toBeGreaterThan(before + 47 * 3600 * 1000);
      expect(expiresAtMs).toBeLessThan(before + 49 * 3600 * 1000);
    });

    it('expiresInHours 0 veya negatifse 400 INVALID_LISTING_EXPIRY döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000, expiresInHours: 0 });
      expect(response.status).toBe(400);
    });

    it('expiresInHours üst sınırı (720) aşarsa 400 döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000, expiresInHours: 721 });
      expect(response.status).toBe(400);
    });

    it('süresi dolmuş eski bir ilan varken aynı at için YENİ bir ilan oluşturulabilir', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const old = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        old.body.data.id,
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 2000 });

      expect(response.status).toBe(201);
      const oldRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [old.body.data.id]);
      expect(oldRow.rows[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/listings (tarama, public)', () => {
    it('status verilmezse yalnızca active durumdaki ilanları döner', async () => {
      const uniquePrice = 611001;
      const active = await registerSellerWithHorse();
      const activeListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', active.authHeader)
        .send({ horseId: active.horseId, price: uniquePrice })
        .expect(201);

      const cancelled = await registerSellerWithHorse();
      const cancelledListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', cancelled.authHeader)
        .send({ horseId: cancelled.horseId, price: uniquePrice })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${cancelledListing.body.data.id}`)
        .set('Authorization', cancelled.authHeader)
        .expect(200);

      const response = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?minPrice=${uniquePrice}&maxPrice=${uniquePrice}`,
      );

      expect(response.status).toBe(200);
      const ids = response.body.data.map((listing: { id: string }) => listing.id);
      expect(ids).toContain(activeListing.body.data.id);
      expect(ids).not.toContain(cancelledListing.body.data.id);
      expect(response.body.meta.totalItems).toBe(1);
    });

    it('status verilirse o duruma göre filtreler (ör. cancelled)', async () => {
      const uniquePrice = 611002;
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: uniquePrice })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      const response = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?status=cancelled&minPrice=${uniquePrice}&maxPrice=${uniquePrice}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(created.body.data.id);
      expect(response.body.data[0].status).toBe('cancelled');
    });

    it('minPrice/maxPrice fiyat aralığına göre filtreler', async () => {
      const base = 620000;
      const low = await registerSellerWithHorse();
      const lowListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', low.authHeader)
        .send({ horseId: low.horseId, price: base + 1 })
        .expect(201);
      const high = await registerSellerWithHorse();
      const highListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', high.authHeader)
        .send({ horseId: high.horseId, price: base + 100 })
        .expect(201);

      const response = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?minPrice=${base + 50}&maxPrice=${base + 200}`,
      );

      expect(response.status).toBe(200);
      const ids = response.body.data.map((listing: { id: string }) => listing.id);
      expect(ids).toContain(highListing.body.data.id);
      expect(ids).not.toContain(lowListing.body.data.id);
    });

    it('page/pageSize sayfalama meta bilgisini doğru döner', async () => {
      const uniquePrice = 633003;
      for (let i = 0; i < 3; i += 1) {
        const { horseId, authHeader } = await registerSellerWithHorse();
        await request(app.getHttpServer())
          .post('/api/v1/market/listings')
          .set('Authorization', authHeader)
          .send({ horseId, price: uniquePrice })
          .expect(201);
      }

      const firstPage = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?minPrice=${uniquePrice}&maxPrice=${uniquePrice}&page=1&pageSize=2`,
      );
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.meta).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });

      const secondPage = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?minPrice=${uniquePrice}&maxPrice=${uniquePrice}&page=2&pageSize=2`,
      );
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.meta).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    });

    it('geçersiz bir status için 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings?status=not-a-status');
      expect(response.status).toBe(400);
    });

    it('minPrice, maxPrice değerinden büyükse 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings?minPrice=100&maxPrice=50');
      expect(response.status).toBe(400);
    });

    it('pageSize aralık dışıysa (>100) 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings?pageSize=101');
      expect(response.status).toBe(400);
    });

    it("page 1'den küçükse 400 döner", async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings?page=0');
      expect(response.status).toBe(400);
    });

    it('süresi dolmuş bir ilan varsayılan (active) taramada görünmez, status=expired ile görünür', async () => {
      const uniquePrice = 644004;
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: uniquePrice, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);

      const activeView = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?minPrice=${uniquePrice}&maxPrice=${uniquePrice}`,
      );
      expect(activeView.status).toBe(200);
      expect(activeView.body.data).toEqual([]);

      const expiredView = await request(app.getHttpServer()).get(
        `/api/v1/market/listings?status=expired&minPrice=${uniquePrice}&maxPrice=${uniquePrice}`,
      );
      expect(expiredView.status).toBe(200);
      expect(expiredView.body.data).toHaveLength(1);
      expect(expiredView.body.data[0].id).toBe(created.body.data.id);

      const row = await pool.query('SELECT status FROM market_listings WHERE id = $1', [created.body.data.id]);
      expect(row.rows[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/my-listings (İlanlarım)', () => {
    it('Authorization header olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/my-listings');
      expect(response.status).toBe(401);
    });

    it('sellerId eksikse 400 döner', async () => {
      const someone = await registerBuyer();
      const response = await request(app.getHttpServer())
        .get('/api/v1/market/my-listings')
        .set('Authorization', someone.authHeader);
      expect(response.status).toBe(400);
    });

    it('sellerId geçerli bir UUID değilse 400 döner', async () => {
      const someone = await registerBuyer();
      const response = await request(app.getHttpServer())
        .get('/api/v1/market/my-listings?sellerId=not-a-uuid')
        .set('Authorization', someone.authHeader);
      expect(response.status).toBe(400);
    });

    it('başkasının ilanlarını isteyen istek 403 döner (AUDIT_REPORT.md S4)', async () => {
      const target = await registerBuyer();
      const attacker = await registerBuyer();
      const response = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${target.playerId}`)
        .set('Authorization', attacker.authHeader);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('hiç ilanı olmayan (kendi hesabı) bir satıcı için boş dizi döner', async () => {
      const seller = await registerBuyer();
      const response = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${seller.playerId}`)
        .set('Authorization', seller.authHeader);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('status verilmezse satıcının TÜM durumlardaki ilanlarını döner', async () => {
      const { horseId, playerId: sellerId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1234 })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${sellerId}`)
        .set('Authorization', authHeader);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(created.body.data.id);
      expect(response.body.data[0].status).toBe('cancelled');
    });

    it('status verilirse yalnızca o durumdaki ilanları döner', async () => {
      const { horseId, playerId: sellerId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1234 })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      const activeOnly = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${sellerId}&status=active`)
        .set('Authorization', authHeader);
      expect(activeOnly.status).toBe(200);
      expect(activeOnly.body.data).toEqual([]);

      const cancelledOnly = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${sellerId}&status=cancelled`)
        .set('Authorization', authHeader);
      expect(cancelledOnly.status).toBe(200);
      expect(cancelledOnly.body.data).toHaveLength(1);
      expect(cancelledOnly.body.data[0].id).toBe(created.body.data.id);
    });

    it('geçersiz bir status için 400 döner', async () => {
      const seller = await registerBuyer();
      const response = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${seller.playerId}&status=not-a-status`)
        .set('Authorization', seller.authHeader);
      expect(response.status).toBe(400);
    });

    it("süresi dolmuş bir ilan status verilmeden İlanlarım'da expired durumunda görünür", async () => {
      const { horseId, playerId: sellerId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1234, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/market/my-listings?sellerId=${sellerId}`)
        .set('Authorization', authHeader);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/listings/:id (public)', () => {
    it('var olan bir ilanı döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer()).get(`/api/v1/market/listings/${created.body.data.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(created.body.data.id);
    });

    it('var olmayan bir ilan için 404 LISTING_NOT_FOUND döner', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/market/listings/${randomUUID()}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    it('geçersiz (UUID olmayan) bir id için 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings/not-a-uuid');
      expect(response.status).toBe(400);
    });

    it("süresi dolmuş bir ilanı id'siyle getirince status expired döner", async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);

      const response = await request(app.getHttpServer()).get(`/api/v1/market/listings/${created.body.data.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('expired');
    });
  });

  describe('POST /api/v1/market/listings/:id/buy', () => {
    const LISTING_PRICE = 1000;

    async function createListing(): Promise<{ listingId: string; horseId: string; seller: RegisteredTestPlayer }> {
      const seller = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', seller.authHeader)
        .send({ horseId: seller.horseId, price: LISTING_PRICE })
        .expect(201);
      return { listingId: created.body.data.id, horseId: seller.horseId, seller };
    }

    it('yeterli bakiyeyle satın alır: parayı alıcıdan düşer, satıcıya ekler, atın sahibini değiştirir, ilanı sold yapar', async () => {
      const { listingId, horseId, seller } = await createListing();
      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.listing.status).toBe('sold');
      expect(response.body.data.buyerBalance.money).toBe(5000 - LISTING_PRICE);
      expect(response.body.data.sellerBalance.money).toBe(5000 + LISTING_PRICE);

      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(buyer.playerId);

      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('sold');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000 - LISTING_PRICE);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);
    });

    it('Authorization header olmadan 401 döner', async () => {
      const { listingId } = await createListing();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(response.status).toBe(401);
    });

    it('Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner ve HİÇBİR ŞEY değişmez', async () => {
      const { listingId, seller } = await createListing();
      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const listing = await request(app.getHttpServer()).get(`/api/v1/market/listings/${listingId}`);
      expect(listing.body.data.status).toBe('active');
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
    });

    it('AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR para el değiştirmez', async () => {
      const { listingId, seller } = await createListing();
      const buyer = await registerBuyer();
      const idempotencyKey = randomUUID();

      const first = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({})
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({})
        .expect(200);

      expect(second.body.data).toEqual(first.body.data);

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000 - LISTING_PRICE);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);
    });

    it('AYNI Idempotency-Key ile GERÇEKTEN eşzamanlı iki istekten yalnızca biri işlemi çalıştırır, diğeri 409 IDEMPOTENCY_KEY_IN_PROGRESS alır', async () => {
      const { listingId, seller } = await createListing();
      const buyer = await registerBuyer();
      const idempotencyKey = randomUUID();

      const [responseA, responseB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/market/listings/${listingId}/buy`)
          .set('Authorization', buyer.authHeader)
          .set('Idempotency-Key', idempotencyKey)
          .send({}),
        request(app.getHttpServer())
          .post(`/api/v1/market/listings/${listingId}/buy`)
          .set('Authorization', buyer.authHeader)
          .set('Idempotency-Key', idempotencyKey)
          .send({}),
      ]);

      const statuses = [responseA.status, responseB.status].sort();
      if (statuses.includes(409)) {
        expect(statuses).toEqual([200, 409]);
        const conflicting = responseA.status === 409 ? responseA : responseB;
        expect(conflicting.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      } else {
        expect(statuses).toEqual([200, 200]);
        expect(responseA.body.data).toEqual(responseB.body.data);
      }

      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);

      const keyRow = await pool.query(
        'SELECT status FROM idempotency_keys WHERE scope_id = $1 AND idempotency_key = $2',
        [buyer.playerId, idempotencyKey],
      );
      expect(keyRow.rows).toHaveLength(1);
      expect(keyRow.rows[0].status).toBe('completed');
    });

    it('kendi ilanını satın almaya çalışırsa 400 CANNOT_BUY_OWN_LISTING döner', async () => {
      const { listingId, seller } = await createListing();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', seller.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CANNOT_BUY_OWN_LISTING');
    });

    it('alıcının bakiyesi yetersizse 409 INSUFFICIENT_FUNDS döner ve HİÇBİR ŞEY değişmez', async () => {
      const { horseId, playerId: sellerId, authHeader: sellerAuthHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', sellerAuthHeader)
        .send({ horseId, price: 999999 })
        .expect(201);
      const listingId = created.body.data.id;

      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('active');
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(sellerId);
    });

    it('zaten satılmış bir ilan için 409 LISTING_NOT_ACTIVE döner', async () => {
      const { listingId } = await createListing();
      const firstBuyer = await registerBuyer();
      await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', firstBuyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);

      const secondBuyer = await registerBuyer();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', secondBuyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');
    });

    it('var olmayan bir ilan için 404 LISTING_NOT_FOUND döner', async () => {
      const buyer = await registerBuyer();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${randomUUID()}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    it('süresi dolmuş bir ilanı satın almaya çalışırsa 409 LISTING_NOT_ACTIVE döner, hiçbir şey değişmez', async () => {
      const { horseId, playerId: sellerId, authHeader: sellerAuthHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', sellerAuthHeader)
        .send({ horseId, price: LISTING_PRICE, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);
      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${created.body.data.id}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [sellerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(sellerId);
    });

    it('eşzamanlı iki satın alma isteğinden yalnızca BİRİ başarılı olur, diğeri 409 alır (para İKİ KEZ el değiştirmez)', async () => {
      const { listingId, horseId, seller } = await createListing();
      const buyerA = await registerBuyer();
      const buyerB = await registerBuyer();

      const [responseA, responseB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/market/listings/${listingId}/buy`)
          .set('Authorization', buyerA.authHeader)
          .set('Idempotency-Key', randomUUID())
          .send({}),
        request(app.getHttpServer())
          .post(`/api/v1/market/listings/${listingId}/buy`)
          .set('Authorization', buyerB.authHeader)
          .set('Idempotency-Key', randomUUID())
          .send({}),
      ]);

      const statuses = [responseA.status, responseB.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = responseA.status === 200 ? responseB : responseA;
      expect(loser.body.error.code).toBe('LISTING_NOT_ACTIVE');

      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      const newOwnerId: string = horseRow.rows[0].owner_id;
      expect([buyerA.playerId, buyerB.playerId]).toContain(newOwnerId);

      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);

      const loserBuyerId = newOwnerId === buyerA.playerId ? buyerB.playerId : buyerA.playerId;
      const winnerRow = await pool.query('SELECT money FROM players WHERE id = $1', [newOwnerId]);
      expect(Number(winnerRow.rows[0].money)).toBe(5000 - LISTING_PRICE);
      const loserRow = await pool.query('SELECT money FROM players WHERE id = $1', [loserBuyerId]);
      expect(Number(loserRow.rows[0].money)).toBe(5000);

      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('sold');
    });

    it('ilanın satıcısı artık atın gerçek sahibi değilse (stale ilan) 409 LISTING_STALE_OWNER döner, hiçbir şey değişmez', async () => {
      const { listingId, horseId, seller } = await createListing();
      const actualOwner = await registerBuyer();
      await pool.query('UPDATE horses SET owner_id = $2 WHERE id = $1', [horseId, actualOwner.playerId]);
      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_STALE_OWNER');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(actualOwner.playerId);
    });

    it('alıcının ahırı doluysa 409 STABLE_CAPACITY_EXCEEDED döner, hiçbir şey değişmez', async () => {
      const { listingId, horseId, seller } = await createListing();
      const buyer = await registerBuyer();

      for (let i = 0; i < 4; i += 1) {
        await pool.query(
          `INSERT INTO horses (owner_id, name, gender, breed, birth_date, quality, potential)
           VALUES ($1, $2, 'mare', 'Arap', '2023-01-01', 50, 50)`,
          [buyer.playerId, `Dolgu At ${i}`],
        );
      }

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('STABLE_CAPACITY_EXCEEDED');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [seller.playerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(seller.playerId);
      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('active');
    });

    it('satın alma economy_transactions ledger’ına TAM OLARAK iki satır (debit + credit) yazar', async () => {
      const { listingId, seller } = await createListing();
      const buyer = await registerBuyer();

      await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);

      const rows = await pool.query(
        "SELECT * FROM economy_transactions WHERE reference_type = 'market_listing' AND reference_id = $1 ORDER BY type",
        [listingId],
      );
      expect(rows.rows).toHaveLength(2);

      const credit = rows.rows.find((r: { type: string }) => r.type === 'market_purchase_credit');
      const debit = rows.rows.find((r: { type: string }) => r.type === 'market_purchase_debit');
      expect(debit.player_id).toBe(buyer.playerId);
      expect(Number(debit.amount)).toBe(-LISTING_PRICE);
      expect(Number(debit.balance_before)).toBe(5000);
      expect(Number(debit.balance_after)).toBe(5000 - LISTING_PRICE);
      expect(credit.player_id).toBe(seller.playerId);
      expect(Number(credit.amount)).toBe(LISTING_PRICE);
      expect(Number(credit.balance_before)).toBe(5000);
      expect(Number(credit.balance_after)).toBe(5000 + LISTING_PRICE);
    });

    it('fiyatı sıfır olan bir ilanı satın alırken 500 dönmez, mülkiyeti devreder, ledger’a hiçbir satır eklenmez', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 0 })
        .expect(201);
      const listingId = created.body.data.id;
      const buyer = await registerBuyer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.listing.status).toBe('sold');
      expect(response.body.data.buyerBalance.money).toBe(5000);
      expect(response.body.data.sellerBalance.money).toBe(5000);

      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(buyer.playerId);

      const ledgerRows = await pool.query(
        "SELECT * FROM economy_transactions WHERE reference_type = 'market_listing' AND reference_id = $1",
        [listingId],
      );
      expect(ledgerRows.rows).toHaveLength(0);
    });
  });

  describe('DELETE /api/v1/market/listings/:id', () => {
    it('aktif bir ilanı iptal eder (cancelled)', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    });

    it('Authorization header olmadan 401 döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`);
      expect(response.status).toBe(401);
    });

    it('başkasının ilanını iptal etmeye çalışan istek 403 döner (AUDIT_REPORT.md S4)', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);
      const attacker = await registerBuyer();

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', attacker.authHeader);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('var olmayan bir ilan için 404 LISTING_NOT_FOUND döner', async () => {
      const someone = await registerBuyer();
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${randomUUID()}`)
        .set('Authorization', someone.authHeader);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    it('geçersiz (UUID olmayan) bir id için 400 döner', async () => {
      const someone = await registerBuyer();
      const response = await request(app.getHttpServer())
        .delete('/api/v1/market/listings/not-a-uuid')
        .set('Authorization', someone.authHeader);
      expect(response.status).toBe(400);
    });

    it('zaten iptal edilmiş bir ilanı tekrar iptal etmeye çalışırsa 409 LISTING_NOT_ACTIVE döner', async () => {
      const { horseId, authHeader } = await registerSellerWithHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', authHeader)
        .send({ horseId, price: 1000 })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${created.body.data.id}`)
        .set('Authorization', authHeader);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');
    });
  });
});
