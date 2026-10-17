import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCareConfig, loadStableConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { HorseRecoveryScheduler } from '../../src/infrastructure/scheduler/horse-recovery.scheduler';
import { getStableRecoveryMultiplier } from '../../src/domain/stable/stable';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * AHIR GELİŞTİRME (16.10.2026). Kilitlenenler: özet bütün seviyeleri (ad,
 * kapasite, konfor bonusu, şart, bedel) config'ten taşır; oyuncu seviyesi
 * şartı tutmayan yükseltme 409 STABLE_UPGRADE_LEVEL_LOCKED verir ve para/
 * seviye/defter DEĞİŞMEZ; konfor bonusu zamanla toparlanmayı sahibin ahır
 * seviyesine göre hızlandırır (seviye 1 = eski hız).
 *
 * ⚠️ `tickNow` bütün atları toparlar; API paketi `--no-file-parallelism` ile koşar.
 */
describe('Ahır geliştirme (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let recovery: HorseRecoveryScheduler;
  const stable = loadStableConfig();
  const care = loadCareConfig();
  const maxLevel = Math.max(...Object.keys(stable.capacityByLevel).map(Number));

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    recovery = app.get(HorseRecoveryScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const summary = async (playerId: string, authHeader: string) =>
    (
      await request(app.getHttpServer())
        .get(`/api/v1/players/${playerId}/stable-summary`)
        .set('Authorization', authHeader)
        .expect(200)
    ).body.data;

  it('özet: ad, konfor bonusu ve bütün seviyelerin yol haritası config ile birebir', async () => {
    const { playerId, authHeader } = await registerTestPlayer(app, 'Yol Haritası');
    const view = await summary(playerId, authHeader);
    expect(view.stableLevel).toBe(1);
    expect(view.stableName).toBe(stable.nameByLevel['1']);
    expect(view.recoveryBonusPercent).toBe(0);
    expect(view.levels).toHaveLength(maxLevel);
    expect(view.levels[0]).toMatchObject({ level: 1, cost: null, requiredPlayerLevel: null });
    const last = view.levels[maxLevel - 1];
    expect(last).toEqual({
      level: maxLevel,
      name: stable.nameByLevel[String(maxLevel)],
      capacity: stable.capacityByLevel[String(maxLevel)],
      recoveryBonusPercent: Math.round(stable.recoveryBonusByLevel[String(maxLevel)]! * 100),
      requiredPlayerLevel: stable.requiredPlayerLevelByLevel[String(maxLevel)],
      cost: stable.upgradeCostByLevel[String(maxLevel)],
    });
    expect(view.nextUpgrade).toMatchObject({
      nextLevel: 2,
      nextName: stable.nameByLevel['2'],
      requiredPlayerLevel: stable.requiredPlayerLevelByLevel['2'],
    });
  });

  it('oyuncu seviyesi şartı tutmazsa 409 STABLE_UPGRADE_LEVEL_LOCKED; para, seviye ve defter değişmez', async () => {
    const { playerId, authHeader } = await registerTestPlayer(app, 'Acemi Ahırcı');
    // Seviye 3 → 4 yükseltmesi, şartı oyuncunun seviyesinden yüksek olsun.
    const required = stable.requiredPlayerLevelByLevel['4']!;
    expect(required).toBeGreaterThan(1);
    await pool.query('UPDATE players SET money = 1000000, stable_level = 3, level = $2 WHERE id = $1', [
      playerId,
      required - 1,
    ]);
    const ledgerBefore = await pool.query('SELECT count(*)::int AS n FROM economy_transactions WHERE player_id = $1', [playerId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${playerId}/stable/upgrade`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STABLE_UPGRADE_LEVEL_LOCKED');

    const row = (await pool.query('SELECT money, stable_level FROM players WHERE id = $1', [playerId])).rows[0];
    expect(Number(row.money)).toBe(1000000);
    expect(row.stable_level).toBe(3);
    const ledgerAfter = await pool.query('SELECT count(*)::int AS n FROM economy_transactions WHERE player_id = $1', [playerId]);
    expect(ledgerAfter.rows[0].n).toBe(ledgerBefore.rows[0].n);

    // Şart sağlanınca aynı yükseltme geçer ve deftere yazılır.
    await pool.query('UPDATE players SET level = $2 WHERE id = $1', [playerId, required]);
    const ok = await request(app.getHttpServer())
      .post(`/api/v1/players/${playerId}/stable/upgrade`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(ok.body.data.newStableLevel).toBe(4);
    expect(Number(ok.body.data.newBalance.money)).toBe(1000000 - stable.upgradeCostByLevel['4']!.amount);
  });

  it('konfor bonusu: yüksek seviyeli ahırdaki at aynı sürede daha çok toparlanır (seviye 1 = eski hız)', async () => {
    const basic = await registerTestPlayerWithStarterHorse(app, 'Küçük Ahır Sahibi');
    const grand = await registerTestPlayerWithStarterHorse(app, 'Büyük Hara Sahibi');
    await pool.query('UPDATE players SET stable_level = $2 WHERE id = $1', [grand.playerId, maxLevel]);
    const start = new Date();
    for (const horseId of [basic.horseId, grand.horseId]) {
      await pool.query('UPDATE horses SET energy = 20, fatigue = 80, vitals_recovered_at = $2 WHERE id = $1', [
        horseId,
        start,
      ]);
    }

    await recovery.tickNow(new Date(start.getTime() + care.passiveRecovery.maxCreditSeconds * 1000));

    const vitals = async (horseId: string) => {
      const row = (await pool.query('SELECT energy, fatigue FROM horses WHERE id = $1', [horseId])).rows[0];
      return { energy: Number(row.energy), fatigue: Number(row.fatigue) };
    };
    const hours = care.passiveRecovery.maxCreditSeconds / 3600;
    const expected = (multiplier: number) => ({
      energy: Math.round((20 + care.passiveRecovery.energyPerHour * multiplier * hours) * 100) / 100,
      fatigue: Math.round((80 - care.passiveRecovery.fatiguePerHour * multiplier * hours) * 100) / 100,
    });
    expect(await vitals(basic.horseId)).toEqual(expected(1));
    const grandMultiplier = getStableRecoveryMultiplier(maxLevel, stable);
    expect(grandMultiplier).toBeGreaterThan(1);
    expect(await vitals(grand.horseId)).toEqual(expected(grandMultiplier));
  });
});
