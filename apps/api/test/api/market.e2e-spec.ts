import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';
import { PG_POOL } from '../../src/infrastructure/database/database.module';

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
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Market — At Pazarı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    pool = moduleRef.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueUsername(): string {
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  async function registerPlayerWithStarterHorse(): Promise<{ horseId: string; playerId: string }> {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'At Pazarı Oyuncusu' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${playerId}`).expect(200);
    return { horseId: listResponse.body.data[0].id, playerId };
  }

  async function registerPlayer(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Alıcı' })
      .expect(201);
    return response.body.data.id;
  }

  describe('POST /api/v1/market/listings', () => {
    it('geçerli bir at + fiyat ile yeni bir ilan oluşturur (201), sellerId atın sahibidir', async () => {
      const { horseId, playerId } = await registerPlayerWithStarterHorse();

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.horseId).toBe(horseId);
      expect(response.body.data.sellerId).toBe(playerId);
      expect(response.body.data.price).toBe(1000);
      expect(response.body.data.listingType).toBe('fixed_price');
      expect(response.body.data.status).toBe('active');
    });

    it('var olmayan bir at için 404 HORSE_NOT_FOUND döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId: randomUUID(), price: 1000 });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
    });

    it('aynı at için ikinci bir ilan oluşturmaya çalışılırsa 409 HORSE_ALREADY_LISTED döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      await request(app.getHttpServer()).post('/api/v1/market/listings').send({ horseId, price: 1000 }).expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1500 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('HORSE_ALREADY_LISTED');
    });

    it('negatif bir fiyat için 400 döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: -100 });
      expect(response.status).toBe(400);
    });

    // FAZ 1 wiring, on üçüncü dilim — `expiresInHours` (opsiyonel).
    it('expiresInHours verilirse ilerideki bir expiresAt ile ilan oluşturur', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const before = Date.now();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000, expiresInHours: 48 })
        .expect(201);

      expect(response.body.data.expiresAt).not.toBeNull();
      const expiresAtMs = new Date(response.body.data.expiresAt).getTime();
      // Tolerans: istek süresi + saat hassasiyeti farkları için birkaç saniye.
      expect(expiresAtMs).toBeGreaterThan(before + 47 * 3600 * 1000);
      expect(expiresAtMs).toBeLessThan(before + 49 * 3600 * 1000);
    });

    it('expiresInHours 0 veya negatifse 400 INVALID_LISTING_EXPIRY döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000, expiresInHours: 0 });
      expect(response.status).toBe(400);
    });

    it('expiresInHours üst sınırı (720) aşarsa 400 döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000, expiresInHours: 721 });
      expect(response.status).toBe(400);
    });

    // `findActiveByHorseId`'nin de süresi geçmiş ilanları süpürdüğünü
    // doğrular (bkz. `PostgresMarketListingRepository.sweepExpiredListings`
    // doc yorumu) — süpürme OLMASAYDI bu istek YANLIŞLIKLA 409
    // HORSE_ALREADY_LISTED dönerdi.
    it('süresi dolmuş eski bir ilan varken aynı at için YENİ bir ilan oluşturulabilir', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const old = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        old.body.data.id,
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 2000 });

      expect(response.status).toBe(201);
      const oldRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [old.body.data.id]);
      expect(oldRow.rows[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/listings (tarama)', () => {
    // NOT — bu describe bloğu tüm dosyanın PAYLAŞTIĞI tek bir veritabanına
    // yazıyor (diğer test'lerin de ilan oluşturduğu AYNI `market_listings`
    // tablosu); "tüm ilanları say" gibi TOPLU bir iddia diğer test'lerin
    // verisiyle KİRLENİR. Bunun yerine her test kendine özgü, ÇOK
    // OLASILIKSIZ bir fiyat (ör. 61xxxx) kullanır ve `minPrice`/`maxPrice`
    // ile SADECE o fiyat aralığını sorgular — bu, `LISTING_PRICE = 1000`
    // gibi diğer test'lerin paylaştığı fiyatlarla ASLA çakışmaz.

    it('status verilmezse yalnızca active durumdaki ilanları döner', async () => {
      const uniquePrice = 611001;
      const active = await registerPlayerWithStarterHorse();
      const activeListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId: active.horseId, price: uniquePrice })
        .expect(201);

      const cancelled = await registerPlayerWithStarterHorse();
      const cancelledListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId: cancelled.horseId, price: uniquePrice })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/market/listings/${cancelledListing.body.data.id}`)
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
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: uniquePrice })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`).expect(200);

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
      const low = await registerPlayerWithStarterHorse();
      const lowListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId: low.horseId, price: base + 1 })
        .expect(201);
      const high = await registerPlayerWithStarterHorse();
      const highListing = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
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
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          const { horseId } = await registerPlayerWithStarterHorse();
          await request(app.getHttpServer())
            .post('/api/v1/market/listings')
            .send({ horseId, price: uniquePrice })
            .expect(201);
        }),
      );

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

    it('page 1\'den küçükse 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/listings?page=0');
      expect(response.status).toBe(400);
    });

    // FAZ 1 wiring, on üçüncü dilim — `search`'ün de süresi dolmuş ilanları
    // süpürdüğünü doğrular (bkz. `sweepExpiredListings` doc yorumu).
    it('süresi dolmuş bir ilan varsayılan (active) taramada görünmez, status=expired ile görünür', async () => {
      const uniquePrice = 644004;
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
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

      // DB'de GERÇEKTEN güncellendi mi (yalnızca sorgu sonucunda hesaplanan
      // bir değer DEĞİL)?
      const row = await pool.query('SELECT status FROM market_listings WHERE id = $1', [created.body.data.id]);
      expect(row.rows[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/my-listings (İlanlarım)', () => {
    it('sellerId eksikse 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/my-listings');
      expect(response.status).toBe(400);
    });

    it('sellerId geçerli bir UUID değilse 400 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/market/my-listings?sellerId=not-a-uuid');
      expect(response.status).toBe(400);
    });

    it('hiç ilanı olmayan (var olmayan) bir satıcı için boş dizi döner', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/market/my-listings?sellerId=${randomUUID()}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('status verilmezse satıcının TÜM durumlardaki ilanlarını döner', async () => {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1234 })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`).expect(200);

      const response = await request(app.getHttpServer()).get(`/api/v1/market/my-listings?sellerId=${sellerId}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(created.body.data.id);
      expect(response.body.data[0].status).toBe('cancelled');
    });

    it('status verilirse yalnızca o durumdaki ilanları döner', async () => {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1234 })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`).expect(200);

      const activeOnly = await request(app.getHttpServer()).get(
        `/api/v1/market/my-listings?sellerId=${sellerId}&status=active`,
      );
      expect(activeOnly.status).toBe(200);
      expect(activeOnly.body.data).toEqual([]);

      const cancelledOnly = await request(app.getHttpServer()).get(
        `/api/v1/market/my-listings?sellerId=${sellerId}&status=cancelled`,
      );
      expect(cancelledOnly.status).toBe(200);
      expect(cancelledOnly.body.data).toHaveLength(1);
      expect(cancelledOnly.body.data[0].id).toBe(created.body.data.id);
    });

    it('geçersiz bir status için 400 döner', async () => {
      const sellerId = await registerPlayer();
      const response = await request(app.getHttpServer()).get(
        `/api/v1/market/my-listings?sellerId=${sellerId}&status=not-a-status`,
      );
      expect(response.status).toBe(400);
    });

    // FAZ 1 wiring, on üçüncü dilim — `findBySellerId`'nin de süpürdüğünü
    // doğrular (`search`'ten AYRI bir SQL sorgu yolu — `sweepExpiredListings`
    // doc yorumu).
    it('süresi dolmuş bir ilan status verilmeden İlanlarım\'da expired durumunda görünür', async () => {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1234, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);

      const response = await request(app.getHttpServer()).get(`/api/v1/market/my-listings?sellerId=${sellerId}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('expired');
    });
  });

  describe('GET /api/v1/market/listings/:id', () => {
    it('var olan bir ilanı döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
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

    // FAZ 1 wiring, on üçüncü dilim — `findById`'nin de süpürdüğünü
    // doğrular.
    it('süresi dolmuş bir ilanı id\'siyle getirince status expired döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
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
    // newPlayerStartingBalance.money = 5000 (config/economy.config.json) —
    // 1000'lik bir ilan hem satıcıya (zaten sahip) hem alıcıya (yeni
    // oyuncu, 5000 ile başlıyor) rahatça sığar.
    const LISTING_PRICE = 1000;

    async function createListing(): Promise<{ listingId: string; horseId: string; sellerId: string }> {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: LISTING_PRICE })
        .expect(201);
      return { listingId: created.body.data.id, horseId, sellerId };
    }

    it('yeterli bakiyeyle satın alır: parayı alıcıdan düşer, satıcıya ekler, atın sahibini değiştirir, ilanı sold yapar', async () => {
      const { listingId, horseId, sellerId } = await createListing();
      const buyerId = await registerPlayer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.listing.status).toBe('sold');
      expect(response.body.data.buyerBalance.money).toBe(5000 - LISTING_PRICE);
      expect(response.body.data.sellerBalance.money).toBe(5000 + LISTING_PRICE);

      // At GERÇEKTEN el değiştirdi mi?
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(buyerId);

      // İlan GERÇEKTEN sold oldu mu (DB'de)?
      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('sold');

      // Bakiyeler DB'de de doğru mu (BIGINT sütun — pg string döner,
      // bkz. race.e2e-spec.ts/stable.e2e-spec.ts'teki AYNI not)?
      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000 - LISTING_PRICE);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [sellerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);
    });

    it('Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner ve HİÇBİR ŞEY değişmez', async () => {
      const { listingId, sellerId } = await createListing();
      const buyerId = await registerPlayer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .send({ buyerId });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const listing = await request(app.getHttpServer()).get(`/api/v1/market/listings/${listingId}`);
      expect(listing.body.data.status).toBe('active');
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [sellerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
    });

    it('AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR para el değiştirmez', async () => {
      const { listingId, sellerId } = await createListing();
      const buyerId = await registerPlayer();
      const idempotencyKey = randomUUID();

      const first = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ buyerId })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ buyerId })
        .expect(200);

      expect(second.body.data).toEqual(first.body.data);

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000 - LISTING_PRICE);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [sellerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000 + LISTING_PRICE);
    });

    it('kendi ilanını satın almaya çalışırsa 400 CANNOT_BUY_OWN_LISTING döner', async () => {
      const { listingId, sellerId } = await createListing();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId: sellerId });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CANNOT_BUY_OWN_LISTING');
    });

    it('alıcının bakiyesi yetersizse 409 INSUFFICIENT_FUNDS döner ve HİÇBİR ŞEY değişmez', async () => {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 999999 })
        .expect(201);
      const listingId = created.body.data.id;

      const buyerId = await registerPlayer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const listingRow = await pool.query('SELECT status FROM market_listings WHERE id = $1', [listingId]);
      expect(listingRow.rows[0].status).toBe('active');
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(sellerId);
    });

    it('zaten satılmış bir ilan için 409 LISTING_NOT_ACTIVE döner', async () => {
      const { listingId } = await createListing();
      const firstBuyerId = await registerPlayer();
      await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId: firstBuyerId })
        .expect(200);

      const secondBuyerId = await registerPlayer();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${listingId}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId: secondBuyerId });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');
    });

    it('var olmayan bir ilan için 404 LISTING_NOT_FOUND döner', async () => {
      const buyerId = await registerPlayer();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${randomUUID()}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    // FAZ 1 wiring, on üçüncü dilim — `findById`'nin süpürmesi, `buy`'ın
    // GÖRDÜĞÜ listing'i de kapsar: `purchaseListing`'in KENDİ süre
    // kontrolüne hiç ulaşılmaz (status ÖNCEDEN expired'a çevrilir), bu
    // yüzden `409 LISTING_EXPIRED` DEĞİL `409 LISTING_NOT_ACTIVE` döner
    // (bkz. `PostgresMarketListingRepository.sweepExpiredListings` doc
    // yorumu, docs/API.md §5 "İlan süresi dolma" notu).
    it('süresi dolmuş bir ilanı satın almaya çalışırsa 409 LISTING_NOT_ACTIVE döner, hiçbir şey değişmez', async () => {
      const { horseId, playerId: sellerId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: LISTING_PRICE, expiresInHours: 1 })
        .expect(201);
      await pool.query("UPDATE market_listings SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        created.body.data.id,
      ]);
      const buyerId = await registerPlayer();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${created.body.data.id}/buy`)
        .set('Idempotency-Key', randomUUID())
        .send({ buyerId });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');

      const buyerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyerId]);
      expect(Number(buyerRow.rows[0].money)).toBe(5000);
      const sellerRow = await pool.query('SELECT money FROM players WHERE id = $1', [sellerId]);
      expect(Number(sellerRow.rows[0].money)).toBe(5000);
      const horseRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
      expect(horseRow.rows[0].owner_id).toBe(sellerId);
    });
  });

  describe('DELETE /api/v1/market/listings/:id', () => {
    it('aktif bir ilanı iptal eder (cancelled)', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    });

    it('var olmayan bir ilan için 404 LISTING_NOT_FOUND döner', async () => {
      const response = await request(app.getHttpServer()).delete(`/api/v1/market/listings/${randomUUID()}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    it('zaten iptal edilmiş bir ilanı tekrar iptal etmeye çalışırsa 409 LISTING_NOT_ACTIVE döner', async () => {
      const { horseId } = await registerPlayerWithStarterHorse();
      const created = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .send({ horseId, price: 1000 })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`).expect(200);

      const response = await request(app.getHttpServer()).delete(`/api/v1/market/listings/${created.body.data.id}`);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LISTING_NOT_ACTIVE');
    });
  });
});
