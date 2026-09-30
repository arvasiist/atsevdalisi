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
 * EKONOMİK MUTABAKAT — brief §42 PHASE 3 (28.09.2026).
 *
 * **BRIEF'İN İSTEDİĞİ DENKLEM TEK BİR YARIŞ İÇİN AYNEN KURULAMAZ.** Brief
 * `TOPLAM GİRİŞ ÜCRETİ = ÖDÜL HAVUZU + PLATFORM PAYI + İADELER` yazıyor; ama
 * bir yarış **ya kesinleşir ya iptal edilir** — ikisi aynı anda olmaz. İade
 * edilen bir yarışta ödül havuzu HİÇ dağıtılmaz, dağıtılan bir yarışta iade
 * HİÇ olmaz. Bu yüzden denklem, gerçekte var olan ÜÇ ayrı muhasebe olayına
 * çevrilir ve her biri AYRI AYRI kanıtlanır:
 *
 *   1. **KESİNLEŞEN YARIŞ (botsuz):** giriş ücretleri = ödül havuzu, ve
 *      `havuz = DAĞITILAN ÖDÜLLER + PLATFORM PAYI`. Tam eşitlik, çünkü
 *      sahada bot yokken havuzun tamamı ya bir oyuncuya ödenir ya da
 *      platformda kalır.
 *   2. **KESİNLEŞEN YARIŞ (botlu):** `havuz = DAĞITILAN ÖDÜLLER +
 *      BOT ARTĞI + PLATFORM PAYI`. Botlar ödül sırası kapabildiğinden
 *      havuzun bir kısmı **hiç kimseye ödenmez** (`CLAUDE.md` "BOT PAYI
 *      YANAR") — bu bilinçlidir ve mutabakatta AYRI bir terim olarak
 *      görünmek zorundadır, aksi hâlde "para nerede" sorusu yanıtsız kalır.
 *   3. **İPTAL EDİLEN / TERK EDİLEN YARIŞ:** giriş ücretleri = iadeler,
 *      **TAM EŞİTLİKLE**. Havuz dağıtılmadığı için platform payı da doğmaz.
 *
 * **BU DOSYANIN ASIL İDDİASI DEFTERİN KENDİSİDİR.** Her üç olayda da
 * `SUM(economy_transactions.amount) WHERE reference_id = <raceId>` ile
 * **oyuncuların bakiyelerindeki GERÇEK değişim** birebir karşılaştırılır.
 * İki sayı ayrışırsa ya defter yalan söylüyordur ya para yoktan var/dan
 * yok oluyordur; ikisi de hiçbir yerde hata üretmez. `race-settlement.e2e-spec`
 * yalnızca "havuz − ödenen = rake" diyordu; **iadeler ve bot artığı o
 * mutabakatta YOKTU**, yani iptal yolu defterle hiç karşılaştırılmamıştı.
 *
 * **PLATFORM PAYI VE BOT ARTĞI KİMSEYE YAZILMAZ.** Projede bir "platform
 * hesabı" satırı yoktur; ikisi de oyuncu ekonomisinden ÇIKAR ve başka bir
 * hesaba GİRMEZ. Bu, mutabakatta `-(platformPayı + botArtığı)` olarak
 * görünür ve bilinçli bir tasarımdır (uydurma bir "ev hesabı" açmak,
 * bakiyesi olmayan bir satır uydurmak olurdu).
 *
 * **⚠️ BAKİYE ÖLÇÜMÜ KATILIMDAN ÖNCE ALINIR.** Katılımdan SONRA alınan bir
 * "önce" ölçümü, oyuncuların ödediği giriş ücretini gizler: defter `-200`
 * derken bakiye farkı `+10` görünür ve iki sayı tam olarak GİRİŞ ÜCRETİ
 * kadar ayrışır. Bu, ilk koşuda dört testin dördünü de düşürdü; iddialar
 * değil, ölçümün BAŞLANGIÇ ANI yanlıştı. Aynı tuzağın ikinci biçimi şudur:
 * **iptal edilmiş bir yarışta "net = 0" doğrudur, ama TERK EDİLMİŞ bir
 * yarışta değildir** — orada kalan oyuncunun ücreti hâlâ havuzdadır ve
 * doğru iddia "net = −kalan ücret"tir.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Ekonomik mutabakat (e2e) — brief §42 PHASE 3', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  /** ⚠️ `beforeAll` ÖNCESİ hesaplanamaz: `config` o anda `undefined`dır. */
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
      name: 'Mutabakat Kupası',
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
    // READY ŞARTI (30.09.2026): hazır demeyen katılım kilit/kesinleşme
    // anında iptal edilip iade edilir. Bu dosya koşan bir kadro ölçtüğü için
    // her katılım hazır işaretlenir (READY'nin kendisi `race-ready-gate`te).
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  async function leave(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/leave`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
  }

  /** `POST /races` en az 60 sn ileri bir başlangıç zorunlu kılar (ürün kuralı);
   * test bunu BEKLEMEZ, yalnızca kendi kurduğu satırın saatini geriye alır. */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function makeAdmin(playerId: string): Promise<void> {
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [playerId]);
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

  async function raceRowOf(raceId: string): Promise<{ status: string; prize_pool: string }> {
    const result = await pool.query<{ status: string; prize_pool: string }>(
      'SELECT status, prize_pool FROM races WHERE id = $1',
      [raceId],
    );
    return result.rows[0] as { status: string; prize_pool: string };
  }

  async function prizePoolOf(raceId: string): Promise<number> {
    return Number((await raceRowOf(raceId)).prize_pool);
  }

  /**
   * Bu yarışa ait TÜM defter satırları — `reference_type = 'race'` üç para
   * yolunun (katılım, ödül, iade) ortak referansıdır.
   */
  async function ledgerOf(raceId: string): Promise<Array<{ type: string; amount: number; playerId: string }>> {
    const result = await pool.query<{ type: string; amount: string; player_id: string }>(
      `SELECT type, amount, player_id
         FROM economy_transactions
        WHERE reference_type = 'race' AND reference_id = $1
        ORDER BY created_at, id`,
      [raceId],
    );
    return result.rows.map((row) => ({ type: row.type, amount: Number(row.amount), playerId: row.player_id }));
  }

  /** Defterin net etkisi = oyuncu bakiyelerindeki GERÇEK toplam değişim. */
  function netOf(rows: Array<{ amount: number }>): number {
    return rows.reduce((total, row) => total + row.amount, 0);
  }

  function sumOfType(rows: Array<{ type: string; amount: number }>, type: string): number {
    return rows.filter((row) => row.type === type).reduce((total, row) => total + row.amount, 0);
  }

  /** `computePrizePayouts` çıktısı — sabit sayı yazmak config değişince yalan olurdu. */
  function payoutsOf(prizePool: number): number[] {
    return computePrizePayouts(prizePool, SHARES);
  }

  it('kesinleşen yarış (botlu): havuz = ödüller + bot artığı + platform payı ve defter toplamı para değişimine eşittir', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Mutabakat Bir');
    const b = await registerTestPlayerWithStarterHorse(app, 'Mutabakat İki');
    // Uç bir "crank"tir: koşturan kişi katılımcı olmak zorunda değildir.
    const crank = await registerTestPlayerWithStarterHorse(app, 'Mutabakat Crank');
    const humans = [a, b];

    const raceId = await createRace(a);

    // ⚠️ BAKİYE ÖLÇÜMÜ KATILIMDAN **ÖNCE** ALINIR. Katılımdan sonra alınsaydı
    // "para değişimi" yalnızca ÖDÜLÜ gösterir, ödenen giriş ücretini gizlerdi
    // (yaşandı: `netOf(rows) = -190` ile `moneyAfter - moneyBefore = 10`
    // karşılaştırılıyordu ve iki sayı 200 fark ediyordu — 200 tam olarak
    // giriş ücretleriydi).
    const moneyBefore = await totalMoneyOf(humans);
    await join(a, raceId);
    await join(b, raceId);

    // Katılım anında havuz GERÇEK ücretlerden oluşur (botlar para ÖDEMEZ).
    expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE * humans.length);

    await makeRaceStarted(raceId);
    const response = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', crank.authHeader)
      .expect(200);
    const moneyAfter = await totalMoneyOf(humans);

    const prizePool = response.body.data.prizePool as number;
    expect(prizePool).toBe(ENTRY_FEE * humans.length);

    const rows = await ledgerOf(raceId);
    const entryFees = -sumOfType(rows, 'lobby_race_entry_fee');
    const paidTotal = sumOfType(rows, 'lobby_race_prize');

    // (1) GİRİŞ ÜCRETLERİ = ÖDÜL HAVUZU.
    expect(entryFees).toBe(prizePool);

    // (2) HAVUZ = ÖDÜLLER + BOT ARTĞI + PLATFORM PAYI.
    const payouts = payoutsOf(prizePool);
    const places = response.body.data.places as Array<{ participantType: string; finishPosition: number; prizeAmount: number }>;
    const botResidue = places
      .filter((place) => place.participantType === 'ai')
      .reduce((total, place) => total + (payouts[place.finishPosition - 1] ?? 0), 0);
    const platformFee = prizePool - computePrizePayoutTotal(prizePool, SHARES);

    expect(paidTotal + botResidue + platformFee).toBe(prizePool);

    // (3) DEFTER = GERÇEK PARA DEĞİŞİMİ. Yoktan para var olmaz, var olan yok olmaz.
    expect(netOf(rows)).toBe(moneyAfter - moneyBefore);
    expect(netOf(rows)).toBe(-(platformFee + botResidue));

    // (4) Yanıttaki `prizeAmount` DEFTERİN AYNISI olmalı (istemci kendi
    //     hesabını yapmaz). Botlara hiçbir zaman ödeme yapılmaz.
    //
    //     ⚠️ Burada "en az bir oyuncu ödül aldı" GİBİ bir iddia KURULMAZ:
    //     8 atlık sahada 2 gerçek oyuncu ilk beşe girmeyebilir ve ödül
    //     sırası simülasyonun SONUCUDUR (seed her koşuda yenidir) — öyle bir
    //     iddia testi KARARSIZ yapardı. "Ödül gerçekten ödeniyor" iddiası
    //     kararlı biçimde bir SONRAKİ testte, botsuz sahada kurulur.
    let humanPrizeTotal = 0;
    for (const place of places) {
      if (place.participantType === 'ai') {
        expect(place.prizeAmount).toBe(0);
        continue;
      }
      const expected = payouts[place.finishPosition - 1] ?? 0;
      expect(place.prizeAmount).toBe(expected);
      humanPrizeTotal += expected;
    }
    // Yanıt ile defter BİRBİRİNİ DOĞRULAR: sunucunun ödediği toplam, yanıtta
    // gösterdiği toplamdır. Ayrışsalardı oyuncu ekranda gördüğünden başka
    // bir para alırdı ve bu hiçbir yerde hata üretmezdi.
    expect(paidTotal).toBe(humanPrizeTotal);
  });

  it('kesinleşen yarış (botsuz): havuz TAM dağıtılır — giriş ücretleri = ödüller + platform payı', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Tam Saha Kurucu');
    const field = [creator];
    for (let index = 2; index <= 8; index += 1) {
      field.push(await registerTestPlayerWithStarterHorse(app, `Tam Saha ${index}`));
    }

    const raceId = await createRace(creator);
    const moneyBefore = await totalMoneyOf(field);
    for (const player of field) {
      await join(player, raceId);
    }

    await makeRaceStarted(raceId);
    const response = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', creator.authHeader)
      .expect(200);
    const moneyAfter = await totalMoneyOf(field);

    const prizePool = response.body.data.prizePool as number;
    expect(prizePool).toBe(ENTRY_FEE * field.length);

    const places = response.body.data.places as Array<{
      participantType: string;
      finishPosition: number;
      prizeAmount: number;
    }>;
    // Sahada bot YOKTUR — `aiFillEnabled` devrede olsa bile koltuk kalmadı.
    expect(places.every((place) => place.participantType === 'human')).toBe(true);

    const rows = await ledgerOf(raceId);
    const entryFees = -sumOfType(rows, 'lobby_race_entry_fee');
    const paidTotal = sumOfType(rows, 'lobby_race_prize');
    const platformFee = prizePool - computePrizePayoutTotal(prizePool, SHARES);

    expect(entryFees).toBe(prizePool);
    // ⭐ BURASI "ÖDÜL GERÇEKTEN ÖDENİYOR" İDDİASININ KARARLI KANITIDIR:
    //    sahada bot olmadığı için ödül sırasının TAMAMI gerçek oyunculara
    //    aittir, dolayısıyla ödenen toplam sabittir — simülasyon sonucu ne
    //    olursa olsun değişmez.
    expect(paidTotal).toBe(computePrizePayoutTotal(prizePool, SHARES));
    expect(paidTotal).toBeGreaterThan(0);
    // Bot artığı SIFIR: havuzun tamamı ya oyuncuda ya platformdadır.
    expect(paidTotal + platformFee).toBe(prizePool);
    expect(netOf(rows)).toBe(moneyAfter - moneyBefore);
    expect(netOf(rows)).toBe(-platformFee);

    // Yanıt defteri doğrular (sıra → tutar eşlemesi paylardan türetilir).
    const payouts = payoutsOf(prizePool);
    for (const place of places) {
      expect(place.prizeAmount).toBe(payouts[place.finishPosition - 1] ?? 0);
    }
  });

  it('iptal edilen yarış: giriş ücretleri TAM iade edilir, defter toplamı SIFIR ve ikinci iptal para üretmez', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'İptal Kurucu');
    const second = await registerTestPlayerWithStarterHorse(app, 'İptal İkinci');
    const third = await registerTestPlayerWithStarterHorse(app, 'İptal Üçüncü');
    const admin = await registerTestPlayerWithStarterHorse(app, 'İptal Yönetici');
    await makeAdmin(admin.playerId);
    const humans = [creator, second, third];

    const raceId = await createRace(creator);
    const moneyBefore = await totalMoneyOf(humans);
    for (const player of humans) {
      await join(player, raceId);
    }
    expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE * humans.length);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(200);
    const moneyAfter = await totalMoneyOf(humans);

    const row = await raceRowOf(raceId);
    expect(row.status).toBe('cancelled');
    // Havuz SIFIRLANIR: dağıtılmayan bir havuz, "ödül bekleyen" bir yalan olurdu.
    expect(Number(row.prize_pool)).toBe(0);

    const rows = await ledgerOf(raceId);
    const entryFees = -sumOfType(rows, 'lobby_race_entry_fee');
    const refunds = sumOfType(rows, 'race_entry_refund');

    expect(refunds).toBe(entryFees);
    expect(netOf(rows)).toBe(0);
    expect(moneyAfter).toBe(moneyBefore);
    // Her oyuncu tam olarak ödediği tutarı geri alır.
    for (const player of humans) {
      expect(await moneyOf(player.playerId)).toBe(STARTING_MONEY);
    }

    // İKİNCİ İPTAL: `scheduled → cancelled` geçişi zaten kapalıdır; koruma
    // `Idempotency-Key` DEĞİL durum geçişinin kendisidir. Çift iade olmadığı
    // yalnızca kod ile değil, DEFTER SATIR SAYISI ile kanıtlanır.
    const refundRowsBefore = rows.filter((entry) => entry.type === 'race_entry_refund').length;
    const again = await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(409);
    expect(again.body.error.code).toBe('RACE_NOT_CANCELABLE');
    const refundRowsAfter = (await ledgerOf(raceId)).filter((entry) => entry.type === 'race_entry_refund').length;
    expect(refundRowsAfter).toBe(refundRowsBefore);
    expect(await totalMoneyOf(humans)).toBe(moneyBefore);
  });

  it('ayrılan oyuncu: kendi neti SIFIR olur (ödediği kadar geri alır), havuz küçülür', async () => {
    const stayer = await registerTestPlayerWithStarterHorse(app, 'Kalan Oyuncu');
    const leaver = await registerTestPlayerWithStarterHorse(app, 'Ayrılan Oyuncu');

    const raceId = await createRace(stayer);
    await join(stayer, raceId);
    await join(leaver, raceId);
    expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE * 2);

    await leave(leaver, raceId);

    // Havuz GERÇEKTEN küçülür — `prize_pool >= 0` CHECK'i bu yolda çalışır.
    expect(await prizePoolOf(raceId)).toBe(ENTRY_FEE);

    const rows = await ledgerOf(raceId);
    expect(sumOfType(rows, 'race_entry_refund')).toBe(ENTRY_FEE);

    // ⚠️ YARIŞIN NETİ SIFIR **DEĞİLDİR**: kalan oyuncunun ücreti hâlâ
    //    havuzdadır. Yarış sürdüğü için doğru iddia "net = −kalan ücret"tir.
    //    (Yaşandı: buraya `toBe(0)` yazılmıştı ve test −100 görüp düştü —
    //    test HAKLIYDI, iddia yanlıştı.)
    expect(netOf(rows)).toBe(-ENTRY_FEE);

    // SIFIR OLAN ŞEY AYRILAN OYUNCUNUN KENDİ NETİDİR: ödediği kadar geri aldı.
    const leaverRows = rows.filter((row) => row.playerId === leaver.playerId);
    expect(netOf(leaverRows)).toBe(0);
    expect(await moneyOf(leaver.playerId)).toBe(STARTING_MONEY);
    expect(await moneyOf(stayer.playerId)).toBe(STARTING_MONEY - ENTRY_FEE);
  });
});
