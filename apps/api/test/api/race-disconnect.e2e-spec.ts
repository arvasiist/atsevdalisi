import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceSpectatorCountPayload } from '@at-sevdalisi/shared-types';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * BAĞLANTI KOPMASI / YENİDEN BAŞLATMA GÜVENLİĞİ — brief §42 PHASE 4
 * (29.09.2026).
 *
 * **BU DOSYANIN KANITLADIĞI TEK CÜMLE ŞUDUR: `CLIENT DISCONNECT ≠ HORSE
 * REMOVED`.** Oyuncunun interneti kopması, tarayıcıyı kapatması ya da
 * sunucunun yeniden başlaması **yarışın kadrosunu, sonucunu veya parasını
 * DEĞİŞTİRMEZ**. Bu bir "iyi niyet" değil, ölçülen bir olgudur: altı ayrı
 * senaryoda gerçek bir soket koparılır ve **veritabanı satırları bayt bayt
 * karşılaştırılır**.
 *
 * ## Neden bu testler SOKET ile yazılıyor (yalnızca SQL ile değil)
 *
 * Kopmayı taklit etmenin ucuz yolu "hiç soket açma, SQL'e dokunma, sonra
 * 'değişmedi' de" olurdu — ve o test **boş bir cümle** söylerdi: hiç
 * tetiklenmemiş bir kod yolu hakkında hiçbir şey söylemez. Bu yüzden
 * burada GERÇEK bir `socket.io-client` bağlanır, `race.subscribe` ile odaya
 * girer ve `disconnect()` çağrılır — yani `RaceGateway.handleDisconnect`
 * **gerçekten koşar**. İddia ondan SONRA kurulur.
 *
 * ## Kopmanın SUNUCUDA gerçekleştiği nasıl BİLİNİR (vakum tuzağı)
 *
 * `client.disconnect()` istemci tarafında ANINDA döner; sunucunun `disconnect`
 * olayını işlemesi ASENKRONdur. Kopmadan hemen sonra iddia kurmak, sunucu
 * olayı henüz işlemeden "değişmedi" demek olurdu — test yeşil kalır, hiçbir
 * şey kanıtlamaz. Bu yüzden her kopmadan ÖNCE **ikinci bir "tanık" soket**
 * odaya sokulur ve kopan soketin sayıdan düştüğü `race.spectators` olayıyla
 * BEKLENİR (`disconnectAndConfirm`). Bu, `handleDisconnect`'in gerçekten
 * koştuğunun sunucu tarafı kanıtıdır; sayaç yayını tam olarak o metodun
 * içinden çıkar.
 *
 * ## Ölçülen şey neden `race_entries` satırlarının TAMAMI
 *
 * "Kadro bozulmadı" demek için `status` alanına bakmak YETMEZ: bir hata
 * satırı `cancelled` yapmadan da bozabilir (ör. `horse_snapshot`ı temizlemek,
 * `gate_position`ı sıfırlamak, `player_id`yi NULL'a çekmek). Bu yüzden
 * satırlar `JSON.stringify` ile **bütün olarak** karşılaştırılır.
 *
 * ## "Sunucu yeniden başlatma" testinin DÜRÜST SINIRI
 *
 * Son test, aynı veritabanına karşı **İKİNCİ bir Nest uygulama örneği**
 * kurar ve aynı yarışı yeniden kesinleştirmeyi/iptal etmeyi dener. Bu,
 * korumanın **DI konteynerine/örneğe özgü bellekte değil, VERİTABANI
 * DURUMUNDA** yaşadığını kanıtlar (ikinci örneğin use-case nesneleri
 * yepyenidir). **Sınırı dürüstçe yazmak gerekirse:** bu, süreç seviyesindeki
 * bir `module`-scope önbelleği YAKALAMAZ — iki örnek aynı Node sürecini
 * paylaşır. Yani iddia "süreç yeniden başladı" değil, **"koruma isteği
 * karşılayan uygulama örneğinin belleğinde DEĞİL, yarışın durumundadır"**dır.
 * Bu sınırın ötesini iddia etmek, ölçülmemiş bir şeyi söylemek olurdu.
 *
 * ## ÖLÇÜLMEYEN (dürüst boşluk)
 *
 * Gerçek bir süreç ölümü (`SIGKILL`) sırasında YARIDA kalan bir transaction
 * senaryosu burada test EDİLMEZ. O senaryonun güvencesi Postgres'in kendi
 * atomikliğidir (`withTransaction` — COMMIT'ten önce hiçbir şey kalıcı
 * değildir), yani uygulama kodunun değil veritabanının sözleşmesidir ve
 * buradan taklit edilemez.
 *
 * Gerçek PostgreSQL + gerçek TCP portu gerektirir (`race-chat.e2e-spec.ts`
 * ile AYNI kısıt ve AYNI `app.listen(0)` deseni).
 */
const WAIT_MS = 20_000;
const TEST_TIMEOUT_MS = 30_000;

describe('Bağlantı kopması / yeniden başlatma güvenliği (e2e) — brief §42 PHASE 4', () => {
  let app: INestApplication;
  let pool: Pool;
  let lockRaceUseCase: LockRaceUseCase;
  let baseUrl: string;
  /** Yalnızca "sunucu yeniden başladı" testinin kurduğu İKİNCİ örnek. */
  let secondApp: INestApplication | null = null;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    pool = app.get<Pool>(PG_POOL);
    lockRaceUseCase = app.get(LockRaceUseCase);
  });

  afterAll(async () => {
    await secondApp?.close();
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
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Kopma Kupası',
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
    // READY ŞARTI (30.09.2026): hazır demeyen katılım kilit/kesinleşme
    // anında iptal edilip iade edilir. Bu dosya koşan bir kadro ölçtüğü için
    // her katılım hazır işaretlenir (READY'nin kendisi `race-ready-gate`te).
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  /** `POST /races` en az 60 sn ileri bir başlangıç zorunlu kılar; test beklemez, satırın saatini geriye alır. */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function makeAdmin(playerId: string): Promise<void> {
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [playerId]);
  }

  async function settle(
    raceId: string,
    crank: RegisteredTestPlayer,
  ): Promise<{ prizePool: number; places: Array<{ horseId: string; playerId: string | null; participantType: string; finishPosition: number }> }> {
    const response = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', crank.authHeader)
      .expect(200);
    return response.body.data;
  }

  async function adminCancel(raceId: string, admin: RegisteredTestPlayer): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(200);
  }

  /** `race-lifecycle.e2e-spec.ts` ile AYNI tur mantığı — gerekçesi o dosyada yazılı. */
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

  async function raceRowOf(raceId: string): Promise<{ status: string; prize_pool: string; simulation_seed: string | null }> {
    const result = await pool.query<{ status: string; prize_pool: string; simulation_seed: string | null }>(
      'SELECT status, prize_pool, simulation_seed FROM races WHERE id = $1',
      [raceId],
    );
    return result.rows[0] as { status: string; prize_pool: string; simulation_seed: string | null };
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

  function netOf(rows: Array<{ amount: number }>): number {
    return rows.reduce((total, row) => total + row.amount, 0);
  }

  function sumOfType(rows: Array<{ type: string; amount: number }>, type: string): number {
    return rows.filter((row) => row.type === type).reduce((total, row) => total + row.amount, 0);
  }

  /**
   * Katılım satırlarının **TAMAMI**, tek bir metin olarak. `status`e bakmak
   * yetmez (bkz. dosya başı doc yorumu) — `horse_snapshot`, `gate_position`,
   * `final_time_ms`, `performance_score` da karşılaştırılır.
   */
  async function entriesOf(raceId: string): Promise<string> {
    const result = await pool.query(
      `SELECT id, status, horse_id, horse_snapshot, gate_position, tactical_style, risk_level,
              finish_position, final_time_ms, performance_score
         FROM race_entries
        WHERE race_id = $1
        ORDER BY id`,
      [raceId],
    );
    return JSON.stringify(result.rows);
  }

  async function snapshotOf(raceId: string, horseId: string): Promise<unknown> {
    const result = await pool.query<{ horse_snapshot: unknown }>(
      'SELECT horse_snapshot FROM race_entries WHERE race_id = $1 AND horse_id = $2',
      [raceId, horseId],
    );
    return result.rows[0]?.horse_snapshot ?? null;
  }

  function connect(token: string): Socket {
    return io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
  }

  /** `race-chat.e2e-spec.ts` ile AYNI gerekçe: olay, dinleyiciden ÖNCE ateşlenmiş olabilir. */
  async function awaitConnect(client: Socket): Promise<void> {
    if (client.connected) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      client.on('connect_error', reject);
      client.on('connect', () => resolve());
      setTimeout(() => reject(new Error('Soket bağlantısı zaman aşımına uğradı')), WAIT_MS);
    });
  }

  async function subscribe(client: Socket, raceId: string): Promise<void> {
    const rosterPromise = new Promise<void>((resolve, reject) => {
      client.on('race.roster', () => resolve());
      client.on('race.error', (payload: { message: string }) => reject(new Error(payload.message)));
      setTimeout(() => reject(new Error('race.roster zaman aşımına uğradı')), WAIT_MS);
    });
    client.emit('race.subscribe', { raceId });
    await rosterPromise;
  }

  function waitForSpectatorCount(client: Socket, expected: number, timeoutMs = WAIT_MS): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`race.spectators=${expected} zaman aşımına uğradı`)),
        timeoutMs,
      );
      client.on('race.spectators', (payload: RaceSpectatorCountPayload) => {
        if (payload.count === expected) {
          clearTimeout(timer);
          resolve(payload.count);
        }
      });
    });
  }

  /**
   * Soketi koparır ve **sunucunun bunu GERÇEKTEN işlediğini bekler**.
   *
   * Bekleme, tanık soketin aldığı `race.spectators` yayınıdır — o yayın
   * `handleDisconnect`'in içinden çıkar. Bu bariyer olmadan test, sunucu
   * olayı işlemeden "hiçbir şey değişmedi" derdi: yeşil ama BOŞ.
   */
  async function disconnectAndConfirm(
    client: Socket,
    watcher: Socket,
    raceId: string,
    expectedCount: number,
  ): Promise<void> {
    const seen = waitForSpectatorCount(watcher, expectedCount);
    client.disconnect();
    expect(await seen).toBe(expectedCount);
    void raceId;
  }

  it('kopma HİÇBİR yarış durumunda katılım satırına DOKUNMAZ (scheduled/locking/finished/cancelled)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Kopan Oyuncu');
    const watcher = await registerTestPlayerWithStarterHorse(app, 'Kopma Tanığı');
    const crank = await registerTestPlayerWithStarterHorse(app, 'Kopma Crank');
    const admin = await registerTestPlayerWithStarterHorse(app, 'Kopma Yönetici');
    await makeAdmin(admin.playerId);

    // AYNI oyuncu DÖRT ayrı yarışa girer ve dördü de FARKLI bir durumda
    // dondurulur. Kopma anı bu dördünde de aynı olmalıdır.
    //
    // ⚠️ AMA AYNI OYUNCU DÖRT YARIŞ **AÇAMAZ**:
    // `config/race-lobby.config.json` → `maxOpenRacesPerPlayer` = 3 ve
    // dördüncü `POST /races` 409 döner (ilk koşuda tam olarak bu düştü).
    // Ölçülen şey KATILIM olduğu için dördüncü yarışı BAŞKA bir kurucu açar;
    // kurucunun kim olduğu bu dosyanın iddialarını değiştirmez.
    const secondCreator = await registerTestPlayerWithStarterHorse(app, 'Kopma İkinci Kurucu');

    const scheduledId = await createRace(player);
    const lockingId = await createRace(player);
    const finishedId = await createRace(player);
    const cancelledId = await createRace(secondCreator);

    // ⚠️ SIRA ÖNEMLİDİR (30.09.2026): bir at artık AYNI ANDA iki açık
    // (`scheduled`/`locking`) yarışa yazılamaz (`HORSE_IN_ACTIVE_RACE`,
    // bkz. `race-horse-lock.e2e-spec.ts`). Bu yüzden yarışlar TEK TEK
    // kurulur: bitirilen ve iptal edilen yarış atı serbest bırakır; açık
    // kalan İKİ yarış (locking + scheduled) için oyuncuya ikinci bir at
    // verilir. Ölçülen şey OYUNCUNUN katılım satırıdır; hangi atla girdiği
    // bu dosyanın iddialarını değiştirmez.
    await join(player, finishedId);
    await makeRaceStarted(finishedId);
    await settle(finishedId, crank);
    await join(player, cancelledId);
    await adminCancel(cancelledId, admin);
    await join(player, lockingId);
    await makeRaceStarted(lockingId);
    await lockUntilLocked(lockingId);

    const secondHorseId = randomUUID();
    await pool.query(
      `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, quality, potential)
       VALUES ($1, $2, 'Kopma İkinci At', 'mare', 'Arap', CURRENT_DATE - INTERVAL '5 years', 70, 80)`,
      [secondHorseId, player.playerId],
    );
    await pool.query('INSERT INTO horse_stats (horse_id) VALUES ($1)', [secondHorseId]);
    await join({ ...player, horseId: secondHorseId }, scheduledId);
    // Tanık, sayacın düşüşünü görebilmek için AYNI odada olmak zorundadır.
    await join(watcher, scheduledId);

    // Dört durumun GERÇEKTEN kurulduğu iddia edilir — aksi hâlde "dört
    // durumda da dokunulmadı" cümlesi yalnızca bir durum hakkında olurdu.
    expect((await raceRowOf(scheduledId)).status).toBe('scheduled');
    expect((await raceRowOf(lockingId)).status).toBe('locking');
    expect((await raceRowOf(finishedId)).status).toBe('finished');
    expect((await raceRowOf(cancelledId)).status).toBe('cancelled');

    const before = {
      scheduled: await entriesOf(scheduledId),
      locking: await entriesOf(lockingId),
      finished: await entriesOf(finishedId),
      cancelled: await entriesOf(cancelledId),
    };

    // TEK soket, DÖRT oda — `client.data.raceIds` bir KÜME olduğu için
    // `handleDisconnect` dört yarışın da sayacını tazelemek zorundadır.
    const client = connect(player.token);
    const watcherClient = connect(watcher.token);
    try {
      await awaitConnect(client);
      await awaitConnect(watcherClient);
      await subscribe(watcherClient, scheduledId);
      await subscribe(client, scheduledId);
      await subscribe(client, lockingId);
      await subscribe(client, finishedId);
      await subscribe(client, cancelledId);

      // scheduled odasında 2 soket vardı; kopan düşünce 1 kalır.
      await disconnectAndConfirm(client, watcherClient, scheduledId, 1);
    } finally {
      watcherClient.disconnect();
    }

    expect(await entriesOf(scheduledId)).toBe(before.scheduled);
    expect(await entriesOf(lockingId)).toBe(before.locking);
    expect(await entriesOf(finishedId)).toBe(before.finished);
    expect(await entriesOf(cancelledId)).toBe(before.cancelled);
  }, TEST_TIMEOUT_MS);

  it('KİLİTTEN SONRA kopan oyuncu yarıştan DÜŞMEZ: snapshot donmuş kalır, sonuçta görünür ve ödülü deftere yazılır', async () => {
    const runner = await registerTestPlayerWithStarterHorse(app, 'Kopan Koşucu');
    const watcher = await registerTestPlayerWithStarterHorse(app, 'Kilit Tanığı');
    const crank = await registerTestPlayerWithStarterHorse(app, 'Kilit Crank');
    const humans = [runner, watcher];

    const raceId = await createRace(runner);
    const moneyBefore = await totalMoneyOf(humans);
    await join(runner, raceId);
    await join(watcher, raceId);

    await makeRaceStarted(raceId);
    await lockUntilLocked(raceId);
    expect((await raceRowOf(raceId)).status).toBe('locking');

    const frozenSnapshot = await snapshotOf(raceId, runner.horseId);
    expect(frozenSnapshot).not.toBeNull();

    const client = connect(runner.token);
    const watcherClient = connect(watcher.token);
    try {
      await awaitConnect(client);
      await awaitConnect(watcherClient);
      await subscribe(watcherClient, raceId);
      await subscribe(client, raceId);
      await disconnectAndConfirm(client, watcherClient, raceId, 1);
    } finally {
      watcherClient.disconnect();
    }

    // Kopma, DONDURULMUŞ kadroya dokunmaz: yarış hâlâ `locking`, snapshot aynı.
    expect((await raceRowOf(raceId)).status).toBe('locking');
    expect(await snapshotOf(raceId, runner.horseId)).toEqual(frozenSnapshot);

    const settlement = await settle(raceId, crank);
    const moneyAfter = await totalMoneyOf(humans);

    expect((await raceRowOf(raceId)).status).toBe('finished');
    expect(settlement.places.length).toBe(8);

    // ⭐ ASIL İDDİA: kopan oyuncunun atı YARIŞA GİRDİ ve SONUÇTA görünür.
    const mine = settlement.places.find((place) => place.horseId === runner.horseId);
    expect(mine).toBeDefined();
    expect(mine?.participantType).toBe('human');
    expect(mine?.playerId).toBe(runner.playerId);
    // Gerçekten koştu — bitiş sırası yazılmış (yalnızca "listede duruyor" değil).
    expect(mine?.finishPosition).toBeGreaterThan(0);

    const rows = await ledgerOf(raceId);
    expect(netOf(rows)).toBe(moneyAfter - moneyBefore);
  }, TEST_TIMEOUT_MS);

  it('KOPUKKEN iptal edilen yarışta oyuncu parasını GERİ ALIR — bağlantı para yolunu etkilemez', async () => {
    const runner = await registerTestPlayerWithStarterHorse(app, 'İptal Kopan');
    const watcher = await registerTestPlayerWithStarterHorse(app, 'İptal Tanığı');
    const admin = await registerTestPlayerWithStarterHorse(app, 'İptal Yönetici');
    await makeAdmin(admin.playerId);
    const humans = [runner, watcher];

    const raceId = await createRace(runner);
    const moneyBefore = await totalMoneyOf(humans);
    await join(runner, raceId);
    await join(watcher, raceId);

    const client = connect(runner.token);
    const watcherClient = connect(watcher.token);
    try {
      await awaitConnect(client);
      await awaitConnect(watcherClient);
      await subscribe(watcherClient, raceId);
      await subscribe(client, raceId);
      await disconnectAndConfirm(client, watcherClient, raceId, 1);
    } finally {
      watcherClient.disconnect();
    }

    await adminCancel(raceId, admin);

    const row = await raceRowOf(raceId);
    expect(row.status).toBe('cancelled');
    expect(Number(row.prize_pool)).toBe(0);

    const rows = await ledgerOf(raceId);
    expect(sumOfType(rows, 'race_entry_refund')).toBe(ENTRY_FEE * humans.length);
    expect(netOf(rows)).toBe(0);
    // Kopan oyuncu parasını TAM geri aldı.
    expect(await moneyOf(runner.playerId)).toBe(STARTING_MONEY);
    expect(await totalMoneyOf(humans)).toBe(moneyBefore);
  }, TEST_TIMEOUT_MS);

  it('ÇOKLU KOPMA: üç oyuncu birlikte kopar — kadro bozulmaz, üçü de sonuçta görünür', async () => {
    const first = await registerTestPlayerWithStarterHorse(app, 'Çoklu Kopan Bir');
    const second = await registerTestPlayerWithStarterHorse(app, 'Çoklu Kopan İki');
    const third = await registerTestPlayerWithStarterHorse(app, 'Çoklu Kopan Üç');
    const humans = [first, second, third];

    const raceId = await createRace(first);
    const moneyBefore = await totalMoneyOf(humans);
    for (const player of humans) {
      await join(player, raceId);
    }
    await makeRaceStarted(raceId);
    await lockUntilLocked(raceId);

    const clients = humans.map((player) => connect(player.token));
    let probe: Socket | undefined;
    try {
      for (const client of clients) {
        await awaitConnect(client);
      }
      for (const client of clients) {
        await subscribe(client, raceId);
      }

      // ÜÇÜ BİRLİKTE kopar (aynı turda, bilinçli olarak beklenmeden).
      for (const client of clients) {
        client.disconnect();
      }

      // Bariyer: aynı oyunculardan biri YENİ bir soketle odaya girer. Sayaç
      // `1` okunuyorsa eski üç soket sunucuda GERÇEKTEN düşmüştür; kopmalar
      // işlenmemiş olsaydı `4` okunurdu.
      probe = connect(first.token);
      await awaitConnect(probe);
      const alone = waitForSpectatorCount(probe, 1);
      await subscribe(probe, raceId);
      expect(await alone).toBe(1);
    } finally {
      probe?.disconnect();
    }

    const settlement = await settle(raceId, first);
    const moneyAfter = await totalMoneyOf(humans);

    // Kopan ÜÇ oyuncunun üçü de yarıştadır ve sonuçta görünür.
    for (const player of humans) {
      const mine = settlement.places.find((place) => place.horseId === player.horseId);
      expect(mine?.participantType).toBe('human');
      expect(mine?.playerId).toBe(player.playerId);
      expect(mine?.finishPosition).toBeGreaterThan(0);
    }

    const rows = await ledgerOf(raceId);
    expect(netOf(rows)).toBe(moneyAfter - moneyBefore);
  }, TEST_TIMEOUT_MS);

  it('KOPAN oyuncu sonucu OKUYABİLİR (yeniden bağlanma) ve ikinci kesinleşme İKİNCİ ÖDEME üretmez', async () => {
    const first = await registerTestPlayerWithStarterHorse(app, 'Sonuç Okuyan');
    const second = await registerTestPlayerWithStarterHorse(app, 'Sonuç İkinci');
    const humans = [first, second];

    const raceId = await createRace(first);
    const moneyBefore = await totalMoneyOf(humans);
    await join(first, raceId);
    await join(second, raceId);
    await makeRaceStarted(raceId);
    const settlement = await settle(raceId, first);

    const seedAfterSettle = (await raceRowOf(raceId)).simulation_seed;
    expect(seedAfterSettle).not.toBeNull();
    const rowsBefore = await ledgerOf(raceId);
    const moneyAfterSettle = await totalMoneyOf(humans);

    // (1) SOKET: kopan oyuncu AYNI yarışa YENİ bir soketle YENİDEN abone olur.
    const reconnected = connect(first.token);
    try {
      await awaitConnect(reconnected);
      await subscribe(reconnected, raceId);
    } finally {
      reconnected.disconnect();
    }

    // (2) REPLAY: `GET /races/:id/timeline` AYNI seed'i ve AYNI bitiş sırasını
    //     döner — yani kopan oyuncunun gördüğü sonuç, sunucunun yazdığı sonuçtur.
    const timelineResponse = await request(app.getHttpServer())
      .get(`${racesUrl}/${raceId}/timeline`)
      .set('Authorization', first.authHeader)
      .expect(200);
    const timeline = timelineResponse.body.data as {
      simulationSeed: string;
      entrants: Array<{ horseId: string | null; finishPosition: number | null }>;
    };
    expect(timeline.simulationSeed).toBe(seedAfterSettle);
    const fromTimeline = timeline.entrants.find((entrant) => entrant.horseId === first.horseId);
    const fromSettlement = settlement.places.find((place) => place.horseId === first.horseId);
    expect(fromTimeline?.finishPosition).toBe(fromSettlement?.finishPosition);

    // (3) İKİNCİ KESİNLEŞME: koruma `Idempotency-Key` DEĞİL, durum geçişinin
    //     kendisidir. İkinci ödeme olmadığı yalnızca kodla değil, DEFTER SATIR
    //     SAYISI ve BAKİYE ile kanıtlanır.
    const again = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', second.authHeader)
      .expect(409);
    expect(again.body.error.code).toBe('RACE_NOT_SETTLEABLE');

    const rowsAfter = await ledgerOf(raceId);
    expect(rowsAfter.length).toBe(rowsBefore.length);
    expect(sumOfType(rowsAfter, 'lobby_race_prize')).toBe(sumOfType(rowsBefore, 'lobby_race_prize'));
    expect(await totalMoneyOf(humans)).toBe(moneyAfterSettle);
    expect(netOf(rowsAfter)).toBe(moneyAfterSettle - moneyBefore);
  }, TEST_TIMEOUT_MS);

  it('SUNUCU YENİDEN BAŞLARSA koruma VERİTABANINDAN okunur: ikinci örnek de ikinci ödeme/iade yapmaz', async () => {
    const first = await registerTestPlayerWithStarterHorse(app, 'Yeniden Başlat Bir');
    const second = await registerTestPlayerWithStarterHorse(app, 'Yeniden Başlat İki');
    const admin = await registerTestPlayerWithStarterHorse(app, 'Yeniden Başlat Yönetici');
    await makeAdmin(admin.playerId);
    const humans = [first, second];

    // BİTMİŞ yarış ve İPTAL EDİLMİŞ yarış — iki farklı kapanış yolu.
    const finishedRaceId = await createRace(first);
    await join(first, finishedRaceId);
    await join(second, finishedRaceId);
    await makeRaceStarted(finishedRaceId);
    await settle(finishedRaceId, first);

    const cancelledRaceId = await createRace(first);
    await join(first, cancelledRaceId);
    await join(second, cancelledRaceId);
    await adminCancel(cancelledRaceId, admin);

    const finishedRowsBefore = await ledgerOf(finishedRaceId);
    const cancelledRowsBefore = await ledgerOf(cancelledRaceId);
    const moneyBefore = await totalMoneyOf(humans);

    // ⚠️ Bu bir SÜREÇ yeniden başlatması DEĞİL, YENİ BİR UYGULAMA ÖRNEĞİDİR
    //    (dürüst sınır dosya başı doc yorumunda yazılı).
    secondApp = await bootstrapTestApp();
    const secondServer = secondApp.getHttpServer();

    const settleAgain = await request(secondServer)
      .post(`${racesUrl}/${finishedRaceId}/settle`)
      .set('Authorization', second.authHeader)
      .expect(409);
    expect(settleAgain.body.error.code).toBe('RACE_NOT_SETTLEABLE');

    const cancelAgain = await request(secondServer)
      .post(`/api/v1/admin/races/${cancelledRaceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(409);
    expect(cancelAgain.body.error.code).toBe('RACE_NOT_CANCELABLE');

    // İkinci örnek HİÇBİR satır eklemedi ve HİÇBİR bakiyeyi değiştirmedi.
    const finishedRowsAfter = await ledgerOf(finishedRaceId);
    const cancelledRowsAfter = await ledgerOf(cancelledRaceId);
    expect(finishedRowsAfter.length).toBe(finishedRowsBefore.length);
    expect(cancelledRowsAfter.length).toBe(cancelledRowsBefore.length);
    expect(sumOfType(finishedRowsAfter, 'lobby_race_prize')).toBe(sumOfType(finishedRowsBefore, 'lobby_race_prize'));
    expect(sumOfType(cancelledRowsAfter, 'race_entry_refund')).toBe(sumOfType(cancelledRowsBefore, 'race_entry_refund'));
    expect(await totalMoneyOf(humans)).toBe(moneyBefore);
  }, TEST_TIMEOUT_MS);
});
