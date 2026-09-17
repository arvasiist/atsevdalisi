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

    /**
     * AUDIT_REPORT.md Bulgu T1 (Medium) / Master Plan §42 hardening (bu
     * oturum) — `market.e2e-spec.ts`'teki AYNI GERÇEK-eşzamanlılık deseni
     * (`Promise.all`, hiçbir sahte/sıralı `await` YOK) burada Ahır
     * Yükseltme için tekrarlanır. Her istek FARKLI bir `Idempotency-Key`
     * taşır — AYNI anahtar kullanılsaydı `IdempotencyInterceptor`
     * (Postgres `idempotency_keys` PRIMARY KEY rezervasyonu) istekleri
     * use-case'e HİÇ ULAŞTIRMADAN kendi başına serileştirirdi (bkz. o
     * dosyanın doc yorumu) — bu da `UpgradeStableUseCase.execute`'in
     * KENDİ satır kilidinin (`PlayerRepository.updateWithLock` → `SELECT
     * ... FOR UPDATE`) gerçekten çalışıp çalışmadığını GİZLERDİ. Farklı
     * anahtarlarla her istek use-case'e ayrı ayrı ulaşır, satır kilidi
     * TEK savunma hattı olarak gerçekten test edilmiş olur.
     */
    describe('Eşzamanlılık (concurrency) — AUDIT_REPORT.md T1, Master Plan §42', () => {
      it('n=10 GERÇEKTEN eşzamanlı yükseltme isteğinden (tam olarak BİR yükseltmeye yetecek bakiyeyle) SADECE BİRİ başarılı olur, para YALNIZCA BİR KEZ düşer', async () => {
        const { id: playerId, authHeader } = await registerPlayer();
        // config/stable.config.json: seviye 2 maliyeti TAM OLARAK 8000 —
        // bilerek ikinci bir yükseltmeye ASLA yetmeyecek şekilde ayarlanır,
        // böylece "başarı sayısı" `FOR UPDATE` kilidinin GERÇEKTEN
        // serileştirdiğinin doğrudan kanıtı olur (kilit olmasaydı, N
        // isteğin hepsi AYNI stale `player.money`/`stableLevel`'i okuyup
        // hepsi "yeterli bakiye" sanıp N kez 200 dönebilirdi).
        await pool.query('UPDATE players SET money = 8000 WHERE id = $1', [playerId]);

        const responses = await Promise.all(
          Array.from({ length: 10 }, () =>
            request(app.getHttpServer())
              .post(`/api/v1/players/${playerId}/stable/upgrade`)
              .set('Authorization', authHeader)
              .set('Idempotency-Key', randomUUID()),
          ),
        );

        const successes = responses.filter((response) => response.status === 200);
        const failures = responses.filter((response) => response.status !== 200);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(9);
        for (const failure of failures) {
          expect(failure.status).toBe(409);
          expect(failure.body.error.code).toBe('INSUFFICIENT_FUNDS');
        }
        expect(successes[0]!.body.data.newStableLevel).toBe(2);
        expect(successes[0]!.body.data.newBalance.money).toBe(0);

        const finalRow = await pool.query('SELECT money, stable_level FROM players WHERE id = $1', [playerId]);
        expect(Number(finalRow.rows[0].money)).toBe(0);
        expect(finalRow.rows[0].stable_level).toBe(2);
      });

      it('n=50 GERÇEKTEN eşzamanlı yükseltme isteğinden (BOL bakiyeyle) TAM OLARAK 4 tanesi başarılı olur (seviye 1→5), toplam düşülen tutar GERÇEK maliyetler toplamına birebir eşittir', async () => {
        const { id: playerId, authHeader } = await registerPlayer();
        // config/stable.config.json: seviye 2/3/4/5 maliyetleri toplamı.
        const totalUpgradeCost = 8000 + 20000 + 45000 + 90000;
        const startingMoney = totalUpgradeCost + 1_000_000;
        await pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, startingMoney]);

        const responses = await Promise.all(
          Array.from({ length: 50 }, () =>
            request(app.getHttpServer())
              .post(`/api/v1/players/${playerId}/stable/upgrade`)
              .set('Authorization', authHeader)
              .set('Idempotency-Key', randomUUID()),
          ),
        );

        const successes = responses.filter((response) => response.status === 200);
        const failures = responses.filter((response) => response.status !== 200);
        // Yalnızca 4 gerçek yükseltme mümkündür (seviye 1→2→3→4→5) — geri
        // kalan 46 istek, kilit sayesinde GÜNCEL (stale OLMAYAN) seviyeyi
        // görüp `MAX_STABLE_LEVEL_REACHED` almalıdır (`INSUFFICIENT_FUNDS`
        // DEĞİL — bakiye bol, engel artık seviye tavanıdır).
        expect(successes).toHaveLength(4);
        expect(failures).toHaveLength(46);
        for (const failure of failures) {
          expect(failure.status).toBe(409);
          expect(failure.body.error.code).toBe('MAX_STABLE_LEVEL_REACHED');
        }

        const reachedLevels = successes
          .map((response) => response.body.data.newStableLevel as number)
          .sort((a, b) => a - b);
        expect(reachedLevels).toEqual([2, 3, 4, 5]);

        const finalRow = await pool.query('SELECT money, stable_level FROM players WHERE id = $1', [playerId]);
        expect(finalRow.rows[0].stable_level).toBe(5);
        // Kilit gerçekten çalışıyorsa toplam düşüş TAM OLARAK dört
        // maliyetin toplamıdır — ne "lost update" nedeniyle EKSİK (bir
        // yükseltmenin ücretinin hiç düşmemesi), ne de bir yarış koşulu
        // nedeniyle FAZLA (aynı seviyenin ücretinin birden çok kez
        // düşmesi).
        expect(Number(finalRow.rows[0].money)).toBe(startingMoney - totalUpgradeCost);
      });

      it('n=100 GERÇEKTEN eşzamanlı yükseltme isteğinden (BOL bakiyeyle) yine TAM OLARAK 4 tanesi başarılı olur — yük artsa da tutarlılık BOZULMAZ', async () => {
        const { id: playerId, authHeader } = await registerPlayer();
        const totalUpgradeCost = 8000 + 20000 + 45000 + 90000;
        const startingMoney = totalUpgradeCost + 1_000_000;
        await pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, startingMoney]);

        const responses = await Promise.all(
          Array.from({ length: 100 }, () =>
            request(app.getHttpServer())
              .post(`/api/v1/players/${playerId}/stable/upgrade`)
              .set('Authorization', authHeader)
              .set('Idempotency-Key', randomUUID()),
          ),
        );

        const successes = responses.filter((response) => response.status === 200);
        const failures = responses.filter((response) => response.status !== 200);
        expect(successes).toHaveLength(4);
        expect(failures).toHaveLength(96);
        for (const failure of failures) {
          expect(failure.status).toBe(409);
          expect(failure.body.error.code).toBe('MAX_STABLE_LEVEL_REACHED');
        }

        const reachedLevels = successes
          .map((response) => response.body.data.newStableLevel as number)
          .sort((a, b) => a - b);
        expect(reachedLevels).toEqual([2, 3, 4, 5]);

        const finalRow = await pool.query('SELECT money, stable_level FROM players WHERE id = $1', [playerId]);
        expect(finalRow.rows[0].stable_level).toBe(5);
        expect(Number(finalRow.rows[0].money)).toBe(startingMoney - totalUpgradeCost);
      });
    });
  });
});
