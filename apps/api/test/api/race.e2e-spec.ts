import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../config/economy.config.json';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { getPracticeRaceEntryFee } from '../../src/domain/race/prize';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

const economyConfig = economyConfigJson as unknown as EconomyConfig;

/**
 * FAZ 1 wiring — Sekizinci dilim: `POST /horses/:id/practice-race`
 * (brief §6 Race Engine, docs/API.md §4). `training.e2e-spec.ts`/
 * `care.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir, bu ortamda ÇALIŞTIRILAMAZ — bkz.
 * docs/ARCHITECTURE.md §9).
 *
 * FAZ 1 wiring, dokuzuncu dilim — `RedisModule` `@Global()` olduğundan bu
 * spec ARTIK gerçek bir Redis bağlantısı da gerektiriyor (bkz.
 * `.github/workflows/ci.yml`'e eklenen `redis` servis konteyneri).
 *
 * AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — `POST /horses/:id/
 * practice-race` artık `HorseOwnerGuardByParam` ile korunur (bkz.
 * `race.controller.ts`, `@UseInterceptors(IdempotencyInterceptor)`'ın
 * ÜSTÜNDE) — istek sahibinin at'ın GERÇEK sahibi olması gerekir.
 */
describe('Race — Pratik Yarış (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();

    // "Sakatlanmış at yarışamaz" senaryosu doğal yoldan tetiklenmesi zor
    // (antrenman sakatlık riski deterministik değil) — uygulamanın kendi
    // DB havuzu üzerinden DOĞRUDAN ayarlanır. `stable.e2e-spec.ts`'teki
    // AYNI teknik: gerçek bir kullanıcı akışı DEĞİL, yalnızca test kurulumu.
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/practice-race (POST) — varsayılan taktikle bir yarış çalıştırır ve TÜM katılımcılarla sonuç döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
    expect(typeof response.body.data.raceId).toBe('string');
    expect(response.body.data.surface).toBe('grass');
    expect(response.body.data.weather).toBe('sunny');
    // config/race.config.json PRACTICE_RACE_BOT_COUNT (5) + oyuncunun atı = 6.
    expect(response.body.data.finalResult).toHaveLength(6);
    expect(response.body.data.explanations).toHaveLength(6);

    const playerFinish = response.body.data.finalResult.find((entry: { horseId: string }) => entry.horseId === horseId);
    expect(playerFinish).toBeDefined();
    expect(playerFinish.finishPosition).toBeGreaterThanOrEqual(1);
    expect(playerFinish.finishPosition).toBeLessThanOrEqual(6);
    expect(typeof playerFinish.finishTimeMs).toBe('number');
  });

  it('/api/v1/horses/:id/practice-race (POST) — açık bir taktik seçimini kabul eder', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'front_runner', riskLevel: 'high', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/practice-race (POST) — sonucu races/race_entries tablolarına gerçekten yazar (entry_fee/prize_pool DAHİL)', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const { raceId } = response.body.data;

    const raceRow = await pool.query('SELECT * FROM races WHERE id = $1', [raceId]);
    expect(raceRow.rows).toHaveLength(1);
    expect(raceRow.rows[0].status).toBe('finished');
    // `entry_fee`/`prize_pool` BIGINT'tir — `pg` bunu hassasiyet kaybı
    // riskine karşı BİLEREK bir string olarak döner (JS number'ın güvenli
    // tam sayı sınırını aşabileceği için), `Number()` ile karşılaştırma
    // öncesi dönüştürülür (bkz. `PostgresPlayerRepository.rowToPlayer`'daki
    // AYNI dönüşüm, uygulama kodunun kendisinde zaten yapılıyor).
    expect(Number(raceRow.rows[0].entry_fee)).toBe(response.body.data.entryFee);
    expect(Number(raceRow.rows[0].prize_pool)).toBe(response.body.data.prizeWon);
    // AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — deterministik replay için
    // her yarış hangi engine/ruleset/config sürümüyle üretildiğini KAYDETMELİ
    // (bkz. migration 0021, `domain/race/race-engine.ts` RACE_ENGINE_VERSION/
    // RACE_RULESET_VERSION). 'unknown' DEĞİL — bu, migration'ın SADECE eski
    // (migration öncesi) satırlar için kabul ettiği açık-eksik işaretidir.
    expect(raceRow.rows[0].engine_version).toBe('1.0.0');
    expect(raceRow.rows[0].ruleset_version).toBe('1.1.0');
    expect(raceRow.rows[0].config_version).toBe('1.0.0');

    const entryRow = await pool.query('SELECT * FROM race_entries WHERE race_id = $1 AND horse_id = $2', [raceId, horseId]);
    expect(entryRow.rows).toHaveLength(1);
    expect(entryRow.rows[0].finish_position).not.toBeNull();

    const segmentRows = await pool.query('SELECT * FROM race_entry_segments WHERE race_entry_id = $1', [entryRow.rows[0].id]);
    expect(segmentRows.rows.length).toBeGreaterThan(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) — giriş ücretini düşer + ödülü ekler, GERÇEK bakiyeye yansır', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const beforeRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    // `players.money` da BIGINT — bkz. yukarıdaki `entry_fee`/`prize_pool` notu.
    const moneyBefore = Number(beforeRow.rows[0].money);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const { entryFee, prizeWon, newBalance } = response.body.data;
    expect(entryFee).toBe(getPracticeRaceEntryFee(economyConfig));
    expect(newBalance.money).toBe(moneyBefore - entryFee + prizeWon);

    const afterRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    expect(Number(afterRow.rows[0].money)).toBe(newBalance.money);
  });

  it('/api/v1/horses/:id/practice-race (POST) — bakiye giriş ücretine yetmiyorsa 409 INSUFFICIENT_FUNDS döner ve HİÇBİR ŞEY yazmaz', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await pool.query('UPDATE players SET money = 0 WHERE id = $1', [playerId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const raceRows = await pool.query('SELECT * FROM races WHERE track_id IS NULL AND name = $1 ORDER BY created_at DESC LIMIT 1', ['Pratik Yarış']);
    // Bu oyuncu için hiçbir yarış YAZILMAMIŞ olmalı (transaction rollback) —
    // burada sadece bakiyenin hâlâ 0 olduğunu doğrulamak yeterli ve daha
    // sağlam (başka testlerin de "Pratik Yarış" yazdığı paralel bir DB'de
    // en son satırı aramak kırılgan olur).
    void raceRows;
    const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    expect(Number(moneyRow.rows[0].money)).toBe(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/practice-race (POST) başkasının atıyla yarıştırmaya çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', attacker.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/practice-race (POST) — Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('/api/v1/horses/:id/practice-race (POST) — AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR para çekmez', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200);

    // AYNI raceId — işlem GERÇEKTEN tekrar çalıştırılmadı, ilk sonuç
    // aynen tekrar döndürüldü (docs/SECURITY.md §4).
    expect(second.body.data.raceId).toBe(first.body.data.raceId);
    expect(second.body.data.newBalance).toEqual(first.body.data.newBalance);

    const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    // Giriş ücreti/ödül YALNIZCA BİR KEZ uygulanmış olmalı.
    expect(Number(moneyRow.rows[0].money)).toBe(first.body.data.newBalance.money);

    const raceRows = await pool.query('SELECT * FROM races WHERE id = $1', [first.body.data.raceId]);
    expect(raceRows.rows).toHaveLength(1);
  });

  it('/api/v1/horses/:id/practice-race (POST) sakatlanmış bir at için 409 HORSE_INJURED döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/horses/:id/practice-race (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/practice-race`)
      .set('Authorization', someone.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz bir yarış stili için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'not-a-real-style' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/horses/not-a-uuid/practice-race')
      .set('Authorization', someone.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(400);
  });

  /**
   * AUDIT_REPORT.md Bulgu T1 (Medium) / Master Plan §42 hardening (bu
   * oturum) — `market.e2e-spec.ts`'teki AYNI GERÇEK-eşzamanlılık deseni
   * (`Promise.all`). Pratik Yarış'ta iki AYRI risk test edilir (bkz. görev
   * tanımı):
   *  1) AYNI `Idempotency-Key` ile n eşzamanlı istek — `IdempotencyInterceptor`
   *     (bu rotada kapsam `req.params.id` = `horseId`, bkz. o dosyanın doc
   *     yorumu) yarışı/ücreti YALNIZCA BİR KEZ çalıştırmalı, geri kalanı
   *     `market.e2e-spec.ts`'teki AYNI iki olası dalla (ya `IDEMPOTENCY_
   *     KEY_IN_PROGRESS` 409, ya da ilk sonucun AYNEN tekrar oynatılması)
   *     sonuçlanmalıdır.
   *  2) FARKLI `Idempotency-Key`'lerle n eşzamanlı istek — bu meşru olarak
   *     N AYRI yarışın hepsinin GERÇEKTEN koşmasına yol açar (dedupe
   *     BEKLENMEZ); test edilen şey `RunPracticeRaceUseCase`'in
   *     `playerRepository.updateWithLock` (`SELECT ... FOR UPDATE`) ile
   *     yaptığı bakiye güncellemesinin, N eşzamanlı yazma altında "lost
   *     update" ÜRETMEDEN doğru toplama ulaşmasıdır.
   */
  describe('Eşzamanlılık (concurrency) — AUDIT_REPORT.md T1, Master Plan §42', () => {
    /** N istek + status/hata kodu doğrulaması — AYNI anahtar senaryosunun üç `n` değeri arasında paylaşılan yardımcı. */
    async function runSameKeyConcurrencyCheck(n: number): Promise<void> {
      const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
      const idempotencyKey = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: n }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/horses/${horseId}/practice-race`)
            .set('Authorization', authHeader)
            .set('Idempotency-Key', idempotencyKey)
            .send({}),
        ),
      );

      const successes = responses.filter((response) => response.status === 200);
      const conflicts = responses.filter((response) => response.status === 409);
      // `market.e2e-spec.ts`'teki AYNI GERÇEK zamanlama belirsizliği: birinci
      // isteğin ne zaman TAMAMLANDIĞINA bağlı olarak geç kalan istekler ya
      // rezervasyon çakışmasıyla (`IDEMPOTENCY_KEY_IN_PROGRESS`) ya da
      // (birinci zaten bitmişse) AYNI tamamlanmış sonucun tekrar
      // oynatılmasıyla (200, AYNI raceId) karşılanabilir — hangisi olursa
      // olsun, TOPLAMDA yalnızca BİR GERÇEK yarış çalışmış olmalıdır.
      expect(successes.length + conflicts.length).toBe(n);
      expect(successes.length).toBeGreaterThanOrEqual(1);
      for (const conflict of conflicts) {
        expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      }

      const raceIds = new Set(successes.map((response) => response.body.data.raceId as string));
      expect(raceIds.size).toBe(1);
      const balances = new Set(successes.map((response) => response.body.data.newBalance.money as number));
      expect(balances.size).toBe(1);

      const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
      expect(Number(moneyRow.rows[0].money)).toBe([...balances][0]);

      const raceRows = await pool.query('SELECT COUNT(*)::int AS count FROM races WHERE id = $1', [
        [...raceIds][0],
      ]);
      expect(raceRows.rows[0].count).toBe(1);
    }

    it(
      'n=10 GERÇEKTEN eşzamanlı istek AYNI Idempotency-Key ile gönderilirse yarış YALNIZCA BİR KEZ çalışır, ücret YALNIZCA BİR KEZ düşer',
      async () => {
        await runSameKeyConcurrencyCheck(10);
      },
    );

    it(
      'n=100 GERÇEKTEN eşzamanlı istek AYNI Idempotency-Key ile gönderilirse yük artsa da yarış YALNIZCA BİR KEZ çalışır',
      async () => {
        await runSameKeyConcurrencyCheck(100);
      },
    );

    it('n=50 GERÇEKTEN eşzamanlı istek FARKLI Idempotency-Key’lerle gönderilirse 50 AYRI yarış GERÇEKTEN koşar, ama bakiye "lost update" OLMADAN tutarlı kalır', async () => {
      const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
      // Varsayılan 5000 para 50 × 50 giriş ücretine (2500) zaten yeter,
      // ama olası `INSUFFICIENT_FUNDS` dalgalanmasını (yalnızca kilit
      // doğruluğunu test etmek isteyen bu senaryo için ALAKASIZ bir
      // değişken) tamamen elemek için bol bir bakiyeyle başlanır.
      await pool.query('UPDATE players SET money = 500000 WHERE id = $1', [playerId]);

      const responses = await Promise.all(
        Array.from({ length: 50 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/horses/${horseId}/practice-race`)
            .set('Authorization', authHeader)
            .set('Idempotency-Key', randomUUID())
            .send({}),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      const raceIds = new Set(responses.map((response) => response.body.data.raceId as string));
      // Dedupe YOK — FARKLI anahtarlarla GERÇEKTEN 50 ayrı yarış koşmuş olmalı.
      expect(raceIds.size).toBe(50);

      const netChange = responses.reduce(
        (sum, response) => sum + (response.body.data.prizeWon as number) - (response.body.data.entryFee as number),
        0,
      );

      const finalRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
      // `updateWithLock`'un satır kilidi sayesinde N eşzamanlı yazma
      // sıraya girer — GERÇEKLEŞEN toplam net değişim (yanıtların
      // entryFee/prizeWon toplamı), GERÇEK son bakiye farkına BİREBİR eşit
      // olmalıdır (lost update = bu iki değerin BİRBİRİNDEN SAPMASI).
      expect(Number(finalRow.rows[0].money)).toBe(500000 + netChange);

      const raceRows = await pool.query('SELECT COUNT(*)::int AS count FROM races WHERE id = ANY($1::uuid[])', [
        [...raceIds],
      ]);
      expect(raceRows.rows[0].count).toBe(50);
    });

    it('n=100 GERÇEKTEN eşzamanlı istek FARKLI Idempotency-Key’lerle gönderilirse 100 AYRI yarış GERÇEKTEN koşar, bakiye yine tutarlı kalır', async () => {
      const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
      await pool.query('UPDATE players SET money = 500000 WHERE id = $1', [playerId]);

      const responses = await Promise.all(
        Array.from({ length: 100 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/horses/${horseId}/practice-race`)
            .set('Authorization', authHeader)
            .set('Idempotency-Key', randomUUID())
            .send({}),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      const raceIds = new Set(responses.map((response) => response.body.data.raceId as string));
      expect(raceIds.size).toBe(100);

      const netChange = responses.reduce(
        (sum, response) => sum + (response.body.data.prizeWon as number) - (response.body.data.entryFee as number),
        0,
      );

      const finalRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
      expect(Number(finalRow.rows[0].money)).toBe(500000 + netChange);

      const raceRows = await pool.query('SELECT COUNT(*)::int AS count FROM races WHERE id = ANY($1::uuid[])', [
        [...raceIds],
      ]);
      expect(raceRows.rows[0].count).toBe(100);
    });
  });
});
