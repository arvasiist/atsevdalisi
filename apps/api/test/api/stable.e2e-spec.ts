import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer } from './test-helpers';

/**
 * FAZ 1 wiring — Üçüncü dilim: `GET /players/:id/stable-summary` (brief
 * §38 "Ahır Özeti"); Altıncı dilim: `POST /players/:id/stable/upgrade`
 * (brief §32). `player.e2e-spec.ts`/`horse.e2e-spec.ts` ile AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — hem `:id/stable-summary`
 * hem `:id/stable/upgrade` artık `assertSelf` ile korunur (bkz.
 * `stable.controller.ts`): yalnızca oturum sahibi KENDİ ahırını
 * görüntüleyebilir/yükseltebilir. "var olmayan bir oyuncu için 404" eski
 * test senaryoları ARTIK ULAŞILAMAZ (`assertSelf` use-case'den ÖNCE
 * çalışır) — bkz. `player.e2e-spec.ts`/`economy.e2e-spec.ts`'teki AYNI
 * değişiklik ve gerekçe; bunlar 403 testleriyle DEĞİŞTİRİLDİ.
 * `Idempotency-Key` kapsamı `stable/upgrade` için DEĞİŞMEDİ (hâlâ
 * `req.params.id` bazlı — bkz. `idempotency.interceptor.ts` doc yorumu,
 * yalnızca `market/listings/:id/buy` `'player'` kapsamına geçti).
 */
describe('Stable summary (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();

    // Ahır Yükseltme testleri için: yeni bir oyuncu yalnızca 5000 para ile
    // başlar (config/economy.config.json `newPlayerStartingBalance`),
    // ama seviye 2'ye yükseltme 8000 para tutar. Bu dilimde bir "para
    // kazanma" uç noktası (günlük ödül/yarış ödülü) henüz BAĞLANMADI, bu
    // yüzden başarı senaryosunu test edebilmek için uygulamanın kendi
    // DB havuzu üzerinden DOĞRUDAN bir bakiye artırımı yapılır — gerçek
    // bir kullanıcı akışı DEĞİL, yalnızca test kurulumu.
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerPlayer(): Promise<{ id: string; authHeader: string }> {
    const player = await registerTestPlayer(app, 'Ahır Sahibi');
    return { id: player.playerId, authHeader: player.authHeader };
  }

  it('/api/v1/players/:id/stable-summary (GET) — yeni oyuncu için doğru başlangıç özetini döner', async () => {
    const { id: playerId, authHeader } = await registerPlayer();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/stable-summary`)
      .set('Authorization', authHeader);

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

  it('/api/v1/players/:id/stable-summary (GET) Authorization header olmadan 401 döner', async () => {
    const { id: playerId } = await registerPlayer();
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/stable-summary`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/players/:id/stable-summary (GET) başkasının ahır özetini isteyen istek 403 döner (AUDIT_REPORT.md S4)', async () => {
    const target = await registerPlayer();
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${target.id}/stable-summary`)
      .set('Authorization', attacker.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/players/:id/stable-summary (GET) var olmayan (kendisi olmayan) bir oyuncu id si için 403 döner', async () => {
    const { authHeader } = await registerPlayer();
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${randomUUID()}/stable-summary`)
      .set('Authorization', authHeader);
    expect(response.status).toBe(403);
  });

  it('/api/v1/players/:id/stable-summary (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const { authHeader } = await registerPlayer();
    const response = await request(app.getHttpServer())
      .get('/api/v1/players/not-a-uuid/stable-summary')
      .set('Authorization', authHeader);
    expect(response.status).toBe(400);
  });

  describe('POST /api/v1/players/:id/stable/upgrade (FAZ 1 wiring, altıncı dilim; onuncu dilimde Idempotency-Key eklendi)', () => {
    it('yeterli bakiyeyle seviye 1 → 2 yükseltir, bakiyeden düşer ve yeni kapasiteyi döner', async () => {
      const { id: playerId, authHeader } = await registerPlayer();
      // Test kurulumu: bakiyeyi 20000'e çıkar (bkz. beforeAll notu).
      await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [playerId]);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // config/stable.config.json: seviye 2 maliyeti 8000 para.
      expect(response.body.data.newStableLevel).toBe(2);
      expect(response.body.data.newCapacity).toBe(8);
      expect(response.body.data.cost).toEqual({ currency: 'money', amount: 8000 });
      expect(response.body.data.newBalance.money).toBe(20000 - 8000);

      // Ahır Özeti de güncellenmiş seviyeyi/kapasiteyi yansıtmalı.
      const summary = await request(app.getHttpServer())
        .get(`/api/v1/players/${playerId}/stable-summary`)
        .set('Authorization', authHeader);
      expect(summary.body.data.stableLevel).toBe(2);
      expect(summary.body.data.capacity).toBe(8);
    });

    it('yetersiz bakiyede 409 INSUFFICIENT_FUNDS döner ve bakiyeyi/seviyeyi DEĞİŞTİRMEZ', async () => {
      const { id: playerId, authHeader } = await registerPlayer();
      // Yeni oyuncu yalnızca 5000 para ile başlar, seviye 2 8000 tutar.

      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Transaction ROLLBACK oldu mu? Bakiye/seviye HİÇ değişmemiş olmalı.
      const summary = await request(app.getHttpServer())
        .get(`/api/v1/players/${playerId}/stable-summary`)
        .set('Authorization', authHeader);
      expect(summary.body.data.stableLevel).toBe(1);
    });

    it('zaten en yüksek seviyedeyken 409 MAX_STABLE_LEVEL_REACHED döner', async () => {
      const { id: playerId, authHeader } = await registerPlayer();
      // config/stable.config.json: en yüksek tanımlı seviye 5. Testin
      // amacı yalnızca "zaten maksimumda" dalını doğrulamak olduğundan,
      // beş kez gerçek yükseltme çağırmak yerine seviyeyi doğrudan
      // ayarlamak (bkz. yukarıdaki DB notu) yeterlidir.
      await pool.query('UPDATE players SET money = 1000000, stable_level = 5 WHERE id = $1', [playerId]);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('MAX_STABLE_LEVEL_REACHED');
    });

    it('Authorization header olmadan 401 döner', async () => {
      const { id: playerId } = await registerPlayer();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Idempotency-Key', randomUUID());
      expect(response.status).toBe(401);
    });

    it('başkası adına yükseltmeye çalışan istek 403 döner (AUDIT_REPORT.md S4)', async () => {
      const target = await registerPlayer();
      await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [target.id]);
      const attacker = await registerTestPlayer(app, 'Saldırgan');

      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${target.id}/stable/upgrade`)
        .set('Authorization', attacker.authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      const summary = await request(app.getHttpServer())
        .get(`/api/v1/players/${target.id}/stable-summary`)
        .set('Authorization', target.authHeader);
      expect(summary.body.data.stableLevel).toBe(1);
    });

    it('geçersiz (UUID olmayan) bir id için 400 döner', async () => {
      const { authHeader } = await registerPlayer();
      const response = await request(app.getHttpServer())
        .post('/api/v1/players/not-a-uuid/stable/upgrade')
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID());
      expect(response.status).toBe(400);
    });

    it('Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner ve HİÇBİR ŞEY yazılmaz', async () => {
      const { id: playerId, authHeader } = await registerPlayer();
      await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [playerId]);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const summary = await request(app.getHttpServer())
        .get(`/api/v1/players/${playerId}/stable-summary`)
        .set('Authorization', authHeader);
      expect(summary.body.data.stableLevel).toBe(1);
    });

    it('AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR bakiyeden düşmez', async () => {
      const { id: playerId, authHeader } = await registerPlayer();
      await pool.query('UPDATE players SET money = 20000 WHERE id = $1', [playerId]);
      const idempotencyKey = randomUUID();

      const first = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/players/${playerId}/stable/upgrade`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .expect(200);

      // AYNI sonuç — yükseltme GERÇEKTEN tekrar çalıştırılmadı (docs/SECURITY.md §4).
      expect(second.body.data).toEqual(first.body.data);

      // Seviye 2'de kalmalı (3'e YÜKSELMEMİŞ olmalı) ve bakiye SADECE BİR
      // KEZ düşülmüş olmalı (BIGINT sütun — pg string döner, bkz.
      // race.e2e-spec.ts'teki AYNI not).
      const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
      expect(Number(moneyRow.rows[0].money)).toBe(first.body.data.newBalance.money);

      const summary = await request(app.getHttpServer())
        .get(`/api/v1/players/${playerId}/stable-summary`)
        .set('Authorization', authHeader);
      expect(summary.body.data.stableLevel).toBe(2);
    });
  });
});
