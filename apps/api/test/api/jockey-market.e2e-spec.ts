import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Jockey } from '@at-sevdalisi/shared-types';
import { loadEconomyConfig, loadJockeyConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { calculateJockeySkillComposite } from '../../src/domain/jockey/jockey';
import { findMarketBand, jockeySalaryFor } from '../../src/domain/jockey/market';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 14.10.2026 — kiralık jokey ARZI (`docs/OYUN_DONGUSU_DENETIMI.md` B4).
 *
 * Eskiden jokey satırı yalnızca geliştirme seed'indeydi: üretimde `GET
 * /jockeys` boş dönüyordu. Artık her beceri bandında en az `available` jokey
 * kalır; kiralanan jokeyin yerine yenisi gelir.
 *
 * ⚠️ Testler EN DÜŞÜK bandı kullanır: diğer e2e dosyaları (paralel koşar)
 * jokeylerini 50/70/95 becerisiyle yaratır, yani o bant yalnızca pazarın
 * ürettiklerini içerir — başkasının jokeyine dokunulmaz.
 */
const CONFIG = loadJockeyConfig();
const LOWEST = CONFIG.market.bands[0]!;
const JOCKEYS_URL = '/api/v1/jockeys';

describe('Jokey pazarı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  async function listJockeys(player: RegisteredTestPlayer): Promise<Jockey[]> {
    const response = await request(app.getHttpServer())
      .get(JOCKEYS_URL)
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data as Jockey[];
  }

  function inLowestBand(jockeys: Jockey[]): Jockey[] {
    return jockeys.filter((jockey) => findMarketBand(calculateJockeySkillComposite(jockey, CONFIG), [LOWEST]) !== null);
  }

  /** En düşük banttaki sahipsiz jokeyleri test oyuncusuna yazar (kurulum — üretim yolu DEĞİL). */
  async function drainLowestBand(owner: RegisteredTestPlayer, jockeys: Jockey[]): Promise<string[]> {
    const ids = inLowestBand(jockeys).map((jockey) => jockey.id);
    await pool.query('UPDATE jockeys SET owner_id = $1 WHERE id = ANY($2::uuid[]) AND owner_id IS NULL', [
      owner.playerId,
      ids,
    ]);
    return ids;
  }

  it('vitrin her beceri bandında en az `available` jokey taşır (boş kalmaz)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Pazar Bakan');
    const jockeys = await listJockeys(player);
    for (const band of CONFIG.market.bands) {
      const count = jockeys.filter(
        (jockey) => findMarketBand(calculateJockeySkillComposite(jockey, CONFIG), [band]) !== null,
      ).length;
      expect(count).toBeGreaterThanOrEqual(band.available);
    }
    // Bedel sunucuda kompozitten türetilir; yanıt SAYI taşır (BIGINT metin değil).
    for (const jockey of inLowestBand(jockeys)) {
      expect(typeof jockey.salary).toBe('number');
      expect(jockey.salary).toBe(jockeySalaryFor(calculateJockeySkillComposite(jockey, CONFIG), CONFIG.market));
    }
  });

  it('bant boşalınca YENİ jokey üretilir; giden jokey vitrinde görünmez', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Pazar Boşaltan');
    const drained = await drainLowestBand(player, await listJockeys(player));
    expect(drained.length).toBeGreaterThanOrEqual(LOWEST.available);

    const after = inLowestBand(await listJockeys(player));
    expect(after.length).toBeGreaterThanOrEqual(LOWEST.available);
    for (const jockey of after) {
      expect(drained).not.toContain(jockey.id);
    }
  });

  it('eşzamanlı vitrin istekleri eksiği İKİ KEZ üretmez (pazar kilidi)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Pazar Yarışçısı');
    await drainLowestBand(player, await listJockeys(player));

    await Promise.all(Array.from({ length: 6 }, () => listJockeys(player)));

    // Kilitsiz olsaydı her istek eksiği ayrı ayrı üretir, bant 6 × `available` olurdu.
    expect(inLowestBand(await listJockeys(player))).toHaveLength(LOWEST.available);
  });

  it('YENİ OYUNCU başlangıç bakiyesiyle en ucuz jokeyi kiralayabilir (para yolu + defter)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Ilk Jokeyim');
    // Yalnızca pazarın ürettiği bant: diğer dosyaların test jokeyine dokunulmaz (vitrin maaşa göre artan).
    const cheapest = inLowestBand(await listJockeys(player))[0]!;
    const startingMoney = loadEconomyConfig().newPlayerStartingBalance.money;
    expect(cheapest.salary).toBeLessThanOrEqual(startingMoney);

    const response = await request(app.getHttpServer())
      .post(`${JOCKEYS_URL}/${cheapest.id}/hire`)
      .set('Authorization', player.authHeader)
      .expect(201);
    expect(response.body.data.paid).toBe(cheapest.salary);

    const ledger = await pool.query<{ amount: string }>(
      "SELECT amount FROM economy_transactions WHERE player_id = $1 AND type = 'jockey_hire'",
      [player.playerId],
    );
    expect(ledger.rows.map((row) => Number(row.amount))).toEqual(cheapest.salary > 0 ? [-cheapest.salary] : []);
  });
});
