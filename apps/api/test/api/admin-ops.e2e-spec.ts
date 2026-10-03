import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * YÖNETİM İŞLEMLERİ (02.10.2026, Faz 10). Kanıtlananlar: bakiye düzeltmesi
 * yalnızca yöneticide; bakiye + defter + denetim aynı transaction'da ve
 * birbirine bağlı; aynı Idempotency-Key ikinci kez ÖDEMEZ; yetmeyen bakiye
 * hiçbir satır bırakmaz; kendine/personele yasak; at araması joker
 * karakterleri kaçırır.
 */
describe('Yönetim işlemleri (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const limits = loadModerationConfig().economyAdjustment;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const staff = async (flag: 'is_admin' | 'is_moderator'): Promise<RegisteredTestPlayer> => {
    const player = await registerTestPlayer(app, 'Yönetim');
    await pool.query(`UPDATE players SET ${flag} = true WHERE id = $1`, [player.playerId]);
    return player;
  };
  const adjust = (actor: RegisteredTestPlayer, playerId: string, body: object, key: string = randomUUID()) =>
    http()
      .post(`/api/v1/admin/players/${playerId}/balance-adjustments`)
      .set('Authorization', actor.authHeader)
      .set('Idempotency-Key', key)
      .send(body);
  const balance = async (playerId: string) => {
    const row = (await pool.query('SELECT money, gems FROM players WHERE id = $1', [playerId])).rows[0];
    return { money: Number(row.money), gems: Number(row.gems) };
  };
  const ledgerCount = async (playerId: string) =>
    (
      await pool.query(
        "SELECT COUNT(*)::int AS n FROM economy_transactions WHERE player_id = $1 AND type = 'admin_adjustment'",
        [playerId],
      )
    ).rows[0].n as number;
  const reason = 'Destek talebi #42: yarış hatası telafisi';

  it('yetki: oyuncu ve moderatör 403; anahtarsız istek reddedilir', async () => {
    const target = await registerTestPlayer(app, 'Hedef');
    for (const actor of [await registerTestPlayer(app, 'Oyuncu'), await staff('is_moderator')]) {
      const denied = await adjust(actor, target.playerId, { currency: 'money', amount: 100, reason });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('ADMIN_REQUIRED');
    }
    const admin = await staff('is_admin');
    const noKey = await http()
      .post(`/api/v1/admin/players/${target.playerId}/balance-adjustments`)
      .set('Authorization', admin.authHeader)
      .send({ currency: 'money', amount: 100, reason });
    expect(noKey.status).toBe(400);
    expect(await ledgerCount(target.playerId)).toBe(0);
  });

  it('ekleme: bakiye, defter ve denetim aynı tutarda ve birbirine bağlı; aynı anahtar ikinci kez ödemez', async () => {
    const admin = await staff('is_admin');
    const target = await registerTestPlayer(app, 'Tazminat');
    const before = await balance(target.playerId);
    const key = randomUUID();
    const first = await adjust(admin, target.playerId, { currency: 'money', amount: 750, reason }, key).expect(201);
    expect(first.body.data).toMatchObject({ amount: 750, balanceBefore: before.money, balanceAfter: before.money + 750 });
    const replay = await adjust(admin, target.playerId, { currency: 'money', amount: 750, reason }, key);
    expect(replay.body.data.transactionId).toBe(first.body.data.transactionId);
    expect((await balance(target.playerId)).money).toBe(before.money + 750);
    expect(await ledgerCount(target.playerId)).toBe(1);

    const ledger = (
      await pool.query(
        "SELECT amount, reference_type, reference_id, balance_before, balance_after FROM economy_transactions WHERE id = $1",
        [first.body.data.transactionId],
      )
    ).rows[0];
    expect(Number(ledger.amount)).toBe(750);
    expect(ledger.reference_type).toBe('admin_audit_log');
    expect(ledger.reference_id).toBe(first.body.data.auditId);
    const audit = (await pool.query('SELECT admin_id, action, details FROM admin_audit_log WHERE id = $1', [first.body.data.auditId])).rows[0];
    expect(audit).toMatchObject({ admin_id: admin.playerId, action: 'player.balance_adjusted' });
    expect(audit.details).toMatchObject({ amount: 750, currency: 'money', reason });

    const wallet = await http().get(`/api/v1/players/${target.playerId}/wallet`).set('Authorization', target.authHeader).expect(200);
    const row = wallet.body.data.transactions.find((t: { id: string }) => t.id === first.body.data.transactionId);
    expect(row).toMatchObject({ type: 'admin_adjustment', canonicalType: 'ADJUSTMENT', amount: 750 });
  });

  it('düşüm: bakiye yetmezse hiçbir satır kalmaz; yeterse düşer; elmas da düzeltilebilir', async () => {
    const admin = await staff('is_admin');
    const target = await registerTestPlayer(app, 'Düşüm');
    const before = await balance(target.playerId);
    const auditsBefore = (await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE target_id = $1", [target.playerId])).rows[0].n;
    const tooMuch = Math.min(before.money + 1, limits.maxAbsAmount.money);
    if (before.money + 1 <= limits.maxAbsAmount.money) {
      const rejected = await adjust(admin, target.playerId, { currency: 'money', amount: -tooMuch, reason });
      expect(rejected.status).toBe(409);
      expect(await ledgerCount(target.playerId)).toBe(0);
      expect((await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE target_id = $1", [target.playerId])).rows[0].n).toBe(auditsBefore);
      expect(await balance(target.playerId)).toEqual(before);
    }
    await adjust(admin, target.playerId, { currency: 'money', amount: -100, reason }).expect(201);
    await adjust(admin, target.playerId, { currency: 'gems', amount: 5, reason }).expect(201);
    expect(await balance(target.playerId)).toEqual({ money: before.money - 100, gems: before.gems + 5 });
  });

  it('kendine ve yönetim ekibine 409; geçersiz gövde 400; olmayan oyuncu 404', async () => {
    const admin = await staff('is_admin');
    const otherAdmin = await staff('is_admin');
    const moderator = await staff('is_moderator');
    for (const target of [admin, otherAdmin, moderator]) {
      const response = await adjust(admin, target.playerId, { currency: 'money', amount: 100, reason });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ADJUSTMENT_TARGET_NOT_ALLOWED');
    }
    const target = await registerTestPlayer(app, 'Geçersiz');
    for (const body of [
      { currency: 'money', amount: 0, reason },
      { currency: 'money', amount: 1.5, reason },
      { currency: 'money', amount: limits.maxAbsAmount.money + 1, reason },
      { currency: 'money', amount: '100', reason },
      { currency: 'altin', amount: 100, reason },
      { currency: 'money', amount: 100, reason: 'kısa' },
    ]) {
      const response = await adjust(admin, target.playerId, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_BALANCE_ADJUSTMENT');
    }
    await adjust(admin, randomUUID(), { currency: 'money', amount: 100, reason }).expect(404);
    expect(await ledgerCount(target.playerId)).toBe(0);
  });

  it('at araması: kimlik, sahip ve ad ile; joker karakter kaçırılır; moderatör görür, oyuncu 403', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'At Sahibi');
    const moderator = await staff('is_moderator');
    const search = (q: string, actor: RegisteredTestPlayer = moderator) =>
      http().get('/api/v1/admin/horses').query({ q }).set('Authorization', actor.authHeader);
    const byId = await search(owner.horseId).expect(200);
    expect(byId.body.data.map((h: { id: string }) => h.id)).toEqual([owner.horseId]);
    expect(byId.body.data[0].owner).toEqual({ playerId: owner.playerId, username: owner.username });
    expect(typeof byId.body.data[0].health).toBe('number');
    const byOwner = await search(owner.playerId).expect(200);
    expect(byOwner.body.data.map((h: { id: string }) => h.id)).toContain(owner.horseId);
    const name = byId.body.data[0].name as string;
    const byName = await search(name.slice(0, 3)).expect(200);
    expect(byName.body.data.map((h: { id: string }) => h.id)).toContain(owner.horseId);
    expect((await search('%').expect(200)).body.data).toEqual([]);
    expect((await search('   ').expect(200)).body.data).toEqual([]);
    const denied = await search(owner.horseId, await registerTestPlayer(app, 'Meraklı'));
    expect(denied.status).toBe(403);
  });
});
