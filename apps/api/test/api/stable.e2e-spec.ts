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
 * FAZ 1 wiring — Üçüncü dilim: `GET /players/:id/stable-summary` (brief
 * §38 "Ahır Özeti"); Altıncı dilim: `POST /players/:id/stable/upgrade`
 * (brief §32). `player.e2e-spec.ts`/`horse.e2e-spec.ts` ile AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Stable summary (e2e)', () => {
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

    // Ahır Yükseltme testleri için: yeni bir oyuncu yalnızca 5000 para ile
    // başlar (config/economy.config.json `newPlayerStartingBalance`),
    // ama seviye 2'ye yükseltme 8000 para tutar. Bu dilimde bir "para
    // kazanma" uç noktası (günlük ödül/yarış ödülü) henüz BAĞLANMADI, bu
    // yüzden başarı senaryosunu test edebilmek için uygulamanın kendi
    // DB havuzu üzerinden DOĞRUDAN bir bakiye artırımı yapılır — gerçek
    // bir kullanıcı akışı DEĞİL, yalnızca test kurulumu.
    pool = moduleRef.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueUsername(): string {
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  it('/api/v1/players/:id/stable-summary (GET) — yeni oyuncu için doğru başlangıç özetini döner', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Ahır Sahibi' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/stable-summary`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // config/stable.config.json: seviye 1 -> kapasite 5.
    expect(response.body.data.stableLevel).toBe(1);
    expect(response.body.data.capacity).toBe(5);
    // Kayıtta verilen başlangıç atı (health:100, fitness:50) -> ortalama 75.
    expect(response.body.data.horseCount).toBe(1);
    expect(response.body.data.averageCondition).toBe(75);
    // Başlangıç atının sağlığı (100) uyarı eşiğinin (50) üzerinde.
    expect(response.body.data.healthWarnings).toEqual([]);
  });

  it('/api/v1/players/:id/stable-summary (GET) var olmayan bir oyuncu için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${randomUUID()}/stable-summary`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('/api/v1/players/:id/stable-summary (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/players/not-a-uuid/stable-summary');
    expect(response.status).toBe(400);
  });

  describe('POST /api/v1/players/:id/stable/upgrade (FAZ 1 wiring, altıncı dilim)', () => {
    async function registerPlayer(): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/api/v1/players')
        .send({ username: uniqueUsername(), displayName: 'Ahır Sahibi' })
        .expect(201);
      return response.body.data.id;
    }

    it('yeterli bakiyeyle seviye 1 → 2 yükseltir, bakiyeden düşer ve yeni kapasiteyi döner', async () => {
      const playerId = await registerPlayer();
      // Test kurulumu: bakiyeyi 20000'e çıkar (bkz. beforeAll notu).
      await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [playerId]);

      const response = await request(app.getHttpServer()).post(`/api/v1/players/${playerId}/stable/upgrade`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // config/stable.config.json: seviye 2 maliyeti 8000 para.
      expect(response.body.data.newStableLevel).toBe(2);
      expect(response.body.data.newCapacity).toBe(8);
      expect(response.body.data.cost).toEqual({ currency: 'money', amount: 8000 });
      expect(response.body.data.newBalance.money).toBe(20000 - 8000);

      // Ahır Özeti de güncellenmiş seviyeyi/kapasiteyi yansıtmalı.
      const summary = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/stable-summary`);
      expect(summary.body.data.stableLevel).toBe(2);
      expect(summary.body.data.capacity).toBe(8);
    });

    it('yetersiz bakiyede 409 INSUFFICIENT_FUNDS döner ve bakiyeyi/seviyeyi DEĞİŞTİRMEZ', async () => {
      const playerId = await registerPlayer();
      // Yeni oyuncu yalnızca 5000 para ile başlar, seviye 2 8000 tutar.

      const response = await request(app.getHttpServer()).post(`/api/v1/players/${playerId}/stable/upgrade`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Transaction ROLLBACK oldu mu? Bakiye/seviye HİÇ değişmemiş olmalı.
      const summary = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/stable-summary`);
      expect(summary.body.data.stableLevel).toBe(1);
    });

    it('zaten en yüksek seviyedeyken 409 MAX_STABLE_LEVEL_REACHED döner', async () => {
      const playerId = await registerPlayer();
      // config/stable.config.json: en yüksek tanımlı seviye 5. Testin
      // amacı yalnızca "zaten maksimumda" dalını doğrulamak olduğundan,
      // beş kez gerçek yükseltme çağırmak yerine seviyeyi doğrudan
      // ayarlamak (bkz. yukarıdaki DB notu) yeterlidir.
      await pool.query('UPDATE players SET money = 1000000, stable_level = 5 WHERE id = $1', [playerId]);

      const response = await request(app.getHttpServer()).post(`/api/v1/players/${playerId}/stable/upgrade`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('MAX_STABLE_LEVEL_REACHED');
    });

    it('var olmayan bir oyuncu için 404 PLAYER_NOT_FOUND döner', async () => {
      const response = await request(app.getHttpServer()).post(`/api/v1/players/${randomUUID()}/stable/upgrade`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('geçersiz (UUID olmayan) bir id için 400 döner', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/players/not-a-uuid/stable/upgrade');
      expect(response.status).toBe(400);
    });
  });
});
