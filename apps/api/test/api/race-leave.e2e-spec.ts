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
 * YARIŞTAN AYRILMA + GİRİŞ ÜCRETİ İADESİ — `POST /races/:id/leave`
 * (brief §20 `REFUND`, §42 PHASE 4c).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **PARA GERÇEKTEN GERİ DÖNER.** Bakiye katılımdan ÖNCEKİ değerine
 *     döner, `races.prize_pool` aynı tutar kadar KÜÇÜLÜR ve defter
 *     `race_entry_refund` satırını YAZAR. Üçü tek transaction'dadır.
 *  2. **İADE TUTARI DEFTERDEN GELİR**, `races.entry_fee`'den değil — bu
 *     yüzden ücret politikası sonradan değişse bile iade ödenen tutardır.
 *  3. **ÇİFT İADE YOK.** Aynı `Idempotency-Key` ile ikinci istek use-case'e
 *     HİÇ ULAŞMAZ; ikinci bir defter satırı doğmaz.
 *  4. **KATILIM SİLİNMEZ, `cancelled` OLUR** ve aynı oyuncu yeniden
 *     KATILAMAZ (`RACE_ENTRY_CANCELLED`), ama boşalan koltuk BAŞKASINA
 *     açıktır. İptal edilen katılım lobi doluluğunda SAYILMAZ.
 *  5. **ÜCRETSİZ YARIŞTA defter satırı YAZILMAZ** ve `players` satırına
 *     hiç dokunulmaz (sıfır tutarlı bir satır `CHECK (amount <> 0)`'ı
 *     ihlal ederdi).
 *  6. **SUNUCU OTORİTESİ.** İptal edilen katılım TOKEN'daki oyuncunundur;
 *     başkasının katılımı bu uçtan iptal edilemez (404).
 *  7. **HER RET NEDENİ AYRI VE DOĞRU KODLA DÖNER:** 400 eksik anahtar,
 *     404 kaynak yok, 409 pencere kapalı.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Yarıştan ayrılma (e2e) — POST /races/:id/leave', () => {
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
  /** Testlerin kullandığı varsayılan giriş ücreti. */
  const ENTRY_FEE = 50;

  /** `POST /races` ile bir yarış açar. */
  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const entryFee = (override.entryFee as number | undefined) ?? ENTRY_FEE;
    const body = {
      name: 'Ayrılık Kupası',
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

  /** Oyuncuyu yarışa katar (PHASE 1b) — ayrılmanın ön koşulu. */
  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /**
   * Ayrılma isteği — durum kodu DAYATMAYAN sürüm. `key` verilmezse yeni bir
   * anahtar üretilir; `null` verilirse header HİÇ gönderilmez (400 testi).
   */
  function rawLeave(player: RegisteredTestPlayer, raceId: string, key: string | null = randomUUID()) {
    const req = request(app.getHttpServer()).post(`${racesUrl}/${raceId}/leave`);
    if (key !== null) {
      req.set('Idempotency-Key', key);
    }
    return req.set('Authorization', player.authHeader);
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

  /** Bu oyuncunun bu yarış için yazdığı `race_entry_refund` satırları. */
  async function refundRowsOf(
    playerId: string,
    raceId: string,
  ): Promise<Array<{ amount: string; balance_before: string; balance_after: string }>> {
    const result = await pool.query<{ amount: string; balance_before: string; balance_after: string }>(
      `SELECT amount, balance_before, balance_after
       FROM economy_transactions
       WHERE player_id = $1 AND type = 'race_entry_refund' AND reference_id = $2
       ORDER BY created_at`,
      [playerId, raceId],
    );
    return result.rows;
  }

  async function ledgerCountOf(playerId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM economy_transactions WHERE player_id = $1',
      [playerId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  describe('mutlu yol — iade gerçekten yapılır', () => {
    it('bakiye geri döner, havuz KÜÇÜLÜR, katılım `cancelled` olur', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Ayrılık Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Ayrılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // Katılım GERÇEKTEN ücret aldı mı? (Sonraki karşılaştırmanın anlamlı
      // olması için "önce" durumu ayrıca ölçülür.)
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
      expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE);

      const response = await rawLeave(player, raceId).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(raceId);
      // İptal edilen katılım DOLULUK SAYILMAZ — bu, havuzun küçülmesiyle
      // tutarlı olması gereken sayıdır (bkz. dosya başı madde 4).
      expect(response.body.data.joinedPlayers).toBe(0);

      expect(await entryStatusOf(raceId, player.playerId)).toBe('cancelled');
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY);
      expect(await prizePoolOf(raceId)).toBe(0);

      const refunds = await refundRowsOf(player.playerId, raceId);
      expect(refunds).toHaveLength(1);
      expect(Number(refunds[0]?.amount)).toBe(ENTRY_FEE);
      // Defter kendi içinde tutarlı olmak zorundadır (migration 0019 CHECK):
      // iade öncesi/sonrası bakiyeyi burada AYRICA doğruluyoruz ki satır
      // gerçekten bu iadeye ait olsun.
      expect(Number(refunds[0]?.balance_before)).toBe(STARTING_MONEY - ENTRY_FEE);
      expect(Number(refunds[0]?.balance_after)).toBe(STARTING_MONEY);
    });

    it('AYNI Idempotency-Key ile ikinci istek İKİNCİ kez iade ETMEZ', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Anahtar Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Anahtar Kullanan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      const key = randomUUID();
      await rawLeave(player, raceId, key).expect(200);
      const ledgerAfterFirst = await ledgerCountOf(player.playerId);

      // Aynı anahtar → interceptor önbellekten İLK yanıtı döner, use-case
      // HİÇ ÇALIŞMAZ. Yani ikinci bir iade satırı doğmaz.
      const second = await rawLeave(player, raceId, key).expect(200);

      expect(second.body.data.id).toBe(raceId);
      expect(await refundRowsOf(player.playerId, raceId)).toHaveLength(1);
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY);
      expect(await ledgerCountOf(player.playerId)).toBe(ledgerAfterFirst);
    });

    it('ÜCRETSİZ yarışta defter satırı YAZILMAZ ve bakiye değişmez', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bedava Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Bedava Ayrılan');
      const raceId = await createRace(creator, { entryFee: 0 });
      await join(player, raceId);

      const moneyBefore = await moneyOf(player.playerId);
      const ledgerBefore = await ledgerCountOf(player.playerId);

      await rawLeave(player, raceId).expect(200);

      expect(await entryStatusOf(raceId, player.playerId)).toBe('cancelled');
      expect(await moneyOf(player.playerId)).toBe(moneyBefore);
      // Sıfır tutarlı bir defter satırı `CHECK (amount <> 0)`'ı ihlal
      // ederdi; üstelik anlatacak bir para hareketi de yoktur.
      expect(await ledgerCountOf(player.playerId)).toBe(ledgerBefore);
      expect(await refundRowsOf(player.playerId, raceId)).toHaveLength(0);
      expect(await prizePoolOf(raceId)).toBe(0);
    });
  });

  describe('iptal edilen katılım — koltuk kime açık', () => {
    it('aynı oyuncu YENİDEN KATILAMAZ (409 RACE_ENTRY_CANCELLED)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tekrar Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Tekrar Deneyen');
      const raceId = await createRace(creator);
      await join(player, raceId);
      await rawLeave(player, raceId).expect(200);

      const response = await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/join`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: player.horseId })
        .expect(409);

      // `ALREADY_JOINED_RACE` DEĞİL: oyuncu yarışta DEĞİLDİR, iptal
      // etmiştir ve yeniden katılması bilinçli olarak engellenmiştir.
      expect(response.body.error.code).toBe('RACE_ENTRY_CANCELLED');
      // Ve hiçbir ikinci ücret alınmamalı.
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY);
      expect(await entryStatusOf(raceId, player.playerId)).toBe('cancelled');
    });

    it('boşalan koltuk BAŞKASINA açıktır ve doluluk doğru sayılır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Koltuk Kuran');
      const leaver = await registerTestPlayerWithStarterHorse(app, 'Koltuk Bırakan');
      const newcomer = await registerTestPlayerWithStarterHorse(app, 'Koltuk Alan');
      const raceId = await createRace(creator);
      await join(leaver, raceId);

      const leaveResponse = await rawLeave(leaver, raceId).expect(200);
      // `cancelled` satır DURUR (silinmez) ama SAYILMAZ.
      expect(leaveResponse.body.data.joinedPlayers).toBe(0);

      // Boşalan koltuğa BAŞKASI girebilir — iptal, yarışı kapatmaz.
      const joinResponse = await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/join`)
        .set('Authorization', newcomer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: newcomer.horseId })
        .expect(200);
      expect(joinResponse.body.data.joinedPlayers).toBe(1);

      // Satır SİLİNMEDİ (2 satır: biri `cancelled`) ama yanıtlardaki
      // doluluk 0 → 1'dir. Bu sayı `listLobbyRaces` ile AYNI
      // `FILTER (WHERE status IS DISTINCT FROM 'cancelled')` ifadesinden
      // gelir (bkz. `rowToLobbyRaceView`), yani "havuz = ödenen ücretler"
      // değişmezinin dayandığı sayım kuralı burada kanıtlanmış olur.
      //
      // Lobi LİSTESİ ucundan okumak bilinçli olarak TERCİH EDİLMEDİ: liste
      // `ORDER BY start_time ASC LIMIT 100`'dür ve tüm e2e dosyaları aynı
      // "now + 1 saat" başlangıcını ürettiğinden, bu dosyanın yarışı
      // sıralamada keyfî bir yere düşer — test kendi konusundan bağımsız
      // bir sebepten kırılgan olurdu.
      const rowCount = await pool.query<{ c: string }>(
        'SELECT COUNT(*) AS c FROM race_entries WHERE race_id = $1',
        [raceId],
      );
      expect(rowCount.rows[0]?.c).toBe('2');
    });
  });

  describe('sunucu otoritesi', () => {
    it('BAŞKASININ katılımı bu uçtan iptal edilemez (404)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sahip Kuran');
      const owner = await registerTestPlayerWithStarterHorse(app, 'Katılan');
      const intruder = await registerTestPlayerWithStarterHorse(app, 'Davetsiz');
      const raceId = await createRace(creator);
      await join(owner, raceId);

      const response = await rawLeave(intruder, raceId).expect(404);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_FOUND');
      // Sahibinin katılımı ve parası DEĞİŞMEMİŞ olmalı.
      expect(await entryStatusOf(raceId, owner.playerId)).toBe('waiting');
      expect(await moneyOf(owner.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
      expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE);
    });

    it('token YOKSA 401 döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tokensiz Kuran');
      const raceId = await createRace(creator);

      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/leave`)
        .set('Idempotency-Key', randomUUID())
        .expect(401);
    });
  });

  describe('girdi ve pencere redleri — 400/404/409', () => {
    it('`Idempotency-Key` YOKSA 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Anahatsiz Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Anahatsiz Ayrılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      const response = await rawLeave(player, raceId, null).expect(400);

      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      // Anahtar yoksa HİÇBİR ŞEY yazılmamalı — ne iade, ne iptal.
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
    });

    it('bilinmeyen yarış 404 RACE_NOT_FOUND döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Bilinmez Ayrılan');

      const response = await rawLeave(player, randomUUID()).expect(404);

      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('katılımı OLMAYAN oyuncu 404 RACE_ENTRY_NOT_FOUND döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Yalnız Kuran');
      const stranger = await registerTestPlayerWithStarterHorse(app, 'Katılmayan Ayrılan');
      const raceId = await createRace(creator);

      const response = await rawLeave(stranger, raceId).expect(404);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_FOUND');
    });

    it('yarış `scheduled` DEĞİLSE 409 RACE_ENTRY_NOT_LEAVABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Koşan Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Koşandan Ayrılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // `races_status_check` (migration 0006) yalnızca
      // ('scheduled','in_progress','finished','cancelled') kabul eder.
      await pool.query("UPDATE races SET status = 'in_progress' WHERE id = $1", [raceId]);

      const response = await rawLeave(player, raceId).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_LEAVABLE');
      // Yarış başladıysa iade YOKTUR.
      expect(await entryStatusOf(raceId, player.playerId)).toBe('waiting');
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
    });

    it('başlangıç zamanı GEÇMİŞSE 409 RACE_ENTRY_NOT_LEAVABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Geç Ayrılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

      const response = await rawLeave(player, raceId).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_LEAVABLE');
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
    });

    it('zaten İPTAL edilmiş katılım 409 RACE_ENTRY_NOT_LEAVABLE döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'İptalli Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'İptalli Ayrılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // FARKLI bir anahtarla ikinci ayrılma: interceptor devreye girmez,
      // yani kuralın KENDİSİ sınanır (aynı anahtarla denenseydi önbellekten
      // 200 dönerdi ve domain kararı hiç çalışmazdı).
      await rawLeave(player, raceId).expect(200);
      const response = await rawLeave(player, raceId).expect(409);

      expect(response.body.error.code).toBe('RACE_ENTRY_NOT_LEAVABLE');
      // İkinci bir iade YOKTUR.
      expect(await refundRowsOf(player.playerId, raceId)).toHaveLength(1);
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY);
    });
  });
});
