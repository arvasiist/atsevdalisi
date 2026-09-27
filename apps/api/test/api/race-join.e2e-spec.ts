import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  sendConcurrentRequestsBatched,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * YARIŞA KATILMA — `POST /races/:id/join` (brief §2/§3/§6, §42 PHASE 1b).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **PARA GERÇEKTEN HAREKET EDER — VE TAM OLARAK BİR KEZ.** Giriş
 *     ücreti bakiyeden düşülür, `races.prize_pool` aynı miktarda büyür ve
 *     `economy_transactions`'a `lobby_race_entry_fee` satırı yazılır
 *     (CLAUDE.md kural 7: bakiye + defter AYNI transaction'da). Üçünden
 *     biri eksikse test kırmızıdır.
 *  2. **IDEMPOTENCY.** Aynı `Idempotency-Key` ile tekrarlanan istek İKİNCİ
 *     kez ücret ALMAZ (brief §54). `Idempotency-Key` hiç yoksa 400.
 *  3. **SUNUCU OTORİTESİ.** Katılan oyuncu TOKEN'dan gelir; gövdedeki bir
 *     `playerId` YOK SAYILIR.
 *  4. **HER RET NEDENİ AYRI VE DOĞRU KODLA DÖNER:** 400 doğrulama, 403
 *     başkasının atı, 404 bilinmeyen yarış, 409 (zaten katıldı / dolu /
 *     başladı / yetersiz bakiye / sakat at). Hepsinde **HİÇBİR SATIR
 *     YAZILMAZ ve PARA HAREKET ETMEZ** — "hata döndü ama para gitti" en
 *     sinsi hata sınıfıdır.
 *  5. **EŞZAMANLI İSTEKLER ÇİFT KAYIT ÜRETMEZ.** Aynı oyuncunun aynı
 *     yarışa N eşzamanlı isteği sonucunda TAM OLARAK 1 giriş ve 1 düşüm
 *     olur (brief §2 — ücret KİŞİ BAŞINA). Kuralın asıl garantisi
 *     migration 0037'deki kısmi tekil indekstir; ön kontrol tek başına
 *     TOCTOU'ya açıktır.
 *  6. **MİGRASYON BOTLARI BOZMADI.** `horse_id`/`bot_label` XOR kısıtı ve
 *     kısmi indeks, `player_id`/`status` NULL olan bot satırlarını hâlâ
 *     kabul eder — pratik yarışın veri yolu bu dilimde kırılmamalıdır.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Yarışa katılma (e2e) — POST /races/:id/join', () => {
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

  /**
   * `POST /races` ile bir yarış açar. Varsayılanlar brief §2/§6'nın
   * "ücretli, 12 at, 8 oyuncu" senaryosudur; testler yalnızca
   * ilgilendikleri alanı bozar.
   */
  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<{ raceId: string; entryFee: number }> {
    const entryFee = (override.entryFee as number | undefined) ?? 50;
    const body = {
      name: 'Katılım Kupası',
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
    return { raceId: response.body.data.id as string, entryFee };
  }

  /**
   * Katılım isteği — `key` verilmezse YENİ bir anahtar üretilir.
   *
   * `expectedStatus` verilir ve `.expect(...)` ile dayatılır: beklenmeyen bir
   * durum kodu testin İLGİLİ satırında patlar, "sonra fark ederim" olmaz.
   * Eşzamanlılık testi bu yardımcıyı KULLANAMAZ (orada hangi isteğin
   * kazanacağı önceden bilinmez) — bkz. `rawJoin`.
   */
  async function join(
    player: RegisteredTestPlayer,
    raceId: string,
    body: Record<string, unknown>,
    expectedStatus: number,
    key: string | null = randomUUID(),
  ) {
    return rawJoin(player, raceId, body, key).expect(expectedStatus);
  }

  /**
   * Durum kodu DAYATMAYAN katılım isteği — eşzamanlılık testi için.
   *
   * `key` `null` ise başlık HİÇ EKLENMEZ. `set('Idempotency-Key', null)`
   * yazmak `String(null)` = `"null"` gönderirdi; interceptor başlığı DOLU
   * görür, 400 yerine 200 döner ve "anahtarsız istek reddedilir" testi
   * sessizce yalancı olurdu (yaşandı, 27.09.2026).
   */
  function rawJoin(
    player: RegisteredTestPlayer,
    raceId: string,
    body: Record<string, unknown>,
    key: string | null,
  ) {
    const call = request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader);
    if (key !== null) {
      call.set('Idempotency-Key', key);
    }
    return call.send(body);
  }

  /** Oyuncunun bu yarıştaki giriş satırları — "kaç kez katıldı" ölçüsü. */
  async function entriesOf(raceId: string, playerId: string): Promise<Array<{ status: string | null; gate_position: number | null }>> {
    const result = await pool.query<{ status: string | null; gate_position: number | null }>(
      'SELECT status, gate_position FROM race_entries WHERE race_id = $1 AND player_id = $2',
      [raceId, playerId],
    );
    return result.rows;
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0].money);
  }

  async function ledgerOf(raceId: string, playerId: string) {
    const result = await pool.query<{
      type: string;
      amount: string;
      currency: string;
      reference_type: string;
      balance_before: string;
      balance_after: string;
      idempotency_key: string | null;
    }>(
      `SELECT type, amount, currency, reference_type, balance_before, balance_after, idempotency_key
       FROM economy_transactions
       WHERE reference_id = $1 AND player_id = $2`,
      [raceId, playerId],
    );
    return result.rows;
  }

  async function prizePoolOf(raceId: string): Promise<number> {
    const result = await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId]);
    return Number(result.rows[0].prize_pool);
  }

  describe('mutlu yol — ücretli yarış', () => {
    it('200 döner, giriş satırı YAZILIR ve lobi görünümü güncellenir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Katılım Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Katılan Oyuncu');
      const { raceId } = await createRace(creator);

      const response = await join(joiner, raceId, { horseId: joiner.horseId }, 200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.joinedPlayers).toBe(1);
      expect(response.body.data.prizePool).toBe(50);

      const entries = await entriesOf(raceId, joiner.playerId);
      expect(entries.length).toBe(1);
      expect(entries[0].status).toBe('waiting');
      expect(entries[0].gate_position).toBe(1);
    });

    it('ücret BAKİYEDEN düşülür ve `prize_pool` AYNI miktarda büyür', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Havuz Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Havuza Giren');
      const { raceId, entryFee } = await createRace(creator, { entryFee: 250 });

      await join(joiner, raceId, { horseId: joiner.horseId }, 200);

      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY - entryFee);
      expect(await prizePoolOf(raceId)).toBe(entryFee);
      // Yarışı AÇAN kişinin parasına dokunulmaz — ücret yalnızca katılandan alınır.
      expect(await moneyOf(creator.playerId)).toBe(STARTING_MONEY);
    });

    it('`economy_transactions`\'a `lobby_race_entry_fee` satırı yazılır (CLAUDE.md kural 7)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Defter Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Deftere Giren');
      const { raceId, entryFee } = await createRace(creator, { entryFee: 100 });
      const key = randomUUID();

      await join(joiner, raceId, { horseId: joiner.horseId }, 200, key);

      const ledger = await ledgerOf(raceId, joiner.playerId);
      expect(ledger.length).toBe(1);
      expect(ledger[0].type).toBe('lobby_race_entry_fee');
      expect(Number(ledger[0].amount)).toBe(-entryFee);
      expect(ledger[0].currency).toBe('money');
      expect(ledger[0].reference_type).toBe('race');
      // Defter satırı bakiyenin GERÇEKTEN tuttuğunu kanıtlar: fark tam
      // olarak giriş ücretidir (DB'nin `balance_after = balance_before +
      // amount` CHECK'i bunu zaten zorlar, burada AYRICA okunur).
      expect(Number(ledger[0].balance_before) - Number(ledger[0].balance_after)).toBe(entryFee);
      expect(Number(ledger[0].balance_after)).toBe(STARTING_MONEY - entryFee);
      // Denetim izi: düşümün hangi isteğe ait olduğu kalıcı olarak bilinir.
      expect(ledger[0].idempotency_key).toBe(key);
    });

    it('İKİ oyuncu katılınca havuz İKİ katına çıkar ve kulvarlar çakışmaz', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'İki Kişilik Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Birinci Katılan');
      const second = await registerTestPlayerWithStarterHorse(app, 'İkinci Katılan');
      const { raceId } = await createRace(creator);

      await join(first, raceId, { horseId: first.horseId }, 200);
      await join(second, raceId, { horseId: second.horseId }, 200);

      expect(await prizePoolOf(raceId)).toBe(100);
      const gates = await pool.query<{ gate_position: number }>(
        'SELECT gate_position FROM race_entries WHERE race_id = $1 ORDER BY gate_position',
        [raceId],
      );
      expect(gates.rows.map((row) => row.gate_position)).toEqual([1, 2]);
    });

    it('ücretsiz yarışta PARA HAREKET ETMEZ ve defter satırı yazılmaz', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bedava Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Bedava Giren');
      const { raceId } = await createRace(creator, { entryFee: 0 });

      await join(joiner, raceId, { horseId: joiner.horseId }, 200);

      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
      expect(await prizePoolOf(raceId)).toBe(0);
      // `economy_transactions.amount <> 0` CHECK'i sıfır tutarlı bir satırı
      // zaten reddederdi — bu yüzden ücretsiz yarışta HİÇ yazılmaz.
      expect((await ledgerOf(raceId, joiner.playerId)).length).toBe(0);
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(1);
    });

    it('taktik/risk verilmezse varsayılanlar yazılır, verilirse AYNEN yazılır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Taktik Kuran');
      const plain = await registerTestPlayerWithStarterHorse(app, 'Taktiksiz');
      const explicit = await registerTestPlayerWithStarterHorse(app, 'Taktikli');
      const { raceId } = await createRace(creator);

      await join(plain, raceId, { horseId: plain.horseId }, 200);
      await join(explicit, raceId, { horseId: explicit.horseId, tacticalStyle: 'front_runner', riskLevel: 'high' }, 200);

      const rows = await pool.query<{ tactical_style: string; risk_level: string }>(
        'SELECT tactical_style, risk_level FROM race_entries WHERE race_id = $1 AND player_id = $2',
        [raceId, plain.playerId],
      );
      expect(rows.rows[0]).toEqual({ tactical_style: 'mid_pack', risk_level: 'normal' });

      const explicitRow = await pool.query<{ tactical_style: string; risk_level: string }>(
        'SELECT tactical_style, risk_level FROM race_entries WHERE race_id = $1 AND player_id = $2',
        [raceId, explicit.playerId],
      );
      expect(explicitRow.rows[0]).toEqual({ tactical_style: 'front_runner', risk_level: 'high' });
    });
  });

  describe('Idempotency-Key (brief §54)', () => {
    it('AYNI anahtarla ikinci istek PARA HAREKET ETTİRMEZ, ikinci satır yazmaz', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tekrar Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Tekrar Giren');
      const { raceId } = await createRace(creator, { entryFee: 250 });
      const key = randomUUID();

      await join(joiner, raceId, { horseId: joiner.horseId }, 200, key);
      const replay = await join(joiner, raceId, { horseId: joiner.horseId }, 200, key);

      // İstemci zaman aşımından sonra tekrar denediğinde aynı yanıtı görür…
      expect(replay.body.data.joinedPlayers).toBe(1);
      // …ama ÜCRET İKİNCİ KEZ ALINMAZ.
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY - 250);
      expect(await prizePoolOf(raceId)).toBe(250);
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(1);
      expect((await ledgerOf(raceId, joiner.playerId)).length).toBe(1);
    });

    it('Idempotency-Key YOKSA 400 döner ve HİÇBİR ŞEY yazılmaz', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Anahtarsız Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Anahtarsız Giren');
      const { raceId } = await createRace(creator);

      const response = await join(joiner, raceId, { horseId: joiner.horseId }, 400, null);

      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(0);
    });
  });

  describe('SUNUCU OTORİTESİ', () => {
    it('gövdedeki `playerId` YOK SAYILIR; giriş TOKEN\'daki oyuncuya yazılır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sahte Kuran');
      const caller = await registerTestPlayerWithStarterHorse(app, 'Gerçek Katılan');
      const victim = await registerTestPlayerWithStarterHorse(app, 'Kandırılmak İstenen');
      const { raceId } = await createRace(creator);

      await join(caller, raceId, { horseId: caller.horseId, playerId: victim.playerId }, 200);

      const rows = await pool.query<{ player_id: string }>(
        'SELECT player_id FROM race_entries WHERE race_id = $1',
        [raceId],
      );
      expect(rows.rows.map((row) => row.player_id)).toEqual([caller.playerId]);
      // Kurbanın parasına DOKUNULMAZ.
      expect(await moneyOf(victim.playerId)).toBe(STARTING_MONEY);
      expect(await moneyOf(caller.playerId)).toBe(STARTING_MONEY - 50);
    });
  });

  describe('girdi doğrulama — 400 INVALID_RACE_JOIN_INPUT ve hiçbir satır yazılmaz', () => {
    const invalidBodies: Array<[string, Record<string, unknown>]> = [
      ['at kimliği yok', {}],
      ['at kimliği UUID değil', { horseId: 'at-1' }],
      ['at kimliği sayı', { horseId: 42 }],
      ['at kimliği dizi', { horseId: ['a'] }],
      ['bilinmeyen taktik', { tacticalStyle: 'sprint' }],
      ['bilinmeyen risk', { riskLevel: 'extreme' }],
    ];

    it.each(invalidBodies)('%s → 400 ve 0 satır', async (_label, body) => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Geçersiz Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Geçersiz Katılan');
      const { raceId } = await createRace(creator);

      const response = await join(joiner, raceId, body, 400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_RACE_JOIN_INPUT');
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(0);
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
    });

    it('birden fazla hatalı alan TEK yanıtta birlikte bildirilir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Çok Hatalı Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Çok Hatalı Katılan');
      const { raceId } = await createRace(creator);

      const response = await join(joiner, raceId, { horseId: 'at-1', tacticalStyle: 'sprint', riskLevel: 'extreme' }, 400);

      const message = response.body.error.message as string;
      expect(message).toContain('At kimliği');
      expect(message).toContain('Taktik');
      expect(message).toContain('Risk');
    });
  });

  describe('yetki ve bulunamama', () => {
    it('BAŞKASININ atıyla katılmak 403 döner ve para hareket etmez', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Yabancı Kuran');
      const owner = await registerTestPlayerWithStarterHorse(app, 'At Sahibi');
      const attacker = await registerTestPlayerWithStarterHorse(app, 'At Hırsızı');
      const { raceId } = await createRace(creator);

      const response = await join(attacker, raceId, { horseId: owner.horseId }, 403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(await moneyOf(attacker.playerId)).toBe(STARTING_MONEY);
      expect((await entriesOf(raceId, attacker.playerId)).length).toBe(0);
    });

    it('bilinmeyen yarış kimliği 404 döner', async () => {
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Hayalet Katılan');

      const response = await join(joiner, randomUUID(), { horseId: joiner.horseId }, 404);

      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
    });

    it('UUID olmayan yarış kimliği 400 döner (500 DEĞİL)', async () => {
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Bozuk Yol Katılan');

      // `ParseUUIDPipe` — `22P02` ile 500 dönmesini engeller.
      await join(joiner, 'yaris-1', { horseId: joiner.horseId }, 400);
    });
  });

  describe('durum redleri — 409', () => {
    it('AYNI oyuncu aynı yarışa iki kez katılamaz (farklı anahtarla)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tek Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Çift Katılan');
      const { raceId } = await createRace(creator);

      await join(joiner, raceId, { horseId: joiner.horseId }, 200);
      const second = await join(joiner, raceId, { horseId: joiner.horseId }, 409);

      expect(second.body.error.code).toBe('ALREADY_JOINED_RACE');
      // ASIL İDDİA: ikinci istek PARA HAREKET ETTİRMEDİ.
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY - 50);
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(1);
      expect((await ledgerOf(raceId, joiner.playerId)).length).toBe(1);
    });

    it('başlangıç zamanı GEÇMİŞSE 409 RACE_NOT_JOINABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Geç Kalan');
      const { raceId } = await createRace(creator);

      // Zamanı geriye almak, 60 saniyelik asgari gecikmeyi beklemekten
      // hem hızlı hem de SINIRI test etmeye izin verir.
      await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

      const response = await join(joiner, raceId, { horseId: joiner.horseId }, 409);

      expect(response.body.error.code).toBe('RACE_NOT_JOINABLE');
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
    });

    it('`scheduled` DIŞINDAKİ durumda 409 RACE_NOT_JOINABLE', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Koşan Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Koşana Yetişen');
      const { raceId } = await createRace(creator);

      // `races_status_check` (migration 0006) yalnızca
      // ('scheduled','in_progress','finished','cancelled') kabul eder.
      await pool.query("UPDATE races SET status = 'in_progress' WHERE id = $1", [raceId]);

      const response = await join(joiner, raceId, { horseId: joiner.horseId }, 409);

      expect(response.body.error.code).toBe('RACE_NOT_JOINABLE');
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(0);
    });

    it('oyuncu kontenjanı dolduğunda 409 RACE_FULL', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Dolu Kuran');
      // `maxPlayers` alt sınırı `minPlayers` = 8'dir (`race-lobby.config.json`).
      const { raceId } = await createRace(creator, { fieldSize: 8, maxPlayers: 8 });

      for (let i = 0; i < 8; i += 1) {
        const joiner = await registerTestPlayerWithStarterHorse(app, `Dolduran ${i}`);
        await join(joiner, raceId, { horseId: joiner.horseId }, 200);
      }
      expect(await prizePoolOf(raceId)).toBe(8 * 50);

      const latecomer = await registerTestPlayerWithStarterHorse(app, 'Geç Kalan Dokuzuncu');
      const response = await join(latecomer, raceId, { horseId: latecomer.horseId }, 409);

      expect(response.body.error.code).toBe('RACE_FULL');
      expect(await moneyOf(latecomer.playerId)).toBe(STARTING_MONEY);
    });

    it('bakiye YETERSİZSE 409 INSUFFICIENT_FUNDS ve hiçbir satır yazılmaz', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Pahalı Kuran');
      const poor = await registerTestPlayerWithStarterHorse(app, 'Fakir Katılan');
      const { raceId } = await createRace(creator, { entryFee: 1_000 });

      await pool.query('UPDATE players SET money = 10 WHERE id = $1', [poor.playerId]);

      const response = await join(poor, raceId, { horseId: poor.horseId }, 409);

      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
      // Para KISMEN düşülmüş olamaz: transaction'ın tamamı geri alınır.
      expect(await moneyOf(poor.playerId)).toBe(10);
      expect((await entriesOf(raceId, poor.playerId)).length).toBe(0);
      expect(await prizePoolOf(raceId)).toBe(0);
    });

    it('SAKAT at 409 HORSE_INJURED döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sakat Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Sakat At Sahibi');
      const { raceId } = await createRace(creator);

      // `horses.status` METİNDİR — boolean bir `injured` sütunu YOKTUR.
      await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [joiner.horseId]);

      const response = await join(joiner, raceId, { horseId: joiner.horseId }, 409);

      expect(response.body.error.code).toBe('HORSE_INJURED');
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY);
    });
  });

  describe('eşzamanlılık — çift kayıt ve çift tahsilat YOK', () => {
    it('aynı oyuncunun N eşzamanlı isteğinden YALNIZCA BİRİ giriş üretir', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Yarış Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Yarışan Katılan');
      const { raceId } = await createRace(creator, { entryFee: 500 });

      // FARKLI anahtarlar: interceptor devreye girmesin, gerçek yarış
      // veritabanı seviyesinde çözülsün. Kuralın asıl garantisi kısmi
      // tekil indekstir (`race_entries_race_player_uq`).
      const keys = Array.from({ length: 5 }, () => randomUUID());
      const statuses = await sendConcurrentRequestsBatched(5, 5, (index) =>
        rawJoin(joiner, raceId, { horseId: joiner.horseId }, keys[index]).then((response) => response.status),
      );

      // Kazanan ÖNCEDEN bilinemez — bu yüzden yalnızca "tam olarak bir
      // başarı" iddia edilir; kaybedenlerin hepsi 409'dur.
      expect(statuses.filter((status) => status === 200).length).toBe(1);
      expect(statuses.filter((status) => status === 409).length).toBe(4);

      // PARA: tam olarak BİR kez, tam olarak 500.
      expect(await moneyOf(joiner.playerId)).toBe(STARTING_MONEY - 500);
      expect(await prizePoolOf(raceId)).toBe(500);
      expect((await entriesOf(raceId, joiner.playerId)).length).toBe(1);
      expect((await ledgerOf(raceId, joiner.playerId)).length).toBe(1);
    });
  });

  describe('migrasyon 0037 — bot satırları BOZULMADI', () => {
    it('`player_id`/`status` NULL olan bot satırı hâlâ yazılabilir', async () => {
      // `player_id IS NOT NULL` filtresi (kısmi indeks) ve XOR CHECK'i
      // yalnızca GERÇEK oyuncu satırlarını kapsamalıdır. Bu test
      // kapsamadığını kanıtlar — kapsasaydı pratik yarışın bot rakipleri
      // (AUDIT_REPORT.md R2) bir anda yazılamaz hâle gelirdi.
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bot Kuran');
      const { raceId } = await createRace(creator);

      await pool.query(
        `INSERT INTO race_entries (id, race_id, horse_id, bot_label, jockey_id, gate_position, tactical_style, risk_level, status)
         VALUES ($1, $2, NULL, 'bot-1', NULL, 5, 'mid_pack', 'normal', NULL)`,
        [randomUUID(), raceId],
      );

      const rows = await pool.query<{ player_id: string | null; status: string | null }>(
        "SELECT player_id, status FROM race_entries WHERE race_id = $1 AND bot_label = 'bot-1'",
        [raceId],
      );
      expect(rows.rows[0]).toEqual({ player_id: null, status: null });

      // Ve bot, OYUNCU KONTENJANINI DOLDURMAZ (brief §6: at sayısı ≠
      // oyuncu sayısı) — katılım yolunun sayımı `player_id IS NOT NULL`
      // filtresiyle yapılır, yani bot satırı 8 kişilik kontenjandan
      // yer HARCAMAZ.
      const count = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM race_entries WHERE race_id = $1 AND player_id IS NOT NULL',
        [raceId],
      );
      expect(Number(count.rows[0].count)).toBe(0);
    });
  });
});
