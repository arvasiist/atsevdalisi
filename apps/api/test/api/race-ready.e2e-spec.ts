import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * READY DÜĞMESİ — `POST /races/:id/ready` (brief §6, §42 PHASE 3).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **DURUM GERÇEKTEN YAZILIR.** `race_entries.status` `waiting` →
 *     `ready` → `not_ready` geçer ve yanıt GÜNCELLENMİŞ lobi görünümüdür.
 *  2. **BU BİR PARA YOLU DEĞİLDİR.** Bakiye, `races.prize_pool` ve
 *     `economy_transactions` READY'den SONRA TIPATIP AYNI kalır. "Hazırım"
 *     demek ödenmiş ücreti geri almaz — ücret katılım anında (PHASE 1b)
 *     tahsil edilmiştir. Bu, `race-join.e2e-spec.ts`'in aynasıdır.
 *  3. **IDEMPOTENT.** Aynı değeri iki kez yazmak 200 döner ve İKİNCİ bir
 *     satır/düşüm üretmez (`Idempotency-Key` de GEREKMEZ — bkz.
 *     `SetEntryReadyUseCase` doc yorumu).
 *  4. **SUNUCU OTORİTESİ.** Değiştirilen satır TOKEN'daki oyuncunundur;
 *     başkasının katılımı bu uçtan değiştirilemez (404).
 *  5. **HER RET NEDENİ AYRI VE DOĞRU KODLA DÖNER:** 400 doğrulama (500
 *     DEĞİL), 404 katılım yok, 409 pencere kapalı.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('READY düğmesi (e2e) — POST /races/:id/ready', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  /** `config/economy.config.json` → `newPlayerStartingBalance.money`. */
  const STARTING_MONEY = 5_000;

  /** `POST /races` ile bir yarış açar. */
  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const entryFee = (override.entryFee as number | undefined) ?? 50;
    const body = {
      name: 'Hazırlık Kupası',
      fieldSize: 12,
      maxPlayers: 8,
      entryFee,
      raceType: entryFee > 0 ? 'paid' : 'free',
      startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      surface: 'grass',
      weather: 'sunny',
      distanceMeters: 1_600,
      tribuneFee: 0,
      spectatorCapacity: 500,
      ...override,
    };
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send(body)
      .expect(201);
    return response.body.data.id as string;
  }

  /** Oyuncuyu yarışa katar (PHASE 1b) — READY'nin ön koşulu. */
  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /** Durum kodu DAYATMAYAN READY isteği. */
  function rawReady(player: RegisteredTestPlayer, raceId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send(body);
  }

  async function entryStatusOf(raceId: string, playerId: string): Promise<string | null | undefined> {
    const result = await pool.query<{ status: string | null }>(
      'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2',
      [raceId, playerId],
    );
    return result.rows[0]?.status;
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0]?.money ?? '0');
  }

  async function prizePoolOf(raceId: string): Promise<number> {
    const result = await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId]);
    return Number(result.rows[0]?.prize_pool ?? '0');
  }

  async function ledgerCountOf(playerId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM economy_transactions WHERE player_id = $1',
      [playerId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  describe('mutlu yol', () => {
    it('`ready` yazılır, lobi görünümü döner ve PARA HAREKET ETMEZ', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Hazır Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Hazır Olan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // READY ÖNCESİ durumu sabitliyoruz: karşılaştırmanın anlamlı olması
      // için "öncesi" ve "sonrası" ayrı ayrı ölçülmelidir.
      const moneyBefore = await moneyOf(player.playerId);
      const poolBefore = await prizePoolOf(raceId);
      const ledgerBefore = await ledgerCountOf(player.playerId);
      expect(moneyBefore).toBe(STARTING_MONEY - 50);

      const response = await rawReady(player, raceId, { status: 'ready' }).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(raceId);
      // Doluluk lobi görünümünde KORUNUR — READY katılımı silmez.
      expect(response.body.data.joinedPlayers).toBe(1);

      expect(await entryStatusOf(raceId, player.playerId)).toBe('ready');

      // **PARA YOLU DEĞİL:** üçü de değişmemeli.
      expect(await moneyOf(player.playerId)).toBe(moneyBefore);
      expect(await prizePoolOf(raceId)).toBe(poolBefore);
      expect(await ledgerCountOf(player.playerId)).toBe(ledgerBefore);
    });

    it('`not_ready` ile geri dönülebilir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Geri Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Kararsız');
      const raceId = await createRace(creator);
      await join(player, raceId);

      await rawReady(player, raceId, { status: 'ready' }).expect(200);
      await rawReady(player, raceId, { status: 'not_ready' }).expect(200);

      expect(await entryStatusOf(raceId, player.playerId)).toBe('not_ready');
    });

    it('AYNI değeri iki kez yazmak idempotenttir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tekrar Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Tekrar Eden');
      const raceId = await createRace(creator);
      await join(player, raceId);

      await rawReady(player, raceId, { status: 'ready' }).expect(200);
      const ledgerAfterFirst = await ledgerCountOf(player.playerId);
      await rawReady(player, raceId, { status: 'ready' }).expect(200);

      expect(await entryStatusOf(raceId, player.playerId)).toBe('ready');
      // İkinci çağrı İKİNCİ bir düşüm/satır üretmez — üstelik hiç üretmez.
      expect(await ledgerCountOf(player.playerId)).toBe(ledgerAfterFirst);
    });
  });

  describe('sunucu otoritesi', () => {
    it('BAŞKASININ katılımı bu uçtan değiştirilemez (404)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sahip Kuran');
      const owner = await registerTestPlayerWithStarterHorse(app, 'Katılan');
      const intruder = await registerTestPlayerWithStarterHorse(app, 'Davetsiz');
      const raceId = await createRace(creator);
      await join(owner, raceId);

      // `intruder` bu yarışta HİÇ katılmamıştır; isteği kendi adına yapar.
      const response = await rawReady(intruder, raceId, { status: 'ready' }).expect(404);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_FOUND');
      // Sahibinin satırı DEĞİŞMEMİŞ olmalı.
      expect(await entryStatusOf(raceId, owner.playerId)).toBe('waiting');
    });

    it('token YOKSA 401 döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tokensiz Kuran');
      const raceId = await createRace(creator);

      await request(app.getHttpServer()).post(`${racesUrl}/${raceId}/ready`).send({ status: 'ready' }).expect(401);
    });
  });

  describe('girdi doğrulama — 500 DEĞİL 400 (CLAUDE.md kural 5)', () => {
    it('`status` YOKSA 400 INVALID_ENTRY_READY_INPUT', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Eksik Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Eksik Gönderen');
      const raceId = await createRace(creator);
      await join(player, raceId);

      const response = await rawReady(player, raceId, {}).expect(400);

      expect(response.body.error.code).toBe('INVALID_ENTRY_READY_INPUT');
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
    });

    it('`status: "cancelled"` REDDEDİLİR — iptal ayrı bir iştir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'İptal Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'İptal Eden');
      const raceId = await createRace(creator);
      await join(player, raceId);

      const response = await rawReady(player, raceId, { status: 'cancelled' }).expect(400);

      expect(response.body.error.code).toBe('INVALID_ENTRY_READY_INPUT');
      // Kritik: reddedilmekle kalmamalı, DB'ye de YAZILMAMALI.
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
    });

    it('`status: "waiting"` REDDEDİLİR', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bekleyen Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Bekleyen');
      const raceId = await createRace(creator);
      await join(player, raceId);

      const response = await rawReady(player, raceId, { status: 'waiting' }).expect(400);

      expect(response.body.error.code).toBe('INVALID_ENTRY_READY_INPUT');
    });

    const wrongTyped: Array<[string, unknown]> = [
      ['sayı', 5],
      ['null', null],
      ['dizi', ['ready']],
      ['nesne', { value: 'ready' }],
    ];

    it.each(wrongTyped)('yanlış TİPTE `status` (%s) 500 DEĞİL 400 döner', async (_label, status) => {
      // `ValidationPipe` esbuild altında gövdeyi doğrulamaz; bu girdiler
      // `validateEntryReady`'nin `typeof` kontrolü olmasa TypeError
      // fırlatır ve istemci 500 görürdü.
      const creator = await registerTestPlayerWithStarterHorse(app, `Tip Kuran ${_label}`);
      const player = await registerTestPlayerWithStarterHorse(app, `Tip Gönderen ${_label}`);
      const raceId = await createRace(creator);
      await join(player, raceId);

      const response = await rawReady(player, raceId, { status }).expect(400);

      expect(response.body.error.code).toBe('INVALID_ENTRY_READY_INPUT');
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
    });

    it('bilinmeyen bir metin 400 döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Metin Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Metin Gönderen');
      const raceId = await createRace(creator);
      await join(player, raceId);

      await rawReady(player, raceId, { status: 'hazirim' }).expect(400);
    });
  });

  describe('pencere redleri — 404/409', () => {
    it('bilinmeyen yarış 404 RACE_NOT_FOUND döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Bilinmez');

      const response = await rawReady(player, randomUUID(), { status: 'ready' }).expect(404);

      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('katılımı OLMAYAN oyuncu 404 RACE_ENTRY_NOT_FOUND döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Yalnız Kuran');
      const stranger = await registerTestPlayerWithStarterHorse(app, 'Katılmayan');
      const raceId = await createRace(creator);

      const response = await rawReady(stranger, raceId, { status: 'ready' }).expect(404);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_FOUND');
    });

    it('yarış `scheduled` DEĞİLSE 409 RACE_ENTRY_NOT_READYABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Koşan Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Koşana Hazırlanan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // `races_status_check` (migration 0006) yalnızca
      // ('scheduled','in_progress','finished','cancelled') kabul eder.
      await pool.query("UPDATE races SET status = 'in_progress' WHERE id = $1", [raceId]);

      const response = await rawReady(player, raceId, { status: 'ready' }).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_READYABLE');
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
    });

    it('başlangıç zamanı GEÇMİŞSE 409 RACE_ENTRY_NOT_READYABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Geç Kalan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

      const response = await rawReady(player, raceId, { status: 'ready' }).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_READYABLE');
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
    });

    it('İPTAL edilmiş katılım 409 RACE_ENTRY_NOT_READYABLE döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'İptalli Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'İptalli');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // `cancelled`'a geçmenin bir ucu HENÜZ YOK (iade politikası ayrı bir
      // iş); satır doğrudan DB'den bu duruma getirilir ki kuralın kendisi
      // sınanmış olsun.
      await pool.query("UPDATE race_entries SET status = 'cancelled' WHERE race_id = $1 AND player_id = $2", [
        raceId,
        player.playerId,
      ]);

      const response = await rawReady(player, raceId, { status: 'ready' }).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_READYABLE');
      expect(await entryStatusOf(raceId, player.playerId)).toBe('cancelled');
    });
  });
});
