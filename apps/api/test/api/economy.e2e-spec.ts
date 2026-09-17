import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer } from './test-helpers';

/**
 * FAZ 1 wiring — Yedinci dilim: `POST /players/:id/daily-reward` (brief
 * §37 "GÜNLÜK OYUN DÖNGÜSÜ" Daily Reward). Diğer e2e testleriyle AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — `POST /players/:id/
 * daily-reward` artık `assertSelf` ile korunur (bkz.
 * `economy.controller.ts`): yalnızca oturum sahibi KENDİ ödülünü talep
 * edebilir. `assertSelf`, use-case'e ULAŞMADAN ÖNCE çalıştığından, "var
 * olmayan bir oyuncu için 404" eski test senaryosu ARTIK ULAŞILAMAZ hale
 * geldi (kendi id'niz olmayan HERHANGİ bir id — var olsun olmasın — 403
 * alır) — bkz. `player.e2e-spec.ts`'teki AYNI değişiklik ve gerekçe.
 */
describe('Economy — Daily Reward (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();

    // Cooldown geçmiş bir talebi simüle etmek için (24 saat gerçekte
    // beklenemez): uygulamanın kendi DB havuzu üzerinden `last_daily_
    // reward_claimed_at`'ı doğrudan geçmişe ayarlıyoruz — gerçek bir
    // kullanıcı akışı DEĞİL, yalnızca test kurulumu (bkz.
    // `stable.e2e-spec.ts`'teki AYNI teknik).
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerPlayer(): Promise<{ id: string; startingMoney: number; authHeader: string }> {
    const player = await registerTestPlayer(app, 'Ödül Avcısı');
    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return { id: player.playerId, startingMoney: fetched.body.data.money, authHeader: player.authHeader };
  }

  it('/api/v1/players/:id/daily-reward (POST) — yeni oyuncu ilk talebinde ödülü kazanır', async () => {
    const { id, startingMoney, authHeader } = await registerPlayer();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${id}/daily-reward`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // config/economy.config.json: dailyRewardMoney 500.
    expect(response.body.data.amount).toBe(500);
    expect(response.body.data.currency).toBe('money');
    expect(response.body.data.newBalance.money).toBe(startingMoney + 500);
    expect(typeof response.body.data.nextClaimAvailableAt).toBe('string');

    // AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — `PlayerRepository.
    // updateWithLock`'un YENİ `ledgerEntries` mekanizmasının GENEL amaçlı
    // olduğunun kanıtı: yalnızca At Pazarı DEĞİL, TEK-oyunculu bir para
    // hareketi (günlük ödül) de `economy_transactions`'a yazılır.
    const ledgerRows = await pool.query('SELECT * FROM economy_transactions WHERE player_id = $1', [id]);
    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0].type).toBe('daily_reward');
    expect(Number(ledgerRows.rows[0].amount)).toBe(500);
    expect(Number(ledgerRows.rows[0].balance_before)).toBe(startingMoney);
    expect(Number(ledgerRows.rows[0].balance_after)).toBe(startingMoney + 500);
  });

  it('/api/v1/players/:id/daily-reward (POST) — cooldown dolmadan aynı gün ikinci talep 409 döner ve bakiyeyi DEĞİŞTİRMEZ', async () => {
    const { id, startingMoney, authHeader } = await registerPlayer();

    await request(app.getHttpServer())
      .post(`/api/v1/players/${id}/daily-reward`)
      .set('Authorization', authHeader)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/players/${id}/daily-reward`)
      .set('Authorization', authHeader);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DAILY_REWARD_ALREADY_CLAIMED');

    // Bakiye İKİNCİ (reddedilen) talepten ETKİLENMEMİŞ olmalı — ilk
    // taleple aynı kalmalı (startingMoney + 500, iki katı DEĞİL).
    const player = await request(app.getHttpServer())
      .get(`/api/v1/players/${id}`)
      .set('Authorization', authHeader);
    expect(player.body.data.money).toBe(startingMoney + 500);
  });

  it('/api/v1/players/:id/daily-reward (POST) — cooldown penceresi geçtikten sonra tekrar talep edilebilir', async () => {
    const { id, startingMoney, authHeader } = await registerPlayer();
    await request(app.getHttpServer())
      .post(`/api/v1/players/${id}/daily-reward`)
      .set('Authorization', authHeader)
      .expect(200);

    // Test kurulumu: son talep zamanını 25 saat öncesine (cooldown: 24
    // saat) taşı (bkz. beforeAll notu).
    await pool.query(
      "UPDATE players SET last_daily_reward_claimed_at = NOW() - INTERVAL '25 hours' WHERE id = $1",
      [id],
    );

    const second = await request(app.getHttpServer())
      .post(`/api/v1/players/${id}/daily-reward`)
      .set('Authorization', authHeader);

    expect(second.status).toBe(200);
    expect(second.body.data.newBalance.money).toBe(startingMoney + 500 + 500);
  });

  it('/api/v1/players/:id/daily-reward (POST) Authorization header olmadan 401 döner', async () => {
    const { id } = await registerPlayer();
    const response = await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/players/:id/daily-reward (POST) başka bir oyuncu adına talep etmeye çalışan istek 403 döner (AUDIT_REPORT.md S4)', async () => {
    const target = await registerPlayer();
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${target.id}/daily-reward`)
      .set('Authorization', attacker.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/players/:id/daily-reward (POST) var olmayan bir oyuncu id si (kendisi olmadığı için) 403 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${randomUUID()}/daily-reward`)
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(403);
  });

  it('/api/v1/players/:id/daily-reward (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/players/not-a-uuid/daily-reward')
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(400);
  });
});
