import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnomalyFinding, AnomalyReport } from '@at-sevdalisi/shared-types';
import { loadAnticheatConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * ŞÜPHELİ DESENLER (02.10.2026, Faz 7). Kanıtlananlar: üç desen kayıtlı
 * olgulardan bulunur; eşiğin altı ve ESKİ hesap işaretlenmez; yetki
 * moderatör/yönetici (oyuncu 403); uç hiçbir şey YAZMAZ (otomatik ceza yok).
 * Olgular SQL ile kurulur (bu uç salt okuma; para yolları kendi testlerinde).
 */
describe('Şüpheli desenler (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const config = loadAnticheatConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const report = async (actor: RegisteredTestPlayer): Promise<AnomalyReport> =>
    (await request(app.getHttpServer()).get('/api/v1/admin/anomalies').set('Authorization', actor.authHeader).expect(200))
      .body.data;
  const staff = async (flag: 'is_admin' | 'is_moderator'): Promise<RegisteredTestPlayer> => {
    const player = await registerTestPlayer(app, 'Denetçi');
    await pool.query(`UPDATE players SET ${flag} = true WHERE id = $1`, [player.playerId]);
    return player;
  };
  const gift = (from: string, to: string, amount: number) =>
    pool.query(`INSERT INTO gift_sends (sender_id, recipient_id, currency, amount) VALUES ($1, $2, 'money', $3)`, [from, to, amount]);
  const age = (playerId: string, days: number) =>
    pool.query(`UPDATE players SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [playerId, days]);
  const of = (data: AnomalyReport, rule: AnomalyFinding['rule'], subjectId: string) =>
    data.findings.find((finding) => finding.rule === rule && finding.subject.playerId === subjectId);

  it('yetki: oyuncu 403; moderatör ve yönetici görür', async () => {
    const player = await registerTestPlayer(app, 'Meraklı');
    const denied = await request(app.getHttpServer()).get('/api/v1/admin/anomalies').set('Authorization', player.authHeader);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ADMIN_REQUIRED');
    const data = await report(await staff('is_moderator'));
    expect(data.windowDays).toBe(config.windowDays);
    await report(await staff('is_admin'));
  });

  it('hediye hunisi: eşik kadar YENİ hesaptan hediye alan işaretlenir; eski hesaplardan gelen sayılmaz', async () => {
    const hub = await registerTestPlayer(app, 'Toplayıcı');
    const control = await registerTestPlayer(app, 'Normal Alıcı');
    const n = config.giftFunnel.minDistinctNewSenders;
    const fresh = await Promise.all(Array.from({ length: n }, () => registerTestPlayer(app, 'Yeni Hesap')));
    for (const sender of fresh) await gift(sender.playerId, hub.playerId, 100);
    const veterans = await Promise.all(Array.from({ length: n }, () => registerTestPlayer(app, 'Eski Hesap')));
    for (const sender of veterans) {
      await age(sender.playerId, config.newAccountDays + 30);
      await gift(sender.playerId, control.playerId, 100);
    }
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM admin_audit_log');
    const data = await report(await staff('is_moderator'));
    const finding = of(data, 'gift_funnel', hub.playerId)!;
    expect(finding.count).toBe(n);
    expect(finding.totalMoney).toBe(n * 100);
    expect(finding.counterparts.map((c) => c.playerId).sort()).toEqual(fresh.map((f) => f.playerId).sort());
    expect(of(data, 'gift_funnel', control.playerId)).toBeUndefined();
    // Salt okuma: denetim kaydı ya da yaptırım üretmez.
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM admin_audit_log')).rows[0].n).toBe(before.rows[0].n);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM player_sanctions WHERE player_id = $1', [hub.playerId])).rows[0].n).toBe(0);
  });

  it('yeni hesaptan para çıkışı: eşik ve üstü işaretlenir, altı işaretlenmez', async () => {
    const big = await registerTestPlayer(app, 'Boşaltan');
    const small = await registerTestPlayer(app, 'Az Gönderen');
    const sink = await registerTestPlayer(app, 'Hedef');
    await gift(big.playerId, sink.playerId, config.newAccountOutflow.minMoney);
    await gift(small.playerId, sink.playerId, config.newAccountOutflow.minMoney - 1);
    const data = await report(await staff('is_admin'));
    const finding = of(data, 'new_account_outflow', big.playerId)!;
    expect(finding.totalMoney).toBe(config.newAccountOutflow.minMoney);
    expect(finding.counterparts.map((c) => c.username)).toEqual([sink.username]);
    expect(of(data, 'new_account_outflow', small.playerId)).toBeUndefined();
  });

  it('tekrarlayan alım-satım çifti: aynı satıcı → aynı alıcı eşik kadar satış', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Satıcı');
    const buyer = await registerTestPlayer(app, 'Alıcı');
    for (let index = 0; index < config.repeatTradePair.minTrades; index += 1) {
      const listingId = randomUUID();
      await pool.query(
        `INSERT INTO market_listings (id, seller_id, horse_id, price, listing_type, status) VALUES ($1, $2, $3, 10, 'fixed_price', 'sold')`,
        [listingId, seller.playerId, seller.horseId],
      );
      await pool.query(
        `INSERT INTO economy_transactions (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
         VALUES ($1, 'market_purchase_debit', -10, 'money', 'market_listing', $2, 1000, 990)`,
        [buyer.playerId, listingId],
      );
    }
    const finding = of(await report(await staff('is_admin')), 'repeat_trade_pair', seller.playerId)!;
    expect(finding.count).toBe(config.repeatTradePair.minTrades);
    expect(finding.totalMoney).toBe(10 * config.repeatTradePair.minTrades);
    expect(finding.counterparts.map((c) => c.playerId)).toEqual([buyer.playerId]);
  });
});
