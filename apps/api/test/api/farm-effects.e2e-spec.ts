import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  discountedTotal,
  getPaddockRecoveryMultiplier,
  getWarehouseFeedCostMultiplier,
} from '../../src/domain/farm/farm';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * ÇİFTLİK TESİSİ ETKİLERİ (01.10.2026). Önceden tesis çarpanlarının hiçbiri
 * çağrılmıyordu: oyuncu para ödüyor, karşılığında hiçbir şey almıyordu.
 *
 * **KANITLANAN (HTTP üzerinden, gerçek DB):**
 *  1. Depo: yem satın alma TOPLAMI indirimli; defter satırı, bakiye farkı ve
 *     yanıttaki `totalCost` aynı sayı; envanter görünümü indirimi gösterir.
 *  2. Padok: `rest` bakımı config çarpanıyla güçlenir, başka eylem güçlenmez.
 *  3. Veteriner merkezi etkisizdir (bakım ücretsiz): inşa 409
 *     `FACILITY_INACTIVE`, para oynamaz; özet `isActive: false`.
 *
 * Antrenman (pist × nalbant) ve üreme merkezi saf fonksiyon testlerindedir
 * (`farm.spec.ts`, `breeding.spec.ts`): antrenman riski DB'ye iki ondalıkla
 * yazıldığından (`NUMERIC(5,2)`) oran burada güvenilir ölçülemez.
 */
describe('Çiftlik tesisi etkileri (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function fund(player: RegisteredTestPlayer): Promise<void> {
    await pool.query('UPDATE players SET money = 1000000, gems = 1000 WHERE id = $1', [
      player.playerId,
    ]);
  }

  function build(player: RegisteredTestPlayer, type: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/players/${player.playerId}/farm/facilities/${type}/upgrade`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID());
  }

  async function balance(playerId: string): Promise<{ money: number; gems: number }> {
    const result = await pool.query<{ money: string; gems: string }>(
      'SELECT money, gems FROM players WHERE id = $1',
      [playerId],
    );
    return { money: Number(result.rows[0].money), gems: Number(result.rows[0].gems) };
  }

  it('depo: yem toplamı indirimli; defter, bakiye ve yanıt aynı tutarı söyler', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Depo Sahibi');
    await fund(player);
    await build(player, 'warehouse').expect(200);
    await build(player, 'warehouse').expect(200);

    const multiplier = getWarehouseFeedCostMultiplier(2, config.farm);
    expect(multiplier).toBeLessThan(1);
    const unit = config.care.feedTypes.arpa.price!.amount;
    const count = 10;
    const expected = discountedTotal(unit, count, multiplier);
    expect(expected).toBeLessThan(unit * count); // indirim gerçekten var

    const before = await balance(player.playerId);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${player.playerId}/feed-inventory/arpa/buy`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ count })
      .expect(200);
    const after = await balance(player.playerId);

    expect(response.body.data.totalCost).toBe(expected);
    expect(before.gems - after.gems).toBe(expected);
    const ledger = await pool.query<{ amount: string }>(
      `SELECT amount FROM economy_transactions WHERE player_id = $1 AND type = 'feed_purchase' ORDER BY created_at DESC LIMIT 1`,
      [player.playerId],
    );
    expect(Number(ledger.rows[0].amount)).toBe(-expected);

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/feed-inventory`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const arpa = (
      inventory.body.data.items as Array<{ type: string; discountPercent: number }>
    ).find((item) => item.type === 'arpa');
    expect(arpa?.discountPercent).toBe(Math.round((1 - multiplier) * 100));
  });

  it('padok: `rest` config çarpanıyla güçlenir; başka eylem güçlenmez', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Padok Sahibi');
    await fund(player);
    await build(player, 'paddock').expect(200);
    await pool.query('UPDATE horses SET fatigue = 90, energy = 10 WHERE id = $1', [player.horseId]);

    const rest = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'rest' })
      .expect(200);
    const multiplier = getPaddockRecoveryMultiplier(1, config.farm);
    expect(multiplier).toBeGreaterThan(1);
    expect(rest.body.data.farmMultiplier).toBe(multiplier);
    const fatigueDelta = config.care.actions.rest.vitalDelta!.fatigue!;
    expect(rest.body.data.newVitals.fatigue).toBeCloseTo(90 + fatigueDelta * multiplier, 1);

    const groom = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'groom' })
      .expect(200);
    expect(groom.body.data.farmMultiplier).toBe(1);
  });

  it('veteriner merkezi etkisiz: inşa 409 FACILITY_INACTIVE, para oynamaz, özet isActive=false', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Veteriner Adayı');
    await fund(player);
    const before = await balance(player.playerId);
    const response = await build(player, 'vet_center').expect(409);
    expect(response.body.error.code).toBe('FACILITY_INACTIVE');
    expect(await balance(player.playerId)).toEqual(before);

    const farm = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/farm`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const vet = (
      farm.body.data.facilities as Array<{ type: string; isActive: boolean; nextUpgrade: unknown }>
    ).find((facility) => facility.type === 'vet_center');
    expect(vet).toMatchObject({ isActive: false, nextUpgrade: null });
  });
});
