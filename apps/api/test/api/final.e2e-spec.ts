import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
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
 * FINAL E2E — TAM OTOMATİK SENARYO (brief §42 "FINAL E2E TEST").
 *
 * **BU DOSYANIN KANITLADIĞI ŞEY TEK BİR UÇTAN UCA AKIŞTIR:** iki gerçek
 * oyuncu kaydolur → ücretli bir lobi yarışı açılır → iki oyuncu katılıp
 * "hazır" olur → yarış kilitlenir ve kesinleşir (ödül dağıtılır) → üçüncü
 * bir oyuncu tribün bileti alır ve iade eder → ikinci bir yarış açılıp
 * İPTAL edilir (tam iade) → yetkisiz erişim kapıları (401/403) doğrulanır.
 * Parçalar ayrı ayrı diğer e2e dosyalarında sınanır; burada amaç bunların
 * TEK bir akış içinde birbirini bozmadığını göstermektir.
 *
 * ## SIRA NEDEN BRIEF'TEKİNDEN FARKLI (C, D'DEN SONRAYA TAŞINDI)
 *
 * Brief tribün biletini kesinleşmeden ÖNCE istiyor; ama `assertRaceWatchable`
 * (`domain/grandstand/ticket.ts`) bir bileti YALNIZCA `finished` bir yarış
 * için satar (`RACE_NOT_FINISHED`). Yani "bilet al" adımı yapısal olarak
 * "kesinleştir" adımından SONRA gelmek zorundadır. Bu bir tercih değil,
 * ürün kuralının kendisidir; sıra buna göre kurulmuştur.
 *
 * ## BU DOSYA NEDEN BİRKAÇ `it` VE ORTAK DURUM KULLANIYOR
 *
 * Bu tek bir AKIŞTIR, birbirinden bağımsız testler değil: `it` blokları
 * TANIM SIRASINA göre koşar ve üst kapsamdaki değişkenleri PAYLAŞIR. Bu
 * bilinçlidir (brief "tek uzun `it` ya da mantıksal sıralı birkaç `it`"
 * der). Bir adım düşerse sonraki adımlar da düşer — akışın kendisi
 * bozulduğu için bu DOĞRU davranıştır.
 *
 * ## SQL YALNIZCA KURULUM İÇİNDİR (iddia değil)
 *
 * Tüm İDDİALAR genel API üzerinden (supertest) kurulur; defter mutabakatı
 * bile `GET /players/:id/wallet` ile yapılır, SQL ile değil. SQL'e yalnızca
 * İKİ kurulum için başvurulur ve ikisinin de genel bir ucu YOKTUR:
 *   1. `makeRaceStarted` — saat ilerletme. `startDelaySeconds.min = 60`
 *      ürün kuralıdır; onu beklemek pakete dakikalar eklerdi. Diğer e2e
 *      dosyaları da aynı yöntemi kullanır (`race-settlement.e2e-spec.ts`).
 *   2. `makeAdmin` — yönetici işareti. Kendini yönetici yapabilen bir uç
 *      nokta bilinçli olarak YOKTUR (`CLAUDE.md` "YÖNETİCİ ATAMANIN
 *      ARAYÜZÜ YOKTUR"); iptal ucu yönetici gerektirir.
 * Ayrıca kilit için `LockRaceUseCase.execute(now)` doğrudan çağrılır —
 * `RaceLockScheduler` `NODE_ENV=test` altında KAPALI olduğundan saat
 * testin elindedir (`race-lifecycle.e2e-spec.ts` ile AYNI desen).
 *
 * ## PARA İDDİALARI SİMÜLASYONDAN BAĞIMSIZ KURULUR
 *
 * Saha iki gerçek oyuncu + botlarla dolar (`fieldSize = maxPlayers = 8` →
 * 6 bot). Bu yüzden "en az bir oyuncu ödül aldı" gibi bir iddia KURULMAZ:
 * ödül sırası simülasyonun sonucudur ve seed her koşuda yenidir. Onun
 * yerine simülasyondan BAĞIMSIZ kimlikler kurulur: `havuz = ödüller + bot
 * artığı + platform payı`, `giriş ücretleri = havuz` ve `defter toplamı =
 * gerçek bakiye değişimi` (bkz. `economy-reconciliation.e2e-spec.ts`).
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('FINAL E2E — tam otomatik senaryo (uçtan uca)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;
  let lockRaceUseCase: LockRaceUseCase;

  /** ⚠️ `beforeAll` ÖNCESİ hesaplanamaz: `config` o anda `undefined`dır. */
  let SHARES: readonly number[] = [];

  /** Akış boyunca paylaşılan oyuncular (`horseId` başlangıç atıdır). */
  type PlayerWithHorse = RegisteredTestPlayer & { horseId: string };
  let playerA: PlayerWithHorse;
  let playerB: PlayerWithHorse;
  let spectator: PlayerWithHorse;
  let crank: PlayerWithHorse;

  /** Birinci (kesinleşen) yarış. */
  let raceId: string;
  let settleBody: SettleResponseBody;
  /** ⚠️ "ÖNCE" bakiyeleri KATILIMDAN ÖNCE okunur (bkz. dosya başı, kural 4). */
  let moneyBeforeA: number;
  let moneyBeforeB: number;
  let moneyAfterA: number;
  let moneyAfterB: number;

  /** Tribün bileti (üçüncü oyuncu). */
  let ticketId: string;

  /** İkinci (iptal edilen) yarış. */
  let raceTwoId: string;
  let moneyBeforeRaceTwo: number;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
    lockRaceUseCase = app.get(LockRaceUseCase);
    SHARES = resolvePrizeDistribution(config.economy, config.raceLobby.prizeDistributionId)?.shares ?? [];
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  /** `config/economy.config.json` → `newPlayerStartingBalance.money`. */
  const STARTING_MONEY = 5_000;
  /** `config/race-lobby.config.json` → `paidEntryFeeOptions` içinden. */
  const ENTRY_FEE = 100;
  /**
   * `config/race-lobby.config.json` → `tribuneFeeOptions` içinden BİLEREK
   * config VARSAYILANI'ndan (`grandstand.defaultTribuneFee = 25`) farklı
   * seçildi: böylece bilet fiyatının config'ten DEĞİL, yarışın KENDİ
   * satırından (`races.tribune_fee`) geldiği kanıtlanabilir.
   */
  const TRIBUNE_FEE = 50;
  const RACE_NAME = 'FINAL E2E Kupası';

  interface SettlementPlace {
    finishPosition: number;
    horseId: string;
    playerId: string | null;
    displayName: string | null;
    participantType: 'human' | 'ai';
    jockeyId: string | null;
    startingStats: Record<string, number>;
    finalTimeMs: number | null;
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

  /** `GET /players/:id/wallet` → tek bir hareketin API sınırındaki hâli. */
  interface WalletTransactionRow {
    id: string;
    type: string;
    canonicalType: string;
    /** İMZALI: negatif = düşüm, pozitif = ekleme. */
    amount: number;
    currency: string;
    balanceBefore: number;
    balanceAfter: number;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: string;
  }

  // ---------------------------------------------------------------------
  // Yardımcılar — hepsi GENEL API üzerinden konuşur (SQL yok).
  // ---------------------------------------------------------------------

  /** `POST /races` — ücretli lobi yarışı açar ve id'sini döner. */
  async function createRace(creator: PlayerWithHorse, override: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: RACE_NAME,
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: ENTRY_FEE,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: TRIBUNE_FEE,
        spectatorCapacity: 500,
        ...override,
      })
      .expect(201);
    return response;
  }

  /** `POST /races/:id/join` — PARA YOLU, `Idempotency-Key` zorunlu. */
  async function join(player: PlayerWithHorse, targetRaceId: string) {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${targetRaceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /** `POST /races/:id/ready` — para taşımaz. */
  async function ready(player: PlayerWithHorse, targetRaceId: string, status: 'ready' | 'not_ready') {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${targetRaceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status })
      .expect(200);
  }

  /**
   * KURULUM (iddia değil): `startDelaySeconds.min = 60` yüzünden yarış her
   * zaman ileridedir; yalnızca BU testin kurduğu satırın saatini geriye
   * çeker. Kuralın kendisi saf fonksiyonda zaten sınanır (`lobby.spec.ts`).
   */
  async function makeRaceStarted(targetRaceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [targetRaceId]);
  }

  /**
   * KURULUM (iddia değil): yönetici işareti. Genel bir ucu YOKTUR
   * (`CLAUDE.md`); iptal ucu yönetici gerektirir.
   */
  async function makeAdmin(playerId: string): Promise<void> {
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [playerId]);
  }

  /** `GET /players/:id` — kendi bakiyesi (sunucunun hesapladığı sayı). */
  async function fetchMoney(playerId: string, authHeader: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}`)
      .set('Authorization', authHeader)
      .expect(200);
    const money = response.body.data.money as number;
    // `pg` BIGINT'i metin döner; uç bunu sayıya çevirmelidir (CLAUDE.md).
    expect(typeof money).toBe('number');
    return money;
  }

  /** `GET /players/:id/wallet` — defter, SQL'siz okunur (mutabakat kaynağı). */
  async function fetchWallet(playerId: string, authHeader: string): Promise<WalletTransactionRow[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/wallet`)
      .set('Authorization', authHeader)
      .expect(200);
    const rows = response.body.data.transactions as WalletTransactionRow[];
    for (const row of rows) {
      expect(typeof row.amount).toBe('number');
      expect(typeof row.balanceBefore).toBe('number');
      expect(typeof row.balanceAfter).toBe('number');
    }
    return rows;
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

  /** Kilitlenene kadar tur atar (`race-lifecycle.e2e-spec.ts` ile AYNI desen). */
  async function lockUntilLocked(targetRaceId: string): Promise<void> {
    const MAX_TICKS = 25;
    for (let tick = 0; tick < MAX_TICKS; tick += 1) {
      await lockRaceUseCase.execute(new Date());
      const result = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [targetRaceId]);
      if (result.rows[0]?.status === 'locking') {
        return;
      }
    }
    throw new Error(`Yarış ${MAX_TICKS} turda kilitlenmedi: ${targetRaceId}`);
  }

  function sumAmounts(rows: WalletTransactionRow[]): number {
    return rows.reduce((total, row) => total + row.amount, 0);
  }

  // =====================================================================
  // A. Kayıt
  // =====================================================================
  it('A. iki gerçek oyuncu (+ izleyici ve crank) kaydolur; her birine başlangıç atı verilir', async () => {
    playerA = await registerTestPlayerWithStarterHorse(app, 'Final Oyuncu A');
    playerB = await registerTestPlayerWithStarterHorse(app, 'Final Oyuncu B');
    spectator = await registerTestPlayerWithStarterHorse(app, 'Final İzleyici');
    crank = await registerTestPlayerWithStarterHorse(app, 'Final Crank');

    for (const player of [playerA, playerB, spectator, crank]) {
      expect(player.playerId).toMatch(/^[0-9a-f-]{36}$/);
      expect(player.horseId).toMatch(/^[0-9a-f-]{36}$/);
      // Kayıt, başlangıç bakiyesini yazar — ve hiçbir defter satırı ÜRETMEZ
      // (başlangıç parası bir "hareket" değildir; bkz. grandstand.e2e-spec).
      expect(await fetchMoney(player.playerId, player.authHeader)).toBe(STARTING_MONEY);
      expect(await fetchWallet(player.playerId, player.authHeader)).toHaveLength(0);
    }
  }, { timeout: 60_000 });

  // =====================================================================
  // B. Yarış aç + katıl + hazır
  // =====================================================================
  it('B. ücretli lobi yarışı açılır; iki oyuncu katılır ve hazır olur (havuz = ödenen ücretler)', async () => {
    // ⚠️ "ÖNCE" bakiyeleri KATILIMDAN ÖNCE alınır (kural 4): sonra alınsaydı
    // ödenen giriş ücreti gizlenir ve defter ile bakiye farkı TAM OLARAK
    // ücret kadar ayrışırdı.
    moneyBeforeA = await fetchMoney(playerA.playerId, playerA.authHeader);
    moneyBeforeB = await fetchMoney(playerB.playerId, playerB.authHeader);

    const createResponse = await createRace(playerA);
    raceId = createResponse.body.data.id as string;

    // Sunucu otoritesi: yarışı açan TOKEN'dan gelir; açmak para TAŞIMAZ.
    expect(createResponse.body.data.createdBy).toBe(playerA.playerId);
    expect(createResponse.body.data.status).toBe('scheduled');
    expect(createResponse.body.data.raceType).toBe('paid');
    expect(typeof createResponse.body.data.entryFee).toBe('number');
    expect(typeof createResponse.body.data.tribuneFee).toBe('number');
    expect(createResponse.body.data.entryFee).toBe(ENTRY_FEE);
    // Tribün ücreti config VARSAYILANINDAN farklı: bilet fiyatının yarışın
    // KENDİ satırından geldiğini ileride kanıtlayabilmek için.
    expect(createResponse.body.data.tribuneFee).toBe(TRIBUNE_FEE);
    expect(TRIBUNE_FEE).not.toBe(config.grandstand.defaultTribuneFee.amount);
    expect(createResponse.body.data.prizePool).toBe(0);
    expect(createResponse.body.data.joinedPlayers).toBe(0);

    await join(playerA, raceId);
    const afterA = await fetchMoney(playerA.playerId, playerA.authHeader);
    expect(afterA).toBe(moneyBeforeA - ENTRY_FEE);

    const joinB = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', playerB.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: playerB.horseId })
      .expect(200);
    // Lobi görünümü GERÇEK ücretlerden oluşan havuzu döner (botlar ödemez).
    expect(joinB.body.data.joinedPlayers).toBe(2);
    expect(joinB.body.data.prizePool).toBe(ENTRY_FEE * 2);

    await ready(playerA, raceId, 'ready');
    await ready(playerB, raceId, 'ready');
  }, { timeout: 60_000 });

  // =====================================================================
  // D. Kilitle + kesinleştir (brief'te C'den sonra; sıra dosya başında açıklandı)
  // =====================================================================
  it(
    'D. yarış kilitlenir ve kesinleşir; ikinci kesinleşme 409 RACE_NOT_SETTLEABLE döner',
    async () => {
      await makeRaceStarted(raceId);
      await lockUntilLocked(raceId);

      const locked = await pool.query<{ status: string; simulation_seed: string | null }>(
        'SELECT status, simulation_seed FROM races WHERE id = $1',
        [raceId],
      );
      expect(locked.rows[0]?.status).toBe('locking');
      // Seed KİLİT ANINDA doğar (kesinleşmede değil).
      expect(locked.rows[0]?.simulation_seed).toEqual(expect.any(String));

      // ÇAĞIRAN KATILIMCI DEĞİL — uç bir "crank"tir (herhangi bir oyuncu).
      const response = await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/settle`)
        .set('Authorization', crank.authHeader)
        .expect(200);
      settleBody = response.body as SettleResponseBody;

      expect(settleBody.success).toBe(true);
      expect(settleBody.data.raceId).toBe(raceId);
      expect(settleBody.data.status).toBe('finished');
      expect(typeof settleBody.data.prizePool).toBe('number');
      expect(settleBody.data.prizePool).toBe(ENTRY_FEE * 2);

      // Çift ödeme YAPISAL olarak imkânsız: koruma `Idempotency-Key` değil,
      // `scheduled/locking → finished` durum geçişinin kendisidir.
      const again = await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/settle`)
        .set('Authorization', crank.authHeader)
        .expect(409);
      expect(again.body.error.code).toBe('RACE_NOT_SETTLEABLE');
    },
    { timeout: 60_000 },
  );

  // =====================================================================
  // E. Ödüller + bildirimler
  // =====================================================================
  it('E. ödüller paylara göre dağıtılır; her gerçek katılımcıya race_finished, ödül alana prize_won düşer', async () => {
    const places = settleBody.data.places;
    // Saha `fieldSize`a botlarla tamamlanır (2 gerçek + 6 bot).
    expect(places).toHaveLength(8);
    expect(places.filter((place) => place.participantType === 'human')).toHaveLength(2);
    expect(places.filter((place) => place.participantType === 'ai')).toHaveLength(6);

    const prizePool = settleBody.data.prizePool;
    const payouts = computePrizePayouts(prizePool, SHARES);

    // ⚠️ SIRA SİMÜLASYONUN SONUCUDUR: "ilk sırada A vardır" gibi bir iddia
    // KURULMAZ. Kurulan iddia sıraya GÖRE tutardır — her sıra, config'teki
    // payın AYNISI olmalıdır; botlar hiçbir zaman ödeme almaz.
    for (const place of places) {
      expect(typeof place.prizeAmount).toBe('number');
      if (place.participantType === 'ai') {
        expect(place.prizeAmount).toBe(0);
        expect(place.playerId).toBeNull();
      } else {
        expect(place.prizeAmount).toBe(payouts[place.finishPosition - 1] ?? 0);
      }
    }

    // Her gerçek katılımcı TAM OLARAK bir `race_finished` alır; `prize_won`
    // ise YALNIZCA gerçekten ödeme yapılan oyuncuya düşer.
    for (const player of [playerA, playerB]) {
      const place = places.find((entry) => entry.playerId === player.playerId);
      expect(place).toBeDefined();

      const finished = ofType(await listNotifications(player), 'race_finished');
      expect(finished).toHaveLength(1);
      expect(finished[0]?.payload).toEqual({
        raceId,
        raceName: RACE_NAME,
        finishPosition: place?.finishPosition,
      });

      const won = ofType(await listNotifications(player), 'prize_won');
      const prize = place?.prizeAmount ?? 0;
      if (prize > 0) {
        expect(won).toHaveLength(1);
        expect(won[0]?.payload).toEqual({ raceId, raceName: RACE_NAME, amount: prize });
      } else {
        expect(won).toHaveLength(0);
      }
    }

    // Koşturan (crank) KATILIMCI DEĞİLDİR: hiçbir sonuç bildirimi almaz.
    expect(ofType(await listNotifications(crank), 'race_finished')).toHaveLength(0);
    expect(ofType(await listNotifications(crank), 'prize_won')).toHaveLength(0);
  }, { timeout: 60_000 });

  // =====================================================================
  // C. Tribün bileti (kesinleşmiş yarış — bkz. dosya başı, sıra gerekçesi)
  // =====================================================================
  it('C. üçüncü oyuncu tribün bileti alır: fiyat races.tribune_fee, bakiyeden düşer, deftere yazılır', async () => {
    const moneyBeforeTicket = await fetchMoney(spectator.playerId, spectator.authHeader);

    const purchase = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/tickets`)
      .set('Authorization', spectator.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    ticketId = purchase.body.data.ticketId as string;
    expect(purchase.body.data.raceId).toBe(raceId);
    // ASIL İDDİA: fiyat yarışın KENDİ satırından gelir, config varsayılanından
    // DEĞİL (bkz. dosya başı). `TRIBUNE_FEE = 50`, config varsayılanı `25`.
    expect(typeof purchase.body.data.price).toBe('number');
    expect(purchase.body.data.price).toBe(TRIBUNE_FEE);
    expect(purchase.body.data.newBalance.money).toBe(moneyBeforeTicket - TRIBUNE_FEE);

    // Bakiyeden GERÇEKTEN düştü — ve yanıt sayıdır (BIGINT metin sızıntısı yok).
    expect(await fetchMoney(spectator.playerId, spectator.authHeader)).toBe(moneyBeforeTicket - TRIBUNE_FEE);

    // Defter: bilet bir SINK'tir (kimseye kredi geçmez) → NEGATİF satır.
    const wallet = await fetchWallet(spectator.playerId, spectator.authHeader);
    const ticketRows = wallet.filter((row) => row.type === 'grandstand_ticket');
    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0]?.amount).toBe(-TRIBUNE_FEE);
    expect(ticketRows[0]?.referenceId).toBe(ticketId);
    expect(ticketRows[0]?.balanceBefore).toBe(moneyBeforeTicket);
    expect(ticketRows[0]?.balanceAfter).toBe(moneyBeforeTicket - TRIBUNE_FEE);
  }, { timeout: 60_000 });

  // =====================================================================
  // F. Defter mutabakatı
  // =====================================================================
  it('F. defter mutabakatı: giriş ücretleri = havuz ve defter toplamı = gerçek bakiye değişimi', async () => {
    moneyAfterA = await fetchMoney(playerA.playerId, playerA.authHeader);
    moneyAfterB = await fetchMoney(playerB.playerId, playerB.authHeader);

    // Bu yarışa ait defter satırları — genel API'den (wallet) okunur, SQL'den
    // DEĞİL. `referenceId` üç para yolunun (katılım, ödül, iade) ortak
    // referansıdır.
    const rowsForRace = [
      ...(await fetchWallet(playerA.playerId, playerA.authHeader)),
      ...(await fetchWallet(playerB.playerId, playerB.authHeader)),
    ].filter((row) => row.referenceId === raceId);

    const entryFees = -rowsForRace
      .filter((row) => row.type === 'lobby_race_entry_fee')
      .reduce((total, row) => total + row.amount, 0);
    const paidTotal = rowsForRace
      .filter((row) => row.type === 'lobby_race_prize')
      .reduce((total, row) => total + row.amount, 0);

    const prizePool = settleBody.data.prizePool;

    // (1) GİRİŞ ÜCRETLERİ = ÖDÜL HAVUZU (botlar ödemez).
    expect(entryFees).toBe(prizePool);

    // (2) HAVUZ = ÖDÜLLER + BOT ARTĞI + PLATFORM PAYI. Botlar sıra
    //     kapabildiğinden havuzun bir kısmı hiç kimseye ödenmez (bilinçli);
    //     platform payı ve bot artığı için ayrı bir hesap satırı YOKTUR —
    //     ikisi de oyuncu ekonomisinden çıkar, başka hesaba girmez.
    const payouts = computePrizePayouts(prizePool, SHARES);
    const botResidue = settleBody.data.places
      .filter((place) => place.participantType === 'ai')
      .reduce((total, place) => total + (payouts[place.finishPosition - 1] ?? 0), 0);
    const platformFee = prizePool - computePrizePayoutTotal(prizePool, SHARES);

    expect(paidTotal + botResidue + platformFee).toBe(prizePool);

    // (3) DEFTER = GERÇEK PARA DEĞİŞİMİ. Yoktan para var olmaz, var olan yok
    //     olmaz: iki bağımsız ölçüm birebir eşleşmelidir.
    const netRows = sumAmounts(rowsForRace);
    expect(netRows).toBe(moneyAfterA + moneyAfterB - (moneyBeforeA + moneyBeforeB));
    expect(netRows).toBe(-(platformFee + botResidue));

    // (4) Yanıttaki `prizeAmount` toplamı, deftere yazılan ödül toplamının
    //     AYNISI olmalı (istemci kendi hesabını yapmaz).
    const humanPrizeTotal = settleBody.data.places
      .filter((place) => place.participantType === 'human')
      .reduce((total, place) => total + place.prizeAmount, 0);
    expect(paidTotal).toBe(humanPrizeTotal);
  }, { timeout: 60_000 });

  // =====================================================================
  // G. Bilet iadesi
  // =====================================================================
  it('G. tribün bileti iade edilir: tutar defterden, ikinci iade 404 RACE_TICKET_NOT_FOUND', async () => {
    const moneyBeforeRefund = await fetchMoney(spectator.playerId, spectator.authHeader);

    const refund = await request(app.getHttpServer())
      .delete(`${racesUrl}/${raceId}/tickets`)
      .set('Authorization', spectator.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    expect(refund.body.data.ticketId).toBe(ticketId);
    expect(refund.body.data.raceId).toBe(raceId);
    expect(typeof refund.body.data.refundedAmount).toBe('number');
    // İade tutarı satın alınan biletin KENDİ fiyatıdır (satır silinmeden önce
    // okunur) — config varsayılanından değil.
    expect(refund.body.data.refundedAmount).toBe(TRIBUNE_FEE);
    expect(refund.body.data.newBalance.money).toBe(moneyBeforeRefund + TRIBUNE_FEE);

    expect(await fetchMoney(spectator.playerId, spectator.authHeader)).toBe(moneyBeforeRefund + TRIBUNE_FEE);

    // Defter: POZİTİF iade satırı, satın almanın AYNASI.
    const refundRows = (await fetchWallet(spectator.playerId, spectator.authHeader)).filter(
      (row) => row.type === 'grandstand_ticket_refund',
    );
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.amount).toBe(TRIBUNE_FEE);
    expect(refundRows[0]?.referenceId).toBe(ticketId);

    // ÇİFT İADE İMKÂNSIZ: bilet satırı silindiğinden ikinci istek 404 döner ve
    // bakiyeyi DEĞİŞTİRMEZ.
    const second = await request(app.getHttpServer())
      .delete(`${racesUrl}/${raceId}/tickets`)
      .set('Authorization', spectator.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(404);
    expect(second.body.error.code).toBe('RACE_TICKET_NOT_FOUND');
    expect(await fetchMoney(spectator.playerId, spectator.authHeader)).toBe(moneyBeforeRefund + TRIBUNE_FEE);
  }, { timeout: 60_000 });

  // =====================================================================
  // H. İkinci yarış: aç → katıl → İPTAL (tam iade, net = 0)
  // =====================================================================
  it('H. ikinci yarış açılıp iptal edilir: iade = ödenen giriş ücreti, oyuncunun neti SIFIR', async () => {
    const createResponse = await createRace(playerA, { name: 'FINAL E2E İptal Kupası' });
    raceTwoId = createResponse.body.data.id as string;
    expect(raceTwoId).not.toBe(raceId);

    // ⚠️ "ÖNCE" bakiyesi KATILIMDAN ÖNCE (kural 4) — bu oyuncu birinci yarışta
    // ödül almış olabilir; ölçüm ondan BAĞIMSIZ olmalıdır.
    moneyBeforeRaceTwo = await fetchMoney(playerA.playerId, playerA.authHeader);
    await join(playerA, raceTwoId);
    expect(await fetchMoney(playerA.playerId, playerA.authHeader)).toBe(moneyBeforeRaceTwo - ENTRY_FEE);

    // KURULUM: yöneticilik genel bir uçtan VERİLMEZ (`CLAUDE.md`) — iptal ucu
    // yönetici gerektirir.
    await makeAdmin(crank.playerId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceTwoId}/cancel`)
      .set('Authorization', crank.authHeader)
      .expect(200);

    // İPTAL EDİLEN yarışta net = 0 DOĞRUDUR (terk edilmiş bir yarışta değil —
    // bkz. CLAUDE.md §13.26). Oyuncu ödediği TAM tutarı geri alır.
    expect(await fetchMoney(playerA.playerId, playerA.authHeader)).toBe(moneyBeforeRaceTwo);

    const rowsForRaceTwo = (await fetchWallet(playerA.playerId, playerA.authHeader)).filter(
      (row) => row.referenceId === raceTwoId,
    );
    const entryFees = -rowsForRaceTwo
      .filter((row) => row.type === 'lobby_race_entry_fee')
      .reduce((total, row) => total + row.amount, 0);
    const refunds = rowsForRaceTwo
      .filter((row) => row.type === 'race_entry_refund')
      .reduce((total, row) => total + row.amount, 0);
    expect(entryFees).toBe(ENTRY_FEE);
    expect(refunds).toBe(entryFees);
    expect(sumAmounts(rowsForRaceTwo)).toBe(0);

    // İkinci iptal 409 — çift iade yok (koruma durum geçişinin kendisidir).
    const again = await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceTwoId}/cancel`)
      .set('Authorization', crank.authHeader)
      .expect(409);
    expect(again.body.error.code).toBe('RACE_NOT_CANCELABLE');
    expect(await fetchMoney(playerA.playerId, playerA.authHeader)).toBe(moneyBeforeRaceTwo);
  }, { timeout: 60_000 });

  // =====================================================================
  // I. Yetkisiz erişim kapıları
  // =====================================================================
  it('I. yetkisiz erişim kapıları: tokensiz istek 401, başkasının kaynağı 403', async () => {
    // (1) Token YOKSA 401 — ve hiçbir satır yazılmaz.
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: playerB.horseId })
      .expect(401);

    // (2) BAŞKASININ cüzdanı okunamaz — `assertSelf` → 403.
    const foreignWallet = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerA.playerId}/wallet`)
      .set('Authorization', spectator.authHeader);
    expect(foreignWallet.status).toBe(403);

    // (3) BAŞKASININ atıyla katılmak 403 (sunucu otoritesi) — ve para
    //     hareket etmez.
    const moneyBeforeAttempt = await fetchMoney(spectator.playerId, spectator.authHeader);
    const attackerRace = await createRace(spectator, { name: 'FINAL E2E Kapı Kupası' });
    const attackerRaceId = attackerRace.body.data.id as string;
    const foreignHorseJoin = await request(app.getHttpServer())
      .post(`${racesUrl}/${attackerRaceId}/join`)
      .set('Authorization', spectator.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: playerB.horseId })
      .expect(403);
    expect(foreignHorseJoin.body.error.code).toBe('FORBIDDEN');
    expect(await fetchMoney(spectator.playerId, spectator.authHeader)).toBe(moneyBeforeAttempt);
  }, { timeout: 60_000 });
});
