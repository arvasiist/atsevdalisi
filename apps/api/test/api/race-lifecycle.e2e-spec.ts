import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * YARIŞ YAŞAM DÖNGÜSÜ — KİLİT ADIMI (§42 PHASE 1, migration 0042).
 *
 * **BU DOSYANIN KANITLADIĞI TEK ŞEY ŞUDUR: `startTime` ANI GERÇEKTEN
 * DONDURULUR.** Bu dilimden önce snapshot ve seed KOŞMA anında üretiliyordu;
 * kesinleşme bir "crank" olduğu için (herhangi bir oyuncu çağırabilir — bkz.
 * `SettleRaceUseCase` doc yorumu) o an `startTime`dan dakikalar sonra
 * olabiliyordu. Yani oyuncu `startTime` ile kesinleşme arasında atını
 * geliştirip sonucu etkileyebiliyordu. `LockRaceUseCase` o pencereyi kapatır.
 *
 * ## Testler neden ZAMANLAYICIYI DEĞİL use-case'i çağırıyor
 *
 * `RaceLockScheduler` `NODE_ENV=test` altında kendini KAPATIR (bkz. sınıf
 * doc yorumu, karar 3). Testler `LockRaceUseCase.execute(now)`u doğrudan
 * çağırır — yani ÇALIŞAN KOD YOLU birebir aynıdır, yalnızca SAAT testin
 * elindedir. Arka planda kendi kendine koşan bir zamanlayıcı, testin
 * kurulumu ile iddiası arasına girip CI'da RASTGELE düşen bir test
 * üretirdi; o tür bir test kanıt değil gürültüdür.
 *
 * ## "Donduruldu" iddiası neden SQL ile kuruluyor (antrenman ucuyla değil)
 *
 * İddia "snapshot atın SONRAKİ hâlini almaz"dır. Bunu antrenman ucuyla
 * kurmak CAZİP görünür ama YALANCI bir test üretir: `applyTraining`'ın
 * `statGain`i config + potansiyel + yorgunluğa bağlıdır ve MEŞRU olarak `0`
 * olabilir (`train-horse.use-case.ts` → `if (statKey !== null && outcome.
 * statGain > 0)`). Gain 0 olduğunda istatistik DEĞİŞMEZ, dolayısıyla
 * "snapshot değişmedi" iddiası hiçbir şeyi kanıtlamaz — test yeşil kalırken
 * boş bir cümle söyler. Bu yüzden istatistik DOĞRUDAN, garanti altında
 * değiştirilir ve ÖNCE "gerçekten değişti" diye İDDİA EDİLİR; ancak ondan
 * sonra "snapshot onu takip etmedi" denir. İkinci iddia birincisi olmadan
 * anlamsızdır.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Yarış yaşam döngüsü (e2e) — kilit ve dondurma', () => {
  let app: INestApplication;
  let pool: Pool;
  let lockRaceUseCase: LockRaceUseCase;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    lockRaceUseCase = app.get(LockRaceUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  const ENTRY_FEE = 100;

  async function createRace(creator: RegisteredTestPlayer, override: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Yaşam Döngüsü Kupası',
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
      })
      .expect(201);
    return response.body.data.id as string;
  }

  async function join(player: RegisteredTestPlayer & { horseId: string }, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /** `startDelaySeconds.min = 60` yüzünden başlangıcı geçmişe çeker (bkz. `race-settlement.e2e-spec.ts`). */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function raceRowOf(raceId: string): Promise<{ status: string; simulation_seed: string | null }> {
    const result = await pool.query<{ status: string; simulation_seed: string | null }>(
      'SELECT status, simulation_seed FROM races WHERE id = $1',
      [raceId],
    );
    return result.rows[0] as { status: string; simulation_seed: string | null };
  }

  /**
   * `raceId` kilitlenene kadar tur atar ve SONUNDA durumu döner.
   *
   * **NEDEN DÖNGÜ — `execute()` bir kez çağırmak yetmez.** Bu test dosyası
   * diğer e2e dosyalarıyla AYNI veritabanını paylaşır ve
   * `findRacesDueForLock` tur başına `lockScheduler.batchSize` (20) kadar
   * aday döner, `start_time` ARTAN sırada. Başka bir dosyanın bıraktığı,
   * başlangıcı geçmiş `scheduled` yarışlar (ör. `race-leave` senaryoları)
   * kuyruğun başını doldurabilir ve bu dosyanın yarışı ilk tura
   * GİRMEYEBİLİR. Tek çağrıyla iddia kurmak, CI'da RASTGELE düşen bir
   * test üretirdi — ve o test kanıt değil gürültü olurdu. Döngü, gerçek
   * zamanlayıcının da yaptığı şeyi yapar: bir sonraki turda devam eder.
   */
  async function lockUntilLocked(raceId: string): Promise<void> {
    const MAX_TICKS = 25;
    for (let tick = 0; tick < MAX_TICKS; tick += 1) {
      await lockRaceUseCase.execute(new Date());
      if ((await raceRowOf(raceId)).status === 'locking') {
        return;
      }
    }
    throw new Error(`Yarış ${MAX_TICKS} turda kilitlenmedi: ${raceId}`);
  }

  interface StoredSnapshot {
    speed: number;
    [key: string]: unknown;
  }

  async function snapshotOf(raceId: string, horseId: string): Promise<StoredSnapshot | null> {
    const result = await pool.query<{ horse_snapshot: StoredSnapshot | null }>(
      'SELECT horse_snapshot FROM race_entries WHERE race_id = $1 AND horse_id = $2',
      [raceId, horseId],
    );
    return result.rows[0]?.horse_snapshot ?? null;
  }

  async function statSpeedOf(horseId: string): Promise<number> {
    const result = await pool.query<{ speed: string }>('SELECT speed FROM horse_stats WHERE horse_id = $1', [horseId]);
    return Number(result.rows[0]?.speed ?? '0');
  }

  async function listNotifications(player: RegisteredTestPlayer): Promise<Record<string, unknown>[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/notifications`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data.notifications as Record<string, unknown>[];
  }

  it('kilitlenen yarış `locking`e geçer, seed ve snapshot DONDURULUR', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Kilit Kurucu');
    const rival = await registerTestPlayerWithStarterHorse(app, 'Kilit Rakip');
    const raceId = await createRace(creator);
    await join(creator, raceId);
    await join(rival, raceId);
    await makeRaceStarted(raceId);

    // ÖN KOŞUL: kilit öncesi ne durum ne seed ne snapshot vardır.
    expect(await raceRowOf(raceId)).toEqual({ status: 'scheduled', simulation_seed: null });
    expect(await snapshotOf(raceId, creator.horseId)).toBeNull();

    await lockUntilLocked(raceId);

    const afterLock = await raceRowOf(raceId);
    expect(afterLock.status).toBe('locking');
    // Seed kilitleme anında DOĞAR (eskiden kesinleşmede doğuyordu).
    expect(afterLock.simulation_seed).toEqual(expect.any(String));

    const frozen = await snapshotOf(raceId, creator.horseId);
    expect(frozen).not.toBeNull();
    expect(typeof frozen?.speed).toBe('number');
  });

  it('`startTime` GELMEMİŞ yarış KİLİTLENMEZ (lobi hâlâ açık kalmalıdır)', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Erken Kurucu');
    const raceId = await createRace(creator);
    await join(creator, raceId);

    const result = await lockRaceUseCase.execute(new Date());

    expect(result.locked).not.toContain(raceId);
    // Durum DEĞİŞMEZ: oyuncu hâlâ katılabilir/ayrılabilir olmalıdır.
    expect((await raceRowOf(raceId)).status).toBe('scheduled');
  });

  it('İKİNCİ kilit turu HİÇBİR ŞEY yapmaz — kilit İDEMPOTENTTİR', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Idempotent Kurucu');
    const raceId = await createRace(creator);
    await join(creator, raceId);
    await makeRaceStarted(raceId);

    await lockUntilLocked(raceId);
    const afterFirst = await raceRowOf(raceId);

    // İkinci tur: yarış artık `scheduled` DEĞİL, dolayısıyla aday listesine
    // bile girmez. İki işçinin aynı yarışı kilitlemesi bu yüzden imkânsızdır.
    const second = await lockRaceUseCase.execute(new Date());
    expect(second.locked).not.toContain(raceId);

    const afterSecond = await raceRowOf(raceId);
    expect(afterSecond.status).toBe('locking');
    // Seed DEĞİŞMEZ — değişseydi ikinci bir koşu doğardı.
    expect(afterSecond.simulation_seed).toBe(afterFirst.simulation_seed);
  });

  it('KATILIMCISIZ yarış kilitlenmez (görünmez `locking` çöplüğü doğmaz)', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Yalnız Kurucu');
    const raceId = await createRace(creator);
    await makeRaceStarted(raceId);

    const result = await lockRaceUseCase.execute(new Date());

    expect(result.locked).not.toContain(raceId);
    expect((await raceRowOf(raceId)).status).toBe('scheduled');
  });

  it('katılımcılara `race_starting` bildirimi yazılır — üreticisi olmayan SON tür kapanır', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Bildirim Kurucu');
    const outsider = await registerTestPlayerWithStarterHorse(app, 'Bildirim Yabancı');
    const raceId = await createRace(creator);
    await join(creator, raceId);
    await makeRaceStarted(raceId);

    await lockUntilLocked(raceId);

    const mine = (await listNotifications(creator)).filter((n) => n.type === 'race_starting');
    expect(mine.length).toBeGreaterThan(0);
    const payload = mine[0]?.payload as { raceId?: string } | undefined;
    expect(payload?.raceId).toBe(raceId);

    // KATILMAYAN oyuncu bu bildirimi ALMAZ — yoksa herkese "yarışın
    // başlıyor" demek olurdu.
    const theirs = (await listNotifications(outsider)).filter((n) => n.type === 'race_starting');
    expect(theirs).toHaveLength(0);
  });

  it('DONDURMA KANITI: kilit sonrası at gelişse bile kesinleşme DONDURULMUŞ hâli kullanır', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Dondurma Kurucu');
    const cranker = await registerTestPlayerWithStarterHorse(app, 'Dondurma Crank');
    const raceId = await createRace(creator);
    await join(creator, raceId);
    await makeRaceStarted(raceId);

    await lockUntilLocked(raceId);

    const frozen = await snapshotOf(raceId, creator.horseId);
    expect(frozen).not.toBeNull();
    const speedAtLock = frozen?.speed as number;
    const seedAtLock = (await raceRowOf(raceId)).simulation_seed;
    expect(seedAtLock).toEqual(expect.any(String));

    // AÇIK PENCEREYİ TAKLİT ET: at, kilit ile kesinleşme arasında gelişir.
    // Bu, PHASE 1 öncesinde sonucu GERÇEKTEN değiştiren hamledir.
    await pool.query('UPDATE horse_stats SET speed = speed + 40 WHERE horse_id = $1', [creator.horseId]);
    const bumped = await statSpeedOf(creator.horseId);
    // ⚠️ ÖN KOŞUL İDDİASI: bu olmadan aşağıdaki iddia boş bir cümle olurdu
    // (bkz. dosya başı doc yorumu).
    expect(bumped).toBeGreaterThan(speedAtLock);

    // Kesinleşme — katılımcı OLMAYAN bir "crank" tarafından (uç katılımcı
    // olmayı gerektirmez; `race-settlement.e2e-spec.ts` ile AYNI desen).
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', cranker.authHeader)
      .expect(200);

    const settled = await raceRowOf(raceId);
    expect(settled.status).toBe('finished');
    // Seed KORUNUR: kesinleşme kendi seed'ini üretseydi dondurulmuş
    // snapshot'la eşleşmeyen bir koşu doğar ve "aynı yarış" iki farklı
    // sonuç verirdi.
    expect(settled.simulation_seed).toBe(seedAtLock);

    const afterSettle = await snapshotOf(raceId, creator.horseId);
    expect(afterSettle).not.toBeNull();
    // ASIL İDDİA: koşan snapshot, KİLİTLENEN andaki hâldir — atın sonradan
    // kazandığı +40 hız ONA GİRMEMİŞTİR.
    expect(afterSettle?.speed).toBe(speedAtLock);
  });

  it('kilitli yarış İPTAL EDİLEBİLİR ve giriş ücreti defterden okunan tutarla iade edilir', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'İptal Kurucu');
    const admin = await registerTestPlayerWithStarterHorse(app, 'İptal Yönetici');
    // Yöneticilik uç noktası YOKTUR (bilinçli — bkz. CLAUDE.md); testler de
    // SQL ile açar.
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);

    const raceId = await createRace(creator);
    await join(creator, raceId);
    await makeRaceStarted(raceId);
    await lockUntilLocked(raceId);

    const before = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [creator.playerId]);

    // ⚠️ GÖVDE GÖNDERİLMEZ: uç gövde kabul etmez ve global `ValidationPipe`
    // `forbidNonWhitelisted: true` ile koşar — fazladan bir alan 400 üretir.
    await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(200);

    expect((await raceRowOf(raceId)).status).toBe('cancelled');
    const after = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [creator.playerId]);
    // `locking` iptal EDİLEBİLİR olmasaydı bu para kalıcı olarak havuzda
    // kilitlenirdi — testin varlık sebebi tam olarak budur.
    expect(Number(after.rows[0]?.money)).toBe(Number(before.rows[0]?.money) + ENTRY_FEE);
  });
});
