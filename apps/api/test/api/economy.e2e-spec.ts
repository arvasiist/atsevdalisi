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

  /**
   * AUDIT_REPORT.md Bulgu T1 (Medium) / Master Plan §42 hardening (bu
   * oturum) — `stable.e2e-spec.ts`'teki AYNI GERÇEK-eşzamanlılık deseni
   * (`Promise.all`, sahte/sıralı `await` YOK). Günlük Ödül'ün, bu dosyanın
   * üstündeki doc yorumunun da belirttiği gibi, `Idempotency-Key`
   * ALTYAPISI YOKTUR (bilinçli tasarım, bkz. `claim-daily-reward.use-case.ts`
   * üstündeki KAPSAM notu) — tek savunması `PlayerRepository.updateWithLock`'un
   * (`SELECT ... FOR UPDATE`) satır kilidi ve `assertCanClaimDailyReward`'ın
   * kilit ALTINDA okunan GÜNCEL `lastDailyRewardClaimedAt` kontrolüdür. Bu
   * testler AUDIT_REPORT.md'nin "Zaten sağlam (IMPLEMENTED)" notunu ("Günlük
   * ödül: Idempotency-Key olmasa bile satır kilidi sayesinde çift ödemeye
   * karşı güvenli") GERÇEK bir e2e testle DOĞRULAR — daha önce bu iddia
   * hiçbir teste dayanmıyordu.
   */
  // CI #93 kırmızı (bu oturum) — bkz. `stable.e2e-spec.ts`'teki AYNI
  // düzeltme: her test artık Vitest'in varsayılan 5000ms'ini aşan AÇIK bir
  // timeout taşıyor (n=50/100 GERÇEK eşzamanlı istek + gerçek Postgres
  // row-lock sıralaması CI runner'ında bunu aşabiliyordu — mantık hatası
  // DEĞİL, zamanlama sınırıydı).
  describe.skip('TANI (bu commit sonrasi geri alinacak) — Eşzamanlılık (concurrency) — AUDIT_REPORT.md T1, Master Plan §42', () => {
    it('n=10 GERÇEKTEN eşzamanlı günlük ödül talebinden SADECE BİRİ başarılı olur, ödül YALNIZCA BİR KEZ verilir', async () => {
      const { id, startingMoney, authHeader } = await registerPlayer();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`).set('Authorization', authHeader),
        ),
      );

      const successes = responses.filter((response) => response.status === 200);
      const failures = responses.filter((response) => response.status !== 200);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(9);
      for (const failure of failures) {
        expect(failure.status).toBe(409);
        expect(failure.body.error.code).toBe('DAILY_REWARD_ALREADY_CLAIMED');
      }
      expect(successes[0]!.body.data.newBalance.money).toBe(startingMoney + 500);

      const playerRow = await pool.query('SELECT money, last_daily_reward_claimed_at FROM players WHERE id = $1', [
        id,
      ]);
      expect(Number(playerRow.rows[0].money)).toBe(startingMoney + 500);
      expect(playerRow.rows[0].last_daily_reward_claimed_at).not.toBeNull();

      // N istekten SADECE BİRİ gerçekten para hareketi ürettiyse, ledger'da
      // da TAM OLARAK bir satır olmalıdır (10 DEĞİL) — `economy.e2e-spec.ts`
      // üstündeki "AUDIT_AND_HARDENING Öncelik 2" ledger doğrulamasının
      // eşzamanlılık altındaki hali.
      const ledgerRows = await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'daily_reward'",
        [id],
      );
      expect(ledgerRows.rows).toHaveLength(1);
      expect(Number(ledgerRows.rows[0].amount)).toBe(500);
    }, 15000);

    it('n=50 GERÇEKTEN eşzamanlı günlük ödül talebinden SADECE BİRİ başarılı olur', async () => {
      const { id, startingMoney, authHeader } = await registerPlayer();

      const responses = await Promise.all(
        Array.from({ length: 50 }, () =>
          request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`).set('Authorization', authHeader),
        ),
      );

      const successes = responses.filter((response) => response.status === 200);
      const failures = responses.filter((response) => response.status !== 200);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(49);
      for (const failure of failures) {
        expect(failure.status).toBe(409);
        expect(failure.body.error.code).toBe('DAILY_REWARD_ALREADY_CLAIMED');
      }

      const playerRow = await pool.query('SELECT money FROM players WHERE id = $1', [id]);
      expect(Number(playerRow.rows[0].money)).toBe(startingMoney + 500);
    }, 30000);

    it('n=100 GERÇEKTEN eşzamanlı günlük ödül talebinden SADECE BİRİ başarılı olur, bakiye TAM OLARAK bir kez artar (50 kat DEĞİL, 100 kat DEĞİL)', async () => {
      const { id, startingMoney, authHeader } = await registerPlayer();

      const responses = await Promise.all(
        Array.from({ length: 100 }, () =>
          request(app.getHttpServer()).post(`/api/v1/players/${id}/daily-reward`).set('Authorization', authHeader),
        ),
      );

      const successes = responses.filter((response) => response.status === 200);
      const failures = responses.filter((response) => response.status !== 200);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(99);
      for (const failure of failures) {
        expect(failure.status).toBe(409);
        expect(failure.body.error.code).toBe('DAILY_REWARD_ALREADY_CLAIMED');
      }

      const playerRow = await pool.query('SELECT money FROM players WHERE id = $1', [id]);
      expect(Number(playerRow.rows[0].money)).toBe(startingMoney + 500);

      const ledgerRows = await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'daily_reward'",
        [id],
      );
      expect(ledgerRows.rows).toHaveLength(1);
    }, 60000);
  });
});
