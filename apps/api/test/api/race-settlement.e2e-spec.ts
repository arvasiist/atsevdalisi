import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  computePrizePayouts,
  computePrizePayoutTotal,
  resolvePrizeDistribution,
} from '../../src/domain/race/prize-distribution';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * ÖDÜL DAĞITIMI — `POST /races/:id/settle` (§42 PHASE 13.14).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEY, PARANIN GERİ DÖNDÜĞÜDÜR.** Bu dilimden
 * önce ücretli lobi yarışı HİÇ KOŞMUYORDU: oyuncu giriş ücretini ödüyor,
 * para `races.prize_pool`'a giriyor ve orada kalıyordu (PROJE_DURUMU.md
 * §13.13.2). Aşağıdaki birinci blok ölçülebilir bir iddia kurar:
 * **kesinleşmeden önceki TOPLAM oyuncu parası + dağıtılan ödül = kesinleşmeden
 * sonraki TOPLAM oyuncu parası.** Yani hiçbir Çip yoktan var olmaz.
 *
 * **İKİNCİ İDDİA: ÇİFT ÖDEME YOK.** Settlement ucu `Idempotency-Key`
 * KULLANMAZ — tekrar koruması `scheduled → finished` durum geçişinin
 * kendisidir. Bu yüzden ikinci çağrının testi "ikinci satır yok" demekle
 * kalmaz, `RACE_NOT_SETTLEABLE` kodunu da doğrular: istemciye "sessizce
 * başarılı" değil, anlamlı bir 409 dönmelidir.
 *
 * **ÜÇÜNCÜ İDDİA: UÇ BİR "CRANK"TİR.** Yarışı KOŞTURAN kişi katılımcı
 * olmak zorunda değildir (bu projede zamanlanmış görev altyapısı yok —
 * bkz. `SettleRaceUseCase` doc yorumu). Test bunu kasıtlı olarak
 * ÜÇÜNCÜ bir oyuncuyla kurar; katılımcılardan biriyle kurulsaydı bu
 * özellik sessizce kaybolabilirdi.
 *
 * ## Neden İKİ ayrı mutlu-yol testi (botsuz ve botlu)
 *
 * Ödül dağıtımı **sıraya** bağlıdır, sıra ise simülasyonun sonucudur. Testte
 * "birinci gerçek oyuncudur" gibi bir varsayım kurmak YALANCI bir test
 * olurdu — 12 atlık bir sahada ilk beşe hiç gerçek oyuncu girmeyebilir.
 * Bu yüzden para iddiaları sabit bir varsayım yerine **sıraya göre** kurulur:
 * her gerçek katılımcının ödülü `payouts[finishPosition - 1]` OLMALIDIR.
 *
 * Bunun yetmediği tek yer "havuzun tamamı gerçekten dağıtıldı mı"
 * sorusudur: botlar da sıra kapabildiğinden, toplam dağıtılan tutar
 * payların toplamından KÜÇÜK olabilir. Bu yüzden **botsuz** bir sahada
 * (`fieldSize = maxPlayers = 8`, 8 gerçek oyuncu) tam dağıtım TAM EŞİTLİKLE
 * ölçülür; botlu saha ise ayrı bir testte yalnızca "botlar ödül ALMAZ ve
 * oyuncuya bağlı DEĞİLDİR" iddiasını taşır.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Ödül dağıtımı (e2e) — POST /races/:id/settle', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  /**
   * `prizeDistributionId: 'top5'` payları — tutarlar config'ten TÜRETİLİR,
   * elle yazılmaz. Sabit bir sayı yazmak, config değiştiğinde testin
   * sessizce yalan söylemesine yol açardı.
   *
   * ⚠️ `const` OLARAK MODÜL GÖVDESİNDE HESAPLANAMAZ: `describe` geri çağrısı
   * `beforeAll`'dan ÖNCE, dosya toplanırken koşar ve o anda `config` henüz
   * `undefined`'dır (`TypeError: Cannot read properties of undefined
   * (reading 'economy')` — yaşandı, 28.09.2026). Bu yüzden `let` + atama
   * `beforeAll` içinde.
   */
  let SHARES: readonly number[] = [];

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
    SHARES = resolvePrizeDistribution(config.economy, config.raceLobby.prizeDistributionId)?.shares ?? [];
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  /** `config/economy.config.json` → `newPlayerStartingBalance.money`. */
  const STARTING_MONEY = 5_000;
  /** `config/race-lobby.config.json` → `paidEntryFeeOptions` içinden seçilir. */
  const ENTRY_FEE = 100;

  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const body = {
      name: 'Kesinleşme Kupası',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: ENTRY_FEE,
      raceType: 'paid',
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

  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /**
   * Yarışı KOŞULABİLİR hâle getirir: başlangıç anını geçmişe çeker.
   *
   * **NEDEN GEREKLİ:** `config/race-lobby.config.json` →
   * `startDelaySeconds.min = 60`'tır, yani `POST /races` ile açılan bir
   * yarış HER ZAMAN en az 60 saniye ileridedir. Bu sınır bilinçli bir ürün
   * kuralıdır (oyuncuya katılmak için zaman tanır) ve testin onu bekleyerek
   * aşması, paketin her koşusuna bir dakika eklerdi. Bunun yerine yalnızca
   * BU testin kurduğu satırın `start_time`'ı geriye alınır — kural test
   * EDİLMEZ, testin ÖN KOŞULU kurulur. Kuralın kendisi `lobby.spec.ts`'te
   * saf fonksiyon olarak zaten sınanır.
   */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  function rawSettle(player: RegisteredTestPlayer, raceId: string) {
    return request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', player.authHeader);
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0]?.money ?? '0');
  }

  async function totalMoneyOf(players: RegisteredTestPlayer[]): Promise<number> {
    let total = 0;
    for (const player of players) {
      total += await moneyOf(player.playerId);
    }
    return total;
  }

  async function prizePoolOf(raceId: string): Promise<number> {
    const result = await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId]);
    return Number(result.rows[0]?.prize_pool ?? '0');
  }

  async function raceStatusOf(raceId: string): Promise<{ status: string; simulation_seed: string | null }> {
    const result = await pool.query<{ status: string; simulation_seed: string | null }>(
      'SELECT status, simulation_seed FROM races WHERE id = $1',
      [raceId],
    );
    return result.rows[0] as { status: string; simulation_seed: string | null };
  }

  async function prizeRowsOf(playerId: string, raceId: string): Promise<Array<{ amount: string }>> {
    const result = await pool.query<{ amount: string }>(
      `SELECT amount
       FROM economy_transactions
       WHERE player_id = $1 AND type = 'lobby_race_prize' AND reference_id = $2
       ORDER BY created_at`,
      [playerId, raceId],
    );
    return result.rows;
  }

  async function listNotifications(player: RegisteredTestPlayer): Promise<Record<string, unknown>[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/notifications`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data.notifications as Record<string, unknown>[];
  }

  function ofType(notifications: Record<string, unknown>[], type: string): Record<string, unknown>[] {
    return notifications.filter((notification) => notification.type === type);
  }

  interface SettlementPlace {
    finishPosition: number;
    horseId: string;
    playerId: string | null;
    displayName: string | null;
    isBot: boolean;
    prizeAmount: number;
  }

  interface SettleResponseBody {
    success: boolean;
    data: {
      raceId: string;
      status: string;
      prizePool: number;
      settledAt: string;
      places: SettlementPlace[];
    };
  }

  /** Sıraya göre BEKLENEN ödül — tanım gereği `payouts[sıra - 1]`, sıra ödül bandının dışındaysa 0. */
  function expectedPrizeFor(place: SettlementPlace, pool: number): number {
    return computePrizePayouts(pool, SHARES)[place.finishPosition - 1] ?? 0;
  }

  describe('mutlu yol — para gerçekten dağıtılır', () => {
    it('BOTSUZ sahada havuzun TAMAMI (eksi rake) gerçek oyunculara ödenir ve hiçbir Çip kaybolmaz', async () => {
      // `fieldSize = maxPlayers = 8` → bot dolgusu YOK (`aiFillEnabled` devreye
      // girmez), yani ilk beşin TAMAMI gerçek oyuncudur ve toplam ödeme
      // payların toplamına TAM EŞİT olmalıdır. Bu, testi sıradan bağımsız
      // olarak KESİN kılar.
      const creator = await registerTestPlayerWithStarterHorse(app, 'Kupayı Kuran');
      const players: RegisteredTestPlayer[] = [creator];
      for (let index = 1; index <= 7; index += 1) {
        players.push(await registerTestPlayerWithStarterHorse(app, `Kupa Koşucusu ${index}`));
      }

      const raceId = await createRace(creator);
      for (const player of players) {
        await join(player, raceId);
      }

      // ÖN KOŞUL: sekiz ücret GERÇEKTEN havuza girmiş olmalı, yoksa
      // aşağıdaki denklem boş bir kümeyi doğrular.
      // ⚠️ ADI `prizePool`TUR, `pool` DEĞİL: bu dosyada `pool` üst kapsamda
      // PG bağlantı havuzudur ve içeride `const pool = <sayı>` yazmak onu
      // GÖLGELER — sonraki `pool.query` çağrıları "pool2.query is not a
      // function" ile patlar (yaşandı, 28.09.2026).
      const prizePool = ENTRY_FEE * players.length;
      expect(await prizePoolOf(raceId)).toBe(prizePool);
      const totalBefore = await totalMoneyOf(players);
      expect(totalBefore).toBe(STARTING_MONEY * players.length - prizePool);

      await makeRaceStarted(raceId);

      // ÇAĞIRAN KATILIMCI DEĞİL — crank deseninin kanıtı.
      const crank = await registerTestPlayerWithStarterHorse(app, 'Krank');
      const body = (await rawSettle(crank, raceId).expect(200)).body as SettleResponseBody;

      expect(body.success).toBe(true);
      expect(body.data.raceId).toBe(raceId);
      expect(body.data.status).toBe('finished');
      expect(body.data.prizePool).toBe(prizePool);

      // Bot dolgusu YOK: saha tam olarak kayıtlı oyunculardan oluşur.
      expect(body.data.places).toHaveLength(players.length);
      expect(body.data.places.filter((place) => place.isBot)).toHaveLength(0);

      // HER sıra config'teki payın AYNISI — sıra simülasyonun sonucudur,
      // ama ödül TUTARI ona bağlı olarak TAM olarak hesaplanabilir.
      for (const place of body.data.places) {
        expect(place.prizeAmount).toBe(expectedPrizeFor(place, prizePool));
      }

      // HAVUZUN TAMAMI (eksi `raceRake`) ödendi: `top5` paylarının toplamı
      // `1 - raceRake` olduğundan bu eşitlik yapısaldır ve "yarış para
      // basamaz" ilkesinin (E7) doğrudan ölçümüdür.
      const paidTotal = body.data.places.reduce((sum, place) => sum + place.prizeAmount, 0);
      expect(paidTotal).toBe(computePrizePayoutTotal(prizePool, SHARES));
      expect(prizePool - paidTotal).toBe(Math.round(prizePool * config.economy.raceRake));

      // PARA KORUNUR: oyuncuların toplamı, havuzdan çıkan ödül kadar artar.
      expect(await totalMoneyOf(players)).toBe(totalBefore + paidTotal);
    });

    it('her ÖDEME defterde bir `lobby_race_prize` satırı bırakır — ödenmeyen sırada satır YOKTUR', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Defter Kuran');
      const players: RegisteredTestPlayer[] = [creator];
      for (let index = 1; index <= 7; index += 1) {
        players.push(await registerTestPlayerWithStarterHorse(app, `Defter Koşucusu ${index}`));
      }
      const raceId = await createRace(creator);
      for (const player of players) {
        await join(player, raceId);
      }
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Defter Krank');
      const body = (await rawSettle(crank, raceId).expect(200)).body as SettleResponseBody;
      const prizePool = ENTRY_FEE * players.length;

      const placeByPlayerId = new Map(
        body.data.places
          .filter((place) => place.playerId !== null)
          .map((place) => [place.playerId as string, place]),
      );

      for (const player of players) {
        const place = placeByPlayerId.get(player.playerId);
        expect(place).toBeDefined();

        // Defter satırı, YANITTaki tutarla BİREBİR olmalı — ikisi
        // ayrışırsa oyuncuya "şu kadar kazandın" deyip başka bir tutar
        // yazmak mümkün olurdu (bu testin asıl yakaladığı hata budur).
        const rows = await prizeRowsOf(player.playerId, raceId);
        const prize = place?.prizeAmount ?? 0;
        if (prize > 0) {
          expect(rows).toHaveLength(1);
          expect(Number(rows[0]?.amount)).toBe(prize);
        } else {
          expect(rows).toHaveLength(0);
        }
      }

      // Toplam defter satırı = ödül alan sıra sayısı (`top5` → en çok 5).
      const ledgerTotal = await pool.query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM economy_transactions WHERE type = 'lobby_race_prize' AND reference_id = $1`,
        [raceId],
      );
      const expectedRowCount = computePrizePayouts(prizePool, SHARES).filter((amount) => amount > 0).length;
      expect(Number(ledgerTotal.rows[0]?.c)).toBe(expectedRowCount);
    });

    it('HER gerçek katılımcıya `race_finished`, YALNIZCA ödül alana `prize_won` düşer', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bildirim Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Bildirim Birinci');
      const second = await registerTestPlayerWithStarterHorse(app, 'Bildirim İkinci');
      const raceId = await createRace(creator, { fieldSize: 12 });
      await join(first, raceId);
      await join(second, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Bildirim Krank');
      const body = (await rawSettle(crank, raceId).expect(200)).body as SettleResponseBody;

      const placeOf = (player: RegisteredTestPlayer) =>
        body.data.places.find((place) => place.playerId === player.playerId);

      for (const player of [first, second]) {
        const finished = ofType(await listNotifications(player), 'race_finished');
        expect(finished).toHaveLength(1);
        expect(finished[0]?.payload).toEqual({
          raceId,
          raceName: 'Kesinleşme Kupası',
          finishPosition: placeOf(player)?.finishPosition,
        });
      }

      // `prize_won` YALNIZCA gerçekten ödeme yapılanlara gider. Sabit bir
      // sayı İDDİA EDİLMEZ (12 atlık sahada iki oyuncudan biri ilk beş
      // dışında kalabilir): iddia, "ödülü olan `prize_won` ALIR, ödülü
      // olmayan ALMAZ" üzerinden kurulur.
      for (const player of [first, second]) {
        const won = ofType(await listNotifications(player), 'prize_won');
        const prize = placeOf(player)?.prizeAmount ?? 0;
        if (prize > 0) {
          expect(won).toHaveLength(1);
          expect(won[0]?.payload).toEqual({ raceId, raceName: 'Kesinleşme Kupası', amount: prize });
        } else {
          expect(won).toHaveLength(0);
        }
      }

      // KOŞMAYAN üçüncü oyuncu (crank) HİÇBİR bildirim almaz — yarışı
      // koşturmak, koşturana bir "sonuç" yazmaz.
      expect(ofType(await listNotifications(crank), 'race_finished')).toHaveLength(0);
      expect(ofType(await listNotifications(crank), 'prize_won')).toHaveLength(0);
    });

    it('BOTLU sahada kadro `fieldSize`a tamamlanır; botlar ödül ALMAZ ve bir oyuncuya BAĞLI DEĞİLDİR', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Botlu Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Botlu Birinci');
      const second = await registerTestPlayerWithStarterHorse(app, 'Botlu İkinci');
      const raceId = await createRace(creator, { fieldSize: 12, maxPlayers: 8 });
      await join(first, raceId);
      await join(second, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Botlu Krank');
      const body = (await rawSettle(crank, raceId).expect(200)).body as SettleResponseBody;
      const prizePool = ENTRY_FEE * 2;

      expect(body.data.places).toHaveLength(12);
      const bots = body.data.places.filter((place) => place.isBot);
      expect(bots).toHaveLength(10);
      for (const bot of bots) {
        expect(bot.playerId).toBeNull();
        expect(bot.displayName).toBeNull();
        // Bot kazansa bile o pay SAHİPSİZDİR: ödeme yalnızca `playerId`'si
        // olan satırlara yapılır (`settleLobbyRace`).
        expect(bot.prizeAmount).toBe(0);
      }

      // Botlar VERİTABANINDA gerçek satırlardır (`race_entries_horse_xor_bot_chk`:
      // `horse_id` ve `bot_label` ya ikisi dolu ya ikisi boş) ve segmentleri
      // yazılmıştır — aksi hâlde `GET /races/:id/timeline` yarışın çoğunu
      // oynatamazdı.
      const botRows = await pool.query<{ c: string }>(
        'SELECT COUNT(*) AS c FROM race_entries WHERE race_id = $1 AND player_id IS NULL AND bot_label IS NOT NULL',
        [raceId],
      );
      expect(Number(botRows.rows[0]?.c)).toBe(10);

      const segmentOwners = await pool.query<{ c: string }>(
        `SELECT COUNT(DISTINCT s.race_entry_id) AS c
         FROM race_entry_segments s
         JOIN race_entries e ON e.id = s.race_entry_id
         WHERE e.race_id = $1`,
        [raceId],
      );
      expect(Number(segmentOwners.rows[0]?.c)).toBe(12);

      // Gerçek oyuncuların ödemesi YİNE sıraya göre config payının AYNISI.
      for (const place of body.data.places.filter((entry) => !entry.isBot)) {
        expect(place.prizeAmount).toBe(expectedPrizeFor(place, prizePool));
      }
    });

    it('gerçek katılım satırları KOŞMUŞ durumdadır ve yarışın seedi açığa çıkar', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Saha Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Saha Birinci');
      const raceId = await createRace(creator);
      await join(first, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Saha Krank');
      await rawSettle(crank, raceId).expect(200);

      // Snapshot katılım anında DEĞİL, koşma anında yazılır
      // (`joinLobbyRace` doc yorumu) — bu yüzden kesinleşmeden sonra DOLU
      // olmalıdır.
      const realRows = await pool.query<{
        horse_snapshot: unknown;
        final_time_ms: number | null;
        finish_position: number | null;
        performance_score: string | null;
      }>(
        `SELECT horse_snapshot, final_time_ms, finish_position, performance_score
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL
         ORDER BY id`,
        [raceId],
      );
      expect(realRows.rows).toHaveLength(1);
      expect(realRows.rows[0]?.horse_snapshot).not.toBeNull();
      expect(realRows.rows[0]?.final_time_ms).not.toBeNull();
      expect(realRows.rows[0]?.finish_position).not.toBeNull();
      expect(realRows.rows[0]?.performance_score).not.toBeNull();

      const race = await raceStatusOf(raceId);
      expect(race.status).toBe('finished');
      expect(race.simulation_seed).not.toBeNull();
    });

    it('kesinleşmiş yarışın tekrar oynatması (timeline) katılımcıya açılır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Replay Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Replay Oyuncusu');
      const raceId = await createRace(creator);
      await join(player, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Replay Krank');
      await rawSettle(crank, raceId).expect(200);

      const timeline = await request(app.getHttpServer())
        .get(`${racesUrl}/${raceId}/timeline`)
        .set('Authorization', player.authHeader)
        .expect(200);

      // "Önce `finished` yazıp sonra hiçbir şey yazmamak" gibi yarım bir
      // işi yakalar: sonuç listesi DOLU olmalıdır (1 gerçek + 7 bot = 8).
      const entrants = timeline.body.data.entrants as unknown[];
      expect(entrants.length).toBe(8);
      expect(timeline.body.data.simulationSeed).not.toBeNull();
    });
  });

  describe('idempotency — çift ödeme YAPISAL olarak imkânsız', () => {
    it('ikinci çağrı 409 RACE_NOT_SETTLEABLE döner ve İKİNCİ ödeme YAPMAZ', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tekrar Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Tekrar Birinci');
      const second = await registerTestPlayerWithStarterHorse(app, 'Tekrar İkinci');
      const raceId = await createRace(creator, { fieldSize: 12 });
      await join(first, raceId);
      await join(second, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Tekrar Krank');
      const firstSettle = (await rawSettle(crank, raceId).expect(200)).body as SettleResponseBody;

      const moneyAfterFirst = (await moneyOf(first.playerId)) + (await moneyOf(second.playerId));

      // **`Idempotency-Key` GÖNDERİLMEZ** — ve gönderilmemesi bilinçlidir:
      // koruyan şey anahtar değil, `scheduled → finished` geçişidir.
      const secondResponse = await rawSettle(crank, raceId).expect(409);
      expect(secondResponse.body.error.code).toBe('RACE_NOT_SETTLEABLE');

      expect((await moneyOf(first.playerId)) + (await moneyOf(second.playerId))).toBe(moneyAfterFirst);

      const ledgerTotal = await pool.query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM economy_transactions WHERE type = 'lobby_race_prize' AND reference_id = $1`,
        [raceId],
      );

      // ⚠️ BEKLENEN SATIR SAYISI `top5` PAY SAYISINDAN TÜRETİLEMEZ. Saha 12
      // kişilik ve yalnızca 2'si gerçek oyuncudur; ilk beş sırayı BOTLAR
      // süpürebilir ve o zaman defter satırı HİÇ olmaz (bot payı yanar —
      // §13.14). Bu yüzden beklenen sayı, kesinleşme YANITINDAKİ "ödemesi
      // olan gerçek sıra" sayısıdır; varsayım değil, gözlem.
      const expectedRowCount = firstSettle.data.places.filter(
        (place) => place.playerId !== null && place.prizeAmount > 0,
      ).length;
      expect(Number(ledgerTotal.rows[0]?.c)).toBe(expectedRowCount);

      // Ve ikinci çağrı bu satırların HİÇBİRİNİ çoğaltmadı.
      const ledgerAfterSecond = await pool.query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM economy_transactions WHERE type = 'lobby_race_prize' AND reference_id = $1`,
        [raceId],
      );
      expect(Number(ledgerAfterSecond.rows[0]?.c)).toBe(expectedRowCount);
    });
  });

  describe('ret nedenleri — 404/409/401', () => {
    it('henüz BAŞLAMAMIŞ yarış 409 RACE_NOT_SETTLEABLE döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Erken Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Erken Katılan');
      const raceId = await createRace(creator);
      await join(player, raceId);

      // `start_time` BİLEREK geçmişe çekilmez — yarış hâlâ gelecektedir.
      const response = await rawSettle(creator, raceId).expect(409);

      expect(response.body.error.code).toBe('RACE_NOT_SETTLEABLE');
      expect(await raceStatusOf(raceId)).toMatchObject({ status: 'scheduled' });
      // Hiçbir para hareket etmemiş olmalı.
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
      expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE);
    });

    it('hiç KATILIMCISI olmayan yarış 409 RACE_NOT_SETTLEABLE döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Boş Kuran');
      const raceId = await createRace(creator);
      await makeRaceStarted(raceId);

      const response = await rawSettle(creator, raceId).expect(409);

      // `NO_PARTICIPANTS`: dağıtılacak havuz (ve kazanan) yoktur. Motoru
      // çalıştırıp botları sıralamak, kimseye yazılmayacak bir
      // `race_finished` üretir ve hiç var olmamış bir yarışı
      // "kesinleşmiş" gösterirdi.
      expect(response.body.error.code).toBe('RACE_NOT_SETTLEABLE');
      expect(await raceStatusOf(raceId)).toMatchObject({ status: 'scheduled' });
    });

    it('bilinmeyen yarış 404 RACE_NOT_FOUND döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Bilinmez Krank');

      const response = await rawSettle(player, randomUUID()).expect(404);

      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('token YOKSA 401 döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Tokensiz Kuran');
      const raceId = await createRace(creator);

      await request(app.getHttpServer()).post(`${racesUrl}/${raceId}/settle`).expect(401);
    });

    it('geçersiz UUID 400 döner (ParseUUIDPipe)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Bozuk Krank');

      await rawSettle(player, 'bu-bir-uuid-degil').expect(400);
    });
  });
});
