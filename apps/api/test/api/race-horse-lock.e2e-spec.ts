import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * AÇIK YARIŞTAKİ AT KİLİDİ (30.09.2026) — `HORSE_IN_ACTIVE_RACE`.
 *
 * Bu dilimden önce bir at, ücretli bir lobi yarışına yazıldıktan sonra
 * pazarda satılabiliyordu: yeni sahibinin atı ESKİ sahibi adına koşuyor ve
 * ödülü SATICI alıyordu (katılım satırının `player_id`si satıcıdır). Aynı at
 * aynı anda birden çok açık yarışa da yazılabiliyordu. Hiçbiri hata
 * üretmiyordu.
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *  1. Açık yarıştaki at İKİNCİ bir açık yarışa yazılamaz (409) ve para
 *     hareket etmez.
 *  2. Açık yarıştaki at pazara ÇIKARILAMAZ (409).
 *  3. Pazarda ilanı olan at yarışa YAZILAMAZ (409 `HORSE_LISTED_IN_MARKET` —
 *     pratik yarış ve antrenmanla AYNI kural).
 *  4. Asıl garanti satın alma transaction'ındadır: ilan ile katılım bir
 *     şekilde yan yana düşse bile (ön kontrolü atlatan TOCTOU) SATIN ALMA
 *     reddedilir; sahiplik ve bakiyeler DEĞİŞMEZ.
 *  5. Kilit durum-temellidir: oyuncu yarıştan AYRILINCA at yeniden serbesttir.
 */
describe('Açık yarıştaki at kilidi (e2e) — HORSE_IN_ACTIVE_RACE', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  const listingsUrl = '/api/v1/market/listings';
  const ENTRY_FEE = 50;

  async function createRace(creator: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'At Kilidi Kupası',
        fieldSize: 12,
        maxPlayers: 8,
        entryFee: ENTRY_FEE,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    return response.body.data.id as string;
  }

  function join(player: RegisteredTestPlayer, raceId: string) {
    return request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId });
  }

  function createListing(player: RegisteredTestPlayer) {
    return request(app.getHttpServer())
      .post(listingsUrl)
      .set('Authorization', player.authHeader)
      .send({ horseId: player.horseId, price: 1_000 });
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0].money);
  }

  async function ownerOf(horseId: string): Promise<string> {
    const result = await pool.query<{ owner_id: string }>('SELECT owner_id FROM horses WHERE id = $1', [horseId]);
    return result.rows[0].owner_id;
  }

  it('açık yarıştaki at İKİNCİ bir açık yarışa yazılamaz — 409, para hareket etmez', async () => {
    const creatorA = await registerTestPlayerWithStarterHorse(app, 'Kilit Kuran A');
    const creatorB = await registerTestPlayerWithStarterHorse(app, 'Kilit Kuran B');
    const racer = await registerTestPlayerWithStarterHorse(app, 'Çift Yarışçı');
    const raceA = await createRace(creatorA);
    const raceB = await createRace(creatorB);

    await join(racer, raceA).expect(200);
    const moneyAfterFirst = await moneyOf(racer.playerId);

    const second = await join(racer, raceB).expect(409);
    expect(second.body.error.code).toBe('HORSE_IN_ACTIVE_RACE');

    expect(await moneyOf(racer.playerId)).toBe(moneyAfterFirst);
    const entries = await pool.query('SELECT 1 FROM race_entries WHERE race_id = $1', [raceB]);
    expect(entries.rows.length).toBe(0);
  });

  it('açık yarıştaki at pazara ÇIKARILAMAZ — 409, ilan yazılmaz', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'İlan Kilidi Kuran');
    const racer = await registerTestPlayerWithStarterHorse(app, 'Satmak İsteyen');
    const raceId = await createRace(creator);
    await join(racer, raceId).expect(200);

    const response = await createListing(racer).expect(409);
    expect(response.body.error.code).toBe('HORSE_IN_ACTIVE_RACE');

    const listings = await pool.query('SELECT 1 FROM market_listings WHERE horse_id = $1', [racer.horseId]);
    expect(listings.rows.length).toBe(0);
  });

  it('pazarda ilanı olan at yarışa YAZILAMAZ — 409 HORSE_LISTED_IN_MARKET, para hareket etmez', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Pazar Kilidi Kuran');
    const seller = await registerTestPlayerWithStarterHorse(app, 'Önce Satışa Koyan');
    const raceId = await createRace(creator);
    await createListing(seller).expect(201);
    const before = await moneyOf(seller.playerId);

    const response = await join(seller, raceId).expect(409);
    expect(response.body.error.code).toBe('HORSE_LISTED_IN_MARKET');
    expect(await moneyOf(seller.playerId)).toBe(before);
  });

  it('ilan + katılım yan yana düşse bile SATIN ALMA reddedilir — sahiplik ve bakiyeler değişmez', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'TOCTOU Kuran');
    const seller = await registerTestPlayerWithStarterHorse(app, 'TOCTOU Satıcı');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'TOCTOU Alıcı');
    const raceId = await createRace(creator);
    const listing = await createListing(seller).expect(201);
    const listingId = listing.body.data.id as string;

    // Ön kontrolleri atlatan eşzamanlı bir katılımı taklit eder: katılım
    // satırını doğrudan yazar. Asıl kapı satın alma transaction'ıdır.
    await pool.query(
      `INSERT INTO race_entries (id, race_id, horse_id, player_id, gate_position, status, created_at)
       VALUES ($1, $2, $3, $4, 1, 'waiting', NOW())`,
      [randomUUID(), raceId, seller.horseId, seller.playerId],
    );
    const sellerBefore = await moneyOf(seller.playerId);
    const buyerBefore = await moneyOf(buyer.playerId);

    const response = await request(app.getHttpServer())
      .post(`${listingsUrl}/${listingId}/buy`)
      .set('Authorization', buyer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(response.body.error.code).toBe('HORSE_IN_ACTIVE_RACE');

    expect(await ownerOf(seller.horseId)).toBe(seller.playerId);
    expect(await moneyOf(seller.playerId)).toBe(sellerBefore);
    expect(await moneyOf(buyer.playerId)).toBe(buyerBefore);
    const status = await pool.query<{ status: string }>('SELECT status FROM market_listings WHERE id = $1', [listingId]);
    expect(status.rows[0].status).toBe('active');
  });

  it('yarıştan AYRILAN oyuncunun atı yeniden serbesttir — ilan açılabilir', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Serbest Kuran');
    const racer = await registerTestPlayerWithStarterHorse(app, 'Vazgeçen');
    const raceId = await createRace(creator);
    await join(racer, raceId).expect(200);
    await createListing(racer).expect(409);

    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/leave`)
      .set('Authorization', racer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    await createListing(racer).expect(201);
  });
});
