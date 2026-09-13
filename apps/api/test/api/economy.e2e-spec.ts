import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';
import { PG_POOL } from '../../src/infrastructure/database/database.module';

/**
 * FAZ 1 wiring — Yedinci dilim: `POST /players/:id/daily-reward` (brief
 * §37 "GÜNLÜK OYUN DÖNGÜSÜ" Daily Reward). Diğer e2e testleriyle AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Economy — Daily Reward (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // Cooldown geçmiş bir talebi simüle etmek için (24 saat gerçekte
    // beklenemez): uygulamanın kendi DB havuzu üzerinden `last_daily_
    // reward_claimed_at`'ı doğrudan geçmişe ayarlıyoruz — gerçek bir
    // kullanıcı akışı DEĞİL, yalnızca test kurulumu (bkz.
    // `stable.e2e-spec.ts`'teki AYNI teknik).
    pool = moduleRef.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueUsername(): string {
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  async function registerPlayer(): Promise<{ id: string; startingMoney: number }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Ödül Avcısı' })
      .expect(201);
    return { id: response.body.data.id, startingMoney: response.body.data.money };
  }

  it('/api/v1/players/:id/daily-reward (POST) — yeni oyuncu ilk talebinde ödülü kazanır', async () => {
    const { id, startingMoney } = await registerPlayer();

    const response = await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // config/economy.config.json: dailyRewardMoney 500.
    expect(response.body.data.amount).toBe(500);
    expect(response.body.data.currency).toBe('money');
    expect(response.body.data.newBalance.money).toBe(startingMoney + 500);
    expect(typeof response.body.data.nextClaimAvailableAt).toBe('string');
  });

  it('/api/v1/players/:id/daily-reward (POST) — cooldown dolmadan aynı gün ikinci talep 409 döner ve bakiyeyi DEĞİŞTİRMEZ', async () => {
    const { id, startingMoney } = await registerPlayer();

    await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`).expect(200);

    const second = await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DAILY_REWARD_ALREADY_CLAIMED');

    // Bakiye İKİNCİ (reddedilen) talepten ETKİLENMEMİŞ olmalı — ilk
    // taleple aynı kalmalı (startingMoney + 500, iki katı DEĞİL).
    const player = await request(app.getHttpServer()).get(`/api/v1/players/${id}`);
    expect(player.body.data.money).toBe(startingMoney + 500);
  });

  it('/api/v1/players/:id/daily-reward (POST) — cooldown penceresi geçtikten sonra tekrar talep edilebilir', async () => {
    const { id, startingMoney } = await registerPlayer();
    await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`).expect(200);

    // Test kurulumu: son talep zamanını 25 saat öncesine (cooldown: 24
    // saat) taşı (bkz. beforeAll notu).
    await pool.query(
      "UPDATE players SET last_daily_reward_claimed_at = NOW() - INTERVAL '25 hours' WHERE id = $1",
      [id],
    );

    const second = await request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`);

    expect(second.status).toBe(200);
    expect(second.body.data.newBalance.money).toBe(startingMoney + 500 + 500);
  });

  it('/api/v1/players/:id/daily-reward (POST) var olmayan bir oyuncu için 404 döner', async () => {
    const response = await request(app.getHttpServer()).post(`/api/v1/players/${randomUUID()}/daily-reward`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('/api/v1/players/:id/daily-reward (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/players/not-a-uuid/daily-reward');
    expect(response.status).toBe(400);
  });
});
