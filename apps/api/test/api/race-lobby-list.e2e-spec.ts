import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * LOBİ LİSTESİ — `GET /races` (brief §5, §18, §42 PHASE 3).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **LİSTE = "ŞU AN KATILABİLİR YARIŞLAR".** Yalnızca `status =
 *     'scheduled'` satırlar döner; `in_progress`/`finished`/`cancelled`
 *     satırlar SIZMAZ. (Sızsalardı oyuncu katılamayacağı bir yarışa
 *     tıklar ve `RACE_NOT_JOINABLE` yerdi.)
 *  2. **`joinedPlayers` GERÇEK OYUNCULARI SAYAR.** `bot_label` dolu bot
 *     satırları sayılmaz — sayılsalardı, brief §6 "kalan koltuklar AI ile
 *     dolar" kuralı yüzünden lobi her yarışı DOLU gösterirdi ve kimse
 *     katılmazdı. Bu, sayımın en kolay yanlış yapılabilecek yeri olduğu
 *     için doğrudan DB'ye bot satırı yazılarak sınanır.
 *  3. **KATILIMSIZ YARIŞ DA GÖRÜNÜR.** `LEFT JOIN`in `WHERE`'a kayması
 *     (klasik hata) sıfır katılımlı yarışları listeden tamamen silerdi.
 *  4. **OKUMA YOLUDUR.** Bakiye/havuz/defter üçlüsü listeden sonra
 *     TIPATIP aynıdır — ve `?limit` hiçbir zaman 500 üretmez.
 *
 * **SIRALAMA İDDİASI NEDEN "GÖRELİ":** e2e dosyaları AYNI veritabanını
 * paylaşır ve `vitest` dosyaları koşarken başka testlerin açtığı yarışlar
 * da lobide olabilir. Bu yüzden "ilk eleman şu id'dir" gibi MUTLAK bir
 * iddia kurulamaz; iddia yalnızca KENDİ açtığımız yarışların BİRBİRİNE
 * GÖRE sırasıdır. Bu, testi kırılgan olmaktan çıkarır ama sıralama
 * kuralını (start_time ASC) yine de gerçekten sınar.
 */
describe('Lobi listesi (e2e) — GET /races', () => {
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
  const STARTING_MONEY = 5_000;
  // Sihirli sayı YOK (CLAUDE.md kural 6): tavan, testin kendi beklentisi
  // olarak elle yazılmaz, ÜRETİMİN okuduğu config'ten gelir. Böylece
  // "kod ile config ayrıştı" hatası burada da yakalanır.
  const MAX_LIMIT = loadRaceLobbyConfig().lobbyListMaxLimit;

  /**
   * `startDelaySeconds` config aralığı: 60…604800.
   *
   * **VARSAYILAN NEDEN 120 SANİYE — BİR SAAT DEĞİL (yaşandı, 27.09.2026):**
   * e2e dosyaları AYNI veritabanını paylaşır ve diğer TÜM dosyalar
   * yarışlarını `now + 3600 sn` ile açar. Varsayılan `limit = 20` olduğu
   * için, bu dosya da 3600 kullansaydı açtığı yarış `ORDER BY start_time
   * ASC` sıralamasında testin KOŞTUĞU ANDA veritabanında birikmiş 20'den
   * fazla yarışın ALTINDA kalır ve **listede hiç görünmezdi**. İlk koşuda
   * tam olarak bu oldu: 7 test "expected [...] to include <benim id'im>"
   * ile düştü — üretim kodu doğruydu, test kurgusu kırılgandı.
   *
   * Çözüm, sıralamayı DETERMİNİSTİK kılmaktır: bu dosyanın açtığı yarışlar
   * (120 sn) diğer dosyalarınkinden (3600 sn) HER ZAMAN önce başlar, yani
   * listenin BAŞINDA gelir ve varsayılan tavana takılmaz. 120 > 60
   * (`startDelaySeconds.min`) olduğu için config'e de uygundur.
   */
  const EARLIEST_START_SECONDS = 120;

  function startTimeIn(secondsFromNow: number): string {
    return new Date(Date.now() + secondsFromNow * 1_000).toISOString();
  }

  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const entryFee = (override.entryFee as number | undefined) ?? 50;
    const body = {
      name: 'Lobi Listesi Kupası',
      fieldSize: 12,
      maxPlayers: 8,
      entryFee,
      raceType: entryFee > 0 ? 'paid' : 'free',
      startTime: startTimeIn(EARLIEST_START_SECONDS),
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

  /** Liste isteği — `limit` HAM geçirilir, `undefined` ise parametre hiç eklenmez. */
  function list(player: RegisteredTestPlayer, limit?: string) {
    const call = request(app.getHttpServer()).get(racesUrl).set('Authorization', player.authHeader);
    return limit === undefined ? call : call.query({ limit });
  }

  /**
   * Yanıttaki yarışların id'lerini sırayla döner.
   *
   * **VARSAYILAN OLARAK TAVANI (`?limit=100`) KULLANIR:** bu dosyanın
   * testleri "filtre/sıralama/sayım" iddialarıdır, "varsayılan limit kaç"
   * iddiası DEĞİL. Varsayılanı (20) kullanmak, paylaşılan veritabanında
   * biriken yarış sayısına bağlı kırılgan bir test üretirdi. Varsayılan
   * limitin KENDİSİ ayrıca `?limit=abc` testinde sınanır.
   */
  async function idsFor(player: RegisteredTestPlayer, limit = String(MAX_LIMIT)): Promise<string[]> {
    const response = await list(player, limit).expect(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    return (response.body.data as Array<{ id: string }>).map((race) => race.id);
  }

  /** Verilen id'lerin listedeki GÖRELİ sırasını döner (`indexOf`'un filtrelenmiş hâli). */
  function relativeOrder(ids: string[], mine: string[]): string[] {
    return ids.filter((id) => mine.includes(id));
  }

  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  describe('filtre: yalnızca katılınabilir yarışlar', () => {
    it('`scheduled` OLMAYAN yarışlar listede GÖRÜNMEZ', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Durum Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Durum Bakan');
      const scheduled = await createRace(creator, { name: 'Açık Kalan' });
      const inProgress = await createRace(creator, { name: 'Koşan' });
      const finished = await createRace(creator, { name: 'Bitmiş' });

      // `races_status_check` (migration 0006) tam olarak
      // ('scheduled','in_progress','finished','cancelled') kabul eder.
      await pool.query("UPDATE races SET status = 'in_progress' WHERE id = $1", [inProgress]);
      await pool.query("UPDATE races SET status = 'finished' WHERE id = $1", [finished]);

      const ids = await idsFor(viewer);

      expect(ids).toContain(scheduled);
      expect(ids).not.toContain(inProgress);
      expect(ids).not.toContain(finished);
    });

    it('`cancelled` yarış da GÖRÜNMEZ', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'İptal Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'İptal Bakan');
      const cancelled = await createRace(creator, { name: 'İptal Edilen' });
      await pool.query("UPDATE races SET status = 'cancelled' WHERE id = $1", [cancelled]);

      expect(await idsFor(viewer)).not.toContain(cancelled);
    });

    it('katılımı OLMAYAN yarış da görünür (LEFT JOIN `WHERE`\'a kaymamalı)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Boş Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Boş Bakan');
      const raceId = await createRace(creator, { name: 'Kimsesiz Yarış' });

      const response = await list(viewer, String(MAX_LIMIT)).expect(200);
      const race = (response.body.data as Array<{ id: string; joinedPlayers: number }>).find(
        (candidate) => candidate.id === raceId,
      );

      // `find` `undefined` dönerse test burada düşer — yani "listede var"
      // iddiası dolaylı olarak sınanmış olur.
      expect(race).toBeDefined();
      expect(race?.joinedPlayers).toBe(0);
    });
  });

  describe('sıralama: en yakın başlayacak en üstte (start_time ASC)', () => {
    it('kendi yarışlarım başlangıç zamanına göre ARTAN sırada döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sıra Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Sıra Bakan');
      // Kasıtlı olarak TERS sırada açıyoruz: liste INSERT sırasını değil,
      // `start_time`ı yansıtmalı. Üçü de `EARLIEST_START_SECONDS` civarında
      // ve BİRBİRİNDEN FARKLI seçilir — eşit olsalardı sıralama
      // deterministik olmazdı (yukarıdaki uzun nota bakın).
      const late = await createRace(creator, { name: 'Geç Başlayan', startTime: startTimeIn(EARLIEST_START_SECONDS + 120) });
      const early = await createRace(creator, { name: 'Erken Başlayan', startTime: startTimeIn(EARLIEST_START_SECONDS) });
      const middle = await createRace(creator, { name: 'Ortada Başlayan', startTime: startTimeIn(EARLIEST_START_SECONDS + 60) });

      const order = relativeOrder(await idsFor(viewer), [late, early, middle]);

      expect(order).toEqual([early, middle, late]);
    });
  });

  describe('doluluk sayımı: botlar SAYILMAZ (brief §6)', () => {
    it('`joinedPlayers` yalnızca GERÇEK oyuncuları sayar', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sayım Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Gerçek Katılan');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Sayım Bakan');
      const raceId = await createRace(creator, { name: 'Sayım Yarışı' });

      await join(player, raceId);

      // Gerçek bir bot satırı: `horse_id` NULL + `bot_label` dolu
      // (migration 0025'in `race_entries_horse_xor_bot_chk` kısıtı tam
      // olarak bunu ister; `player_id` de NULL kalır, çünkü migration
      // 0037 "botun oyuncusu olamaz" der). Koltuk sütununun adı `lane`
      // DEĞİL `gate_position`dır (`lane` yalnızca
      // `race_entry_segments`'tedir).
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, bot_label, gate_position)
         VALUES ($1, NULL, 'bot-1', 2)`,
        [raceId],
      );

      const response = await list(viewer, String(MAX_LIMIT)).expect(200);
      const race = (response.body.data as Array<{ id: string; joinedPlayers: number }>).find(
        (candidate) => candidate.id === raceId,
      );

      // `COUNT(*)` olsaydı 2 dönerdi; `COUNT(e.player_id)` 1 döner.
      expect(race?.joinedPlayers).toBe(1);
    });

    it('`ready` işaretlemek doluluğu DEĞİŞTİRMEZ (katılım silinmez)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Hazır Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Hazır Olan');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Hazır Bakan');
      const raceId = await createRace(creator, { name: 'Hazırlık Sayımı' });
      await join(player, raceId);

      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/ready`)
        .set('Authorization', player.authHeader)
        .send({ status: 'ready' })
        .expect(200);

      const response = await list(viewer, String(MAX_LIMIT)).expect(200);
      const race = (response.body.data as Array<{ id: string; joinedPlayers: number }>).find(
        (candidate) => candidate.id === raceId,
      );

      expect(race?.joinedPlayers).toBe(1);
    });
  });

  describe('görünüm alanları ve okuma güvenliği', () => {
    it('yanıt `RaceLobbyView` alanlarını taşır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Alan Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Alan Bakan');
      const raceId = await createRace(creator, { name: 'Alanlar Kupası', entryFee: 250 });

      const response = await list(viewer, String(MAX_LIMIT)).expect(200);
      const race = (response.body.data as Array<Record<string, unknown>>).find(
        (candidate) => candidate.id === raceId,
      );

      expect(race).toBeDefined();
      expect(race).toMatchObject({
        id: raceId,
        name: 'Alanlar Kupası',
        status: 'scheduled',
        entryFee: 250,
        raceType: 'paid',
        maxPlayers: 8,
        joinedPlayers: 0,
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      });
      expect(typeof race?.startTime).toBe('string');
    });

    it('liste HİÇBİR ŞEYİ DEĞİŞTİRMEZ (bakiye, havuz, defter sabit)', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sabit Kuran');
      const player = await registerTestPlayerWithStarterHorse(app, 'Sabit Katılan');
      const raceId = await createRace(creator, { name: 'Sabitlik Yarışı' });
      await join(player, raceId);

      const moneyBefore = Number(
        (await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [player.playerId])).rows[0]
          ?.money ?? '0',
      );
      const poolBefore = Number(
        (await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId])).rows[0]
          ?.prize_pool ?? '0',
      );
      const ledgerBefore = Number(
        (
          await pool.query<{ count: string }>(
            'SELECT COUNT(*) AS count FROM economy_transactions WHERE player_id = $1',
            [player.playerId],
          )
        ).rows[0]?.count ?? '0',
      );

      await list(player).expect(200);

      const moneyAfter = Number(
        (await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [player.playerId])).rows[0]
          ?.money ?? '0',
      );
      const poolAfter = Number(
        (await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId])).rows[0]
          ?.prize_pool ?? '0',
      );
      const ledgerAfter = Number(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*) AS count FROM economy_transactions WHERE player_id = $1',
            [player.playerId],
          )
        ).rows[0]?.count ?? '0',
      );

      expect(moneyBefore).toBe(STARTING_MONEY - 50);
      expect(moneyAfter).toBe(moneyBefore);
      expect(poolAfter).toBe(poolBefore);
      expect(ledgerAfter).toBe(ledgerBefore);
    });
  });

  describe('`?limit` — kırpılır, 400 DEĞİL (brief §18)', () => {
    it('`?limit=1` yalnızca bir yarış döner', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Limit Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Limit Bakan');
      await createRace(creator, { name: 'Limit A', startTime: startTimeIn(3_600) });
      await createRace(creator, { name: 'Limit B', startTime: startTimeIn(4_000) });
      await createRace(creator, { name: 'Limit C', startTime: startTimeIn(4_400) });

      expect((await idsFor(viewer, '1')).length).toBe(1);
    });

    it('`?limit=abc` VARSAYILANA düşer — 400/500 DEĞİL', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Bozuk Kuran');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Bozuk Bakan');
      await createRace(creator, { name: 'Bozuk A', startTime: startTimeIn(3_600) });
      await createRace(creator, { name: 'Bozuk B', startTime: startTimeIn(4_000) });

      const ids = await idsFor(viewer, 'abc');

      // Varsayılan (20) > 1 olduğundan, bozuk parametre 400 dönseydi bu
      // istek zaten `.expect(200)`te düşerdi; kırpılan bir `1` dönseydi
      // uzunluk 1 olurdu. En az iki kendi yarışımız görünmeli.
      expect(ids.length).toBeGreaterThan(1);
    });

    it('`?limit=0` ve negatif değer VARSAYILANA düşer', async () => {
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Sıfır Bakan');

      await list(viewer, '0').expect(200);
      await list(viewer, '-5').expect(200);
    });

    it('tavan (`?limit=100000`) KIRPILIR — istek patlamaz', async () => {
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Tavan Bakan');

      const response = await list(viewer, '100000').expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect((response.body.data as unknown[]).length).toBeLessThanOrEqual(MAX_LIMIT);
    });
  });

  describe('yetki', () => {
    it('token YOKSA 401 döner', async () => {
      await request(app.getHttpServer()).get(racesUrl).expect(401);
    });

    it('liste oyuncuya ÖZEL değildir — iki farklı oyuncu aynı yarışı görür', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Ortak Kuran');
      const first = await registerTestPlayerWithStarterHorse(app, 'Birinci Bakan');
      const second = await registerTestPlayerWithStarterHorse(app, 'İkinci Bakan');
      const raceId = await createRace(creator, { name: 'Ortak Yarış' });

      expect(await idsFor(first)).toContain(raceId);
      expect(await idsFor(second)).toContain(raceId);
    });
  });

  describe('`myEntry` — çağıranın KENDİ katılımı (30.09.2026)', () => {
    async function rowFor(player: RegisteredTestPlayer, raceId: string) {
      const response = await list(player, String(MAX_LIMIT)).expect(200);
      const row = (response.body.data as Array<{ id: string; myEntry: unknown }>).find((race) => race.id === raceId);
      expect(row).toBeDefined();
      return row as { id: string; myEntry: { status: string; horseId: string } | null };
    }

    it('katılmayan için `null`, katılan için durum + at; READY ve ayrılma yansır', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Benim Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Benim Katılan');
      const raceId = await createRace(creator, { name: 'Benim Yarışım' });

      expect((await rowFor(joiner, raceId)).myEntry).toBeNull();

      await join(joiner, raceId);
      expect((await rowFor(joiner, raceId)).myEntry).toEqual({ status: 'waiting', horseId: joiner.horseId });

      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/ready`)
        .set('Authorization', joiner.authHeader)
        .send({ status: 'ready' })
        .expect(200);
      expect((await rowFor(joiner, raceId)).myEntry?.status).toBe('ready');

      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/leave`)
        .set('Authorization', joiner.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);
      expect((await rowFor(joiner, raceId)).myEntry?.status).toBe('cancelled');
    });

    it('BAŞKASININ katılımı `myEntry`e SIZMAZ ve doluluk sayımı değişmez', async () => {
      const creator = await registerTestPlayerWithStarterHorse(app, 'Sızma Kuran');
      const joiner = await registerTestPlayerWithStarterHorse(app, 'Sızma Katılan');
      const observer = await registerTestPlayerWithStarterHorse(app, 'Sızma Gözlemci');
      const raceId = await createRace(creator, { name: 'Sızma Yarışı' });
      await join(joiner, raceId);

      const seen = (await list(observer, String(MAX_LIMIT)).expect(200)).body.data as Array<{
        id: string;
        joinedPlayers: number;
        myEntry: unknown;
      }>;
      const row = seen.find((race) => race.id === raceId);
      expect(row?.myEntry).toBeNull();
      expect(row?.joinedPlayers).toBe(1);
    });
  });
});
