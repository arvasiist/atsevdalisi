import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBreedsConfig, loadEconomyConfig } from '@at-sevdalisi/game-config';
import { breedRacingPower, getBreed, getStarterBreed } from '../../src/domain/horse/breeds';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * AT IRKLARI + IRK MAĞAZASI (07.10.2026, migration 0069). Kanıtlananlar:
 * ücretsiz başlangıç atı EN ZAYIF ırktan doğar ve statları o ırktan gelir;
 * mağaza bir PARA YOLUDUR (bakiye + `breed_horse_purchase` defter satırı +
 * at aynı transaction), seviye kapısı, bakiye ve ahır kapasitesi KİLİT
 * ALTINDA denetlenir, reddedilen istek ne para düşer ne at yazar, aynı
 * `Idempotency-Key` ikinci at/ödeme üretmez.
 */
describe('At ırkları + ırk mağazası (e2e)', () => {
  const breeds = loadBreedsConfig();
  const starting = loadEconomyConfig().newPlayerStartingBalance.money;
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
  const buy = (player: RegisteredTestPlayer, breed: string, body: unknown, key: string | null = randomUUID()) => {
    const call = http().post(`/api/v1/breeds/${breed}/purchase`).set('Authorization', player.authHeader);
    return key === null ? call.send(body as object) : call.set('Idempotency-Key', key).send(body as object);
  };
  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);
  const horseCount = async (playerId: string) =>
    Number((await pool.query('SELECT COUNT(*) FROM horses WHERE owner_id = $1', [playerId])).rows[0].count);
  const purchaseLedger = async (playerId: string) =>
    (
      await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'breed_horse_purchase' ORDER BY created_at",
        [playerId],
      )
    ).rows;

  /** Bir atın ırk statları taban ± sapma içinde mi (stat + zemin + mesafe). */
  async function expectBreedStats(horseId: string, breedKey: string): Promise<void> {
    const breed = getBreed(breeds, breedKey);
    const stats = (await pool.query('SELECT * FROM horse_stats WHERE horse_id = $1', [horseId])).rows[0];
    const surface = (await pool.query('SELECT * FROM horse_surface_stats WHERE horse_id = $1', [horseId])).rows[0];
    const distance = (await pool.query('SELECT * FROM horse_distance_stats WHERE horse_id = $1', [horseId])).rows[0];
    for (const [key, base] of Object.entries(breed.stats)) {
      expect(Math.abs(Number(stats[key]) - base!), `stat ${key}`).toBeLessThanOrEqual(breeds.statJitter);
    }
    for (const [key, base] of Object.entries(breed.surface)) {
      expect(Math.abs(Number(surface[key]) - base!), `zemin ${key}`).toBeLessThanOrEqual(breeds.statJitter);
    }
    const columns = { short: 'short_distance', middle: 'middle_distance', long: 'long_distance' } as const;
    for (const [key, base] of Object.entries(breed.distance)) {
      const value = Number(distance[columns[key as keyof typeof columns]]);
      expect(Math.abs(value - base!), `mesafe ${key}`).toBeLessThanOrEqual(breeds.statJitter);
    }
    // Irkın tanımlamadığı ve GİZLİ statlar DB varsayılanında kalır.
    expect(Number(stats.temperament)).toBe(50);
  }

  it('yeni oyuncunun ücretsiz atı en zayıf ırktandır; statları ırktan gelir', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Yeni');
    const starter = getStarterBreed(breeds);
    const row = (await pool.query('SELECT breed, quality, potential FROM horses WHERE id = $1', [player.horseId])).rows[0];
    expect(row.breed).toBe(starter.key);
    expect(Number(row.quality)).toBe(starter.quality);
    expect(Number(row.potential)).toBe(starter.potential);
    await expectBreedStats(player.horseId, starter.key);
    for (const breed of breeds.breeds.filter((candidate) => candidate.key !== starter.key)) {
      expect(breedRacingPower(breed)).toBeGreaterThan(breedRacingPower(starter));
    }
    const view = await http().get(`/api/v1/horses/${player.horseId}`).set('Authorization', player.authHeader).expect(200);
    expect(view.body.data.breed).toBe(starter.key);
  });

  it('girişsiz 401; anahtarsız 400; bilinmeyen ırk 404; bozuk ad/cinsiyet 400 — hiçbiri para düşmez', async () => {
    await http().post('/api/v1/breeds/malakan/purchase').send({ name: 'Kaçak', gender: 'mare' }).expect(401);
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Hatalar');
    await buy(player, 'malakan', { name: 'Anahtarsız', gender: 'mare' }, null).expect(400);
    expect((await buy(player, 'unicorn', { name: 'Tekboynuz', gender: 'mare' }).expect(404)).body.error.code).toBe(
      'BREED_NOT_FOUND',
    );
    expect((await buy(player, 'malakan', { name: 'A', gender: 'mare' }).expect(400)).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await buy(player, 'malakan', { name: 'Cinsiyetsiz', gender: 'unicorn' }).expect(400)).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
    await buy(player, 'malakan', { name: 12, gender: 'mare' }).expect(400);
    expect(await money(player.playerId)).toBe(starting);
    expect(await horseCount(player.playerId)).toBe(1);
    expect(await purchaseLedger(player.playerId)).toHaveLength(0);
  });

  it('seviye kapısı 409 BREED_LEVEL_LOCKED; yetersiz para 409 INSUFFICIENT_FUNDS', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Kilit');
    const thoroughbred = getBreed(breeds, 'thoroughbred');
    expect(thoroughbred.minPlayerLevel).toBeGreaterThan(1);
    const locked = await buy(player, 'thoroughbred', { name: 'Erken Şampiyon', gender: 'stallion' }).expect(409);
    expect(locked.body.error.code).toBe('BREED_LEVEL_LOCKED');

    // Seviye tamam ama para yetmiyor (başlangıç bakiyesi < en pahalı ırk).
    expect(thoroughbred.priceMoney).toBeGreaterThan(starting);
    await pool.query('UPDATE players SET level = $2 WHERE id = $1', [player.playerId, thoroughbred.minPlayerLevel]);
    const poor = await buy(player, 'thoroughbred', { name: 'Pahalı Hayal', gender: 'stallion' }).expect(409);
    expect(poor.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await money(player.playerId)).toBe(starting);
    expect(await horseCount(player.playerId)).toBe(1);
    expect(await purchaseLedger(player.playerId)).toHaveLength(0);
  });

  it('alım: at ahıra katılır, para düşer, defter satırı ata bağlı; aynı anahtar ikinci kez ödetmez', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Alıcı');
    const malakan = getBreed(breeds, 'malakan');
    expect(malakan.minPlayerLevel).toBe(1);
    expect(malakan.priceMoney).toBeLessThanOrEqual(starting);
    const key = randomUUID();

    const response = await buy(player, 'malakan', { name: '  Kars Yıldızı  ', gender: 'stallion' }, key).expect(201);
    const result = response.body.data;
    expect(result.price).toBe(malakan.priceMoney);
    expect(result.money).toBe(starting - malakan.priceMoney);
    expect(result.horse.breed).toBe('malakan');
    expect(result.horse.name).toBe('Kars Yıldızı');
    expect(result.horse.gender).toBe('stallion');
    expect(result.horse.ownerId).toBe(player.playerId);
    // Gizli potansiyel ham olarak dışarı çıkmaz (PublicHorse).
    expect(result.horse.potential).toBeUndefined();

    const row = (await pool.query('SELECT * FROM horses WHERE id = $1', [result.horse.id])).rows[0];
    expect(row.owner_id).toBe(player.playerId);
    expect(Number(row.quality)).toBe(malakan.quality);
    expect(Number(row.potential)).toBe(malakan.potential);
    expect(Object.keys(malakan.coatWeights ?? {})).toContain(row.coat_color);
    await expectBreedStats(result.horse.id, 'malakan');
    const health = await pool.query('SELECT COUNT(*) FROM horse_health WHERE horse_id = $1', [result.horse.id]);
    expect(Number(health.rows[0].count)).toBe(1);

    expect(await money(player.playerId)).toBe(starting - malakan.priceMoney);
    const ledger = await purchaseLedger(player.playerId);
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(-malakan.priceMoney);
    expect(ledger[0].currency).toBe('money');
    expect(ledger[0].reference_type).toBe('horses');
    expect(ledger[0].reference_id).toBe(result.horse.id);
    expect(Number(ledger[0].balance_before)).toBe(starting);
    expect(Number(ledger[0].balance_after)).toBe(starting - malakan.priceMoney);
    expect(ledger[0].idempotency_key).toBe(key);

    // Yanıt kayboldu, oyuncu aynı isteği tekrar bastı: aynı sonuç, ikinci at YOK.
    const replay = await buy(player, 'malakan', { name: '  Kars Yıldızı  ', gender: 'stallion' }, key).expect(201);
    expect(replay.body.data.horse.id).toBe(result.horse.id);
    expect(await horseCount(player.playerId)).toBe(2);
    expect(await purchaseLedger(player.playerId)).toHaveLength(1);
    expect(await money(player.playerId)).toBe(starting - malakan.priceMoney);

    // Cüzdan geçmişinde görünür (kanonik tür MARKET).
    const wallet = await http()
      .get(`/api/v1/players/${player.playerId}/wallet`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const entry = (wallet.body.data.transactions as Array<{ type: string; canonicalType: string }>).find(
      (item) => item.type === 'breed_horse_purchase',
    );
    expect(entry?.canonicalType).toBe('MARKET');
  });

  it('seviyesi ve parası yeten oyuncu güçlü ırkı alır', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Şampiyon');
    const thoroughbred = getBreed(breeds, 'thoroughbred');
    await pool.query('UPDATE players SET level = $2, money = $3 WHERE id = $1', [
      player.playerId,
      thoroughbred.minPlayerLevel,
      thoroughbred.priceMoney,
    ]);
    const response = await buy(player, 'thoroughbred', { name: 'Hipodrom Kralı', gender: 'mare' }).expect(201);
    expect(response.body.data.money).toBe(0);
    await expectBreedStats(response.body.data.horse.id, 'thoroughbred');
  });

  it('ahır doluysa 409 STABLE_CAPACITY_EXCEEDED ve para düşmez', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Irk Dolu Ahır');
    await pool.query('UPDATE players SET money = 1000000 WHERE id = $1', [player.playerId]);
    const hinis = getStarterBreed(breeds);
    // 1. seviye ahır kapasitesine kadar doldur (mağazanın kendisiyle).
    let bought = 0;
    for (;;) {
      const attempt = await buy(player, hinis.key, { name: `Dolgu ${bought}`, gender: 'gelding' });
      if (attempt.status !== 201) {
        expect(attempt.status).toBe(409);
        expect(attempt.body.error.code).toBe('STABLE_CAPACITY_EXCEEDED');
        break;
      }
      bought += 1;
      expect(bought).toBeLessThan(50);
    }
    expect(bought).toBeGreaterThan(0);
    expect(await money(player.playerId)).toBe(1_000_000 - bought * hinis.priceMoney);
    expect(await purchaseLedger(player.playerId)).toHaveLength(bought);
  });
});
