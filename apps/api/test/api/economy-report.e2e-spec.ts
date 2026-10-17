import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * GELİR-GİDER RAPORU (16.10.2026, brief §19). Kanıtlananlar: rapor GERÇEK
 * defter satırlarından (pratik yarış ücreti/ödülü, yem alımı) toplanır;
 * bugünkü dönemin geliri − gideri = defterdeki çip satırlarının toplamı;
 * kanonik aile kırılımı cüzdanla aynı; başkasının raporu 403, bozuk dönem 400.
 */
describe('Gelir-gider raporu (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const economy = loadEconomyConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('defterle birebir: bugünkü net = çip satırlarının toplamı; aileler; aylık da tutarlı', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Muhasebeci');
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const ledger = await pool.query<{ amount: string }>(
      "SELECT amount FROM economy_transactions WHERE player_id = $1 AND currency = 'money'",
      [player.playerId],
    );
    const income = ledger.rows.map((r) => Number(r.amount)).filter((a) => a > 0).reduce((s, a) => s + a, 0);
    const expense = -ledger.rows.map((r) => Number(r.amount)).filter((a) => a < 0).reduce((s, a) => s + a, 0);
    expect(expense).toBeGreaterThan(0); // en az giriş ücreti

    const daily = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/wallet/report`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const report = daily.body.data;
    expect(report.period).toBe('daily');
    expect(report.buckets).toHaveLength(economy.economyReport.dailyBuckets);
    expect(report.totals).toEqual({ income, expense, net: income - expense });
    expect(report.buckets.at(-1)).toMatchObject({ income, expense, net: income - expense });
    expect(report.categories.map((c: { category: string }) => c.category)).toContain('ENTRY_FEE');
    for (const value of [report.totals.income, report.totals.expense]) expect(typeof value).toBe('number');

    const monthly = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/wallet/report`)
      .query({ period: 'monthly' })
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(monthly.body.data.buckets).toHaveLength(economy.economyReport.monthlyBuckets);
    expect(monthly.body.data.totals).toEqual(report.totals);
  });

  it('başkasının raporu 403; bozuk dönem 400', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Rapor Sahibi');
    const other = await registerTestPlayerWithStarterHorse(app, 'Meraklı Komşu');
    await request(app.getHttpServer())
      .get(`/api/v1/players/${owner.playerId}/wallet/report`)
      .set('Authorization', other.authHeader)
      .expect(403);
    const bad = await request(app.getHttpServer())
      .get(`/api/v1/players/${owner.playerId}/wallet/report`)
      .query({ period: 'yearly' })
      .set('Authorization', owner.authHeader);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});
