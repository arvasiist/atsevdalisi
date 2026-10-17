import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCareConfig } from '@at-sevdalisi/game-config';
import type { FeedItemView, PublicHorse } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 16.10.2026 — yem / takviye / ilaç + tay yemi (brief §7–§8). Kanıtlanan:
 * satın alma + stok + kullanım sunucuda; tay yemi yalnızca tay/gelişim çağına
 * ve yarış statına kalıcı, TAVANLI katkı verir (aynı transaction); ilaç
 * veteriner "reçetesi" ister ve sakatlık riskini düşürür.
 */
const care = loadCareConfig();

describe('Yem kategorileri + tay yetiştirme (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function buy(player: RegisteredTestPlayer, type: string, count: number) {
    return request(app.getHttpServer())
      .post(`/api/v1/players/${player.playerId}/feed-inventory/${type}/buy`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ count });
  }

  function feed(player: RegisteredTestPlayer, horseId: string, feedType: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .set('Authorization', player.authHeader)
      .send({ feedType });
  }

  /** Test kısayolu: atı 3 oyun ayı yaşında bir taya çevirir (yaş çıpasıyla birlikte). */
  async function makeFoal(horseId: string): Promise<void> {
    await pool.query(
      `UPDATE horses SET birth_date = (now() - interval '3 months')::date, aging_started_at = now() WHERE id = $1`,
      [horseId],
    );
  }

  async function stat(horseId: string, column: string): Promise<number> {
    const result = await pool.query(`SELECT ${column} FROM horse_stats WHERE horse_id = $1`, [horseId]);
    return Number(result.rows[0][column]);
  }

  it('envanter yeni kalemleri kategori + kullanım koşuluyla listeler; satın alma oyun parası + defter', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Kategori');
    await pool.query('UPDATE players SET money = 5000 WHERE id = $1', [player.playerId]);
    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/feed-inventory`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const items = inventory.body.data.items as FeedItemView[];
    const byType = new Map(items.map((item) => [item.type, item]));
    expect(byType.get('tay_yemi')).toMatchObject({ category: 'foal', allowedLifeStages: ['foal', 'development'] });
    expect(byType.get('agri_kesici')).toMatchObject({ category: 'medicine', requiresVetWithinHours: 24 });
    expect(byType.get('elektrolit')?.category).toBe('supplement');
    expect(byType.get('yulaf')?.category).toBe('feed');

    const bought = await buy(player, 'yulaf', 2).expect(200);
    expect(bought.body.data.totalCost).toBe(2 * care.feedTypes.yulaf.price!.amount);
    const ledger = await pool.query("SELECT amount FROM economy_transactions WHERE player_id = $1 AND type = 'feed_purchase'", [player.playerId]);
    expect(ledger.rows.map((row) => Number(row.amount))).toEqual([-2 * care.feedTypes.yulaf.price!.amount]);
    await feed(player, player.horseId, 'yulaf').expect(200);
  });

  it('tay yemi yetişkine verilemez (409, stok düşmez); taya verilince stat kalıcı + tavanlı artar', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Tay Büyüten');
    await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [player.playerId]);
    await buy(player, 'tay_yemi', 3).expect(200);

    const adult = await feed(player, player.horseId, 'tay_yemi').expect(409);
    expect(adult.body.error.code).toBe('FEED_NOT_ALLOWED_FOR_AGE');
    const stock = await pool.query("SELECT quantity FROM player_feed_inventory WHERE player_id = $1 AND item_type = 'tay_yemi'", [player.playerId]);
    expect(stock.rows[0].quantity).toBe(3);

    await makeFoal(player.horseId);
    await pool.query('UPDATE horses SET potential = 90 WHERE id = $1', [player.horseId]);
    const firstStat = care.upbringing.statRotation[0]!;
    const before = await stat(player.horseId, firstStat);
    const fed = await feed(player, player.horseId, 'tay_yemi').expect(200);
    expect(fed.body.data.upbringingGain).toEqual({ stat: firstStat, amount: care.feedTypes.tay_yemi.upbringingStatGain });
    expect(await stat(player.horseId, firstStat)).toBeCloseTo(before + care.feedTypes.tay_yemi.upbringingStatGain!, 2);

    // Ahır listesi ilerlemeyi + kalan maliyeti gösterir.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const horse = (list.body.data as PublicHorse[]).find((row) => row.id === player.horseId)!;
    expect(horse.upbringing).toEqual({
      feedType: 'tay_yemi',
      feedsUsed: 1,
      feedsMax: care.upbringing.maxFeedsPerHorse,
      gainPerFeed: care.feedTypes.tay_yemi.upbringingStatGain,
      unitPrice: care.feedTypes.tay_yemi.price!.amount,
      remainingCost: (care.upbringing.maxFeedsPerHorse - 1) * care.feedTypes.tay_yemi.price!.amount,
    });

    // Tavan: ömür boyu hak dolunca kazanç yok (besleme yine vital verir).
    for (let index = 0; index < care.upbringing.maxFeedsPerHorse; index++) {
      await pool.query("INSERT INTO horse_feed_log (horse_id, player_id, item_type, fed_at) VALUES ($1, $2, 'tay_yemi', now() - interval '2 days')", [
        player.horseId,
        player.playerId,
      ]);
    }
    const capped = await feed(player, player.horseId, 'tay_yemi').expect(200);
    expect(capped.body.data.upbringingGain).toBeUndefined();
  });

  it('ilaç veteriner reçetesi ister: önce 409; veteriner bakımından sonra verilir ve sakatlık riskini düşürür', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'İlaç');
    await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [player.playerId]);
    await buy(player, 'agri_kesici', 1).expect(200);
    const blocked = await feed(player, player.horseId, 'agri_kesici').expect(409);
    expect(blocked.body.error.code).toBe('FEED_REQUIRES_VET_CHECK');

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'vet' })
      .expect(200);
    await pool.query('UPDATE horse_health SET injury_risk = 40 WHERE horse_id = $1', [player.horseId]);
    const given = await feed(player, player.horseId, 'agri_kesici').expect(200);
    expect(given.body.data.newHealth.injuryRisk).toBe(40 + care.feedTypes.agri_kesici.injuryRiskDelta!);
    // Günlük sınır 1: ikinci doz aynı gün verilemez.
    await buy(player, 'agri_kesici', 1).expect(200);
    expect((await feed(player, player.horseId, 'agri_kesici').expect(409)).body.error.code).toBe('DAILY_FEED_LIMIT_REACHED');
  });
});
