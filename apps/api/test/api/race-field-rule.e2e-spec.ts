import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 (Aşama 3) — YARIŞ SİSTEMİ KANITLARI.
 *
 * 1. YETERSİZ OYUNCU KURALI: ücretli yarış en az `paidMinRealPlayers` gerçek
 *    oyuncuyla koşar; dolmazsa kilit anında İPTAL + defterden okunan tutarla
 *    İADE + `race_cancelled` bildirimi (aynı transaction). Ücretsiz yarış tek
 *    oyuncuyla botlu koşar. Botsuz yarış (`aiFill: false`) hiç bot koşturmaz.
 * 2. 8/10/12/14/16 ATLIK SAHA: kadro `fieldSize`a botla tamamlanır, kulvarlar
 *    tekil, sıralar 1..N eksiksiz.
 * 3. EŞZAMANLI KESİNLEŞME: aynı anda gelen N kesinleştirme isteğinden YALNIZCA
 *    biri yarışı koşar; ödül oyuncu başına bir kez yazılır.
 * 4. Yönetim iptali de oyuncuya `race_cancelled` (`admin`) bildirimi yollar.
 *
 * Saf kural matrisi `test/domain/race/field-rule.spec.ts`te.
 */
const LOBBY = loadRaceLobbyConfig();
const ENTRY_FEE = 100;

describe('Yarış saha kuralı + saha boyutları + eşzamanlı kesinleşme (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let lockRace: LockRaceUseCase;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    lockRace = app.get(LockRaceUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createRace(creator: RegisteredTestPlayer, override: Record<string, unknown> = {}): Promise<string> {
    const fieldSize = (override.fieldSize as number | undefined) ?? 8;
    const response = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Saha Kuralı Kupası',
        fieldSize,
        maxPlayers: LOBBY.minPlayers,
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

  async function joinReady(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function statusOf(raceId: string): Promise<string> {
    const result = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
    return result.rows[0]!.status;
  }

  /** Ortak DB'de kuyruğun başı başka dosyaların artığıyla dolu olabilir — tur atılır. */
  async function lockUntil(raceId: string, statuses: readonly string[]): Promise<string> {
    for (let tick = 0; tick < 25; tick += 1) {
      await lockRace.execute(new Date());
      const status = await statusOf(raceId);
      if (statuses.includes(status)) return status;
    }
    throw new Error(`Yarış 25 turda ${statuses.join('/')} olmadı: ${raceId}`);
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0]!.money);
  }

  async function ledgerNetFor(playerId: string, raceId: string): Promise<number> {
    const result = await pool.query<{ total: string | null }>(
      `SELECT SUM(amount) AS total FROM economy_transactions
        WHERE player_id = $1 AND reference_type = 'race' AND reference_id = $2`,
      [playerId, raceId],
    );
    return Number(result.rows[0]!.total ?? 0);
  }

  async function cancelledNotifications(player: RegisteredTestPlayer): Promise<Array<Record<string, unknown>>> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/notifications`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return (response.body.data.notifications as Array<Record<string, unknown>>).filter(
      (notification) => notification.type === 'race_cancelled',
    );
  }

  async function settle(player: RegisteredTestPlayer, raceId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/settle`)
      .set('Authorization', player.authHeader)
      .send({});
  }

  describe('yetersiz oyuncu kuralı', () => {
    it('ÜCRETLİ yarışta tek gerçek oyuncu: kilitte iptal, ücret iade, bildirim; bakiye başa döner', async () => {
      const solo = await registerTestPlayerWithStarterHorse(app, 'Yalnız Koşucu');
      const before = await moneyOf(solo.playerId);
      const raceId = await createRace(solo);

      const listed = await request(app.getHttpServer())
        .get('/api/v1/races')
        .set('Authorization', solo.authHeader)
        .expect(200);
      const row = (listed.body.data as Array<Record<string, unknown>>).find((race) => race.id === raceId)!;
      expect(row.fieldRule).toEqual({ minRealPlayers: LOBBY.fieldRules.paidMinRealPlayers, aiFill: true });

      await joinReady(solo, raceId);
      expect(await moneyOf(solo.playerId)).toBe(before - ENTRY_FEE);
      await makeRaceStarted(raceId);

      expect(await lockUntil(raceId, ['cancelled', 'locking'])).toBe('cancelled');
      expect(await moneyOf(solo.playerId)).toBe(before);
      expect(await ledgerNetFor(solo.playerId, raceId)).toBe(0);
      const entry = await pool.query<{ status: string }>(
        'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2',
        [raceId, solo.playerId],
      );
      expect(entry.rows[0]!.status).toBe('cancelled');

      const notifications = await cancelledNotifications(solo);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.payload).toEqual({
        raceId,
        raceName: 'Saha Kuralı Kupası',
        reason: 'not_enough_players',
        refundedAmount: ENTRY_FEE,
      });

      // Kesinleştirme artık mümkün değil: yarış çıkışsız `cancelled`.
      const late = await settle(solo, raceId);
      expect(late.status).toBe(409);
    });

    it('ücretli yarış kesinleştirme yoluyla (kilit atlanarak) da aynı kuralla iptal olur — botlu koşmaz', async () => {
      const solo = await registerTestPlayerWithStarterHorse(app, 'Crankçı');
      const before = await moneyOf(solo.playerId);
      const raceId = await createRace(solo);
      await joinReady(solo, raceId);
      await makeRaceStarted(raceId);

      expect((await settle(solo, raceId)).status).toBe(409);
      expect(await statusOf(raceId)).toBe('cancelled');
      expect(await moneyOf(solo.playerId)).toBe(before);
    });

    it('ÜCRETSİZ yarış tek oyuncuyla botlu koşar (kaybedilecek para yok)', async () => {
      const solo = await registerTestPlayerWithStarterHorse(app, 'Ücretsiz Yalnız');
      const raceId = await createRace(solo, { entryFee: 0, raceType: 'free' });
      await joinReady(solo, raceId);
      await makeRaceStarted(raceId);

      const response = await settle(solo, raceId);
      expect(response.status).toBe(200);
      const places = response.body.data.places as Array<{ participantType: string }>;
      expect(places).toHaveLength(8);
      expect(places.filter((place) => place.participantType === 'human')).toHaveLength(1);
    });

    it('iki gerçek oyuncu: ücretli yarış botla 8 ata tamamlanıp koşar', async () => {
      const a = await registerTestPlayerWithStarterHorse(app, 'İkili A');
      const b = await registerTestPlayerWithStarterHorse(app, 'İkili B');
      const raceId = await createRace(a);
      await joinReady(a, raceId);
      await joinReady(b, raceId);
      await makeRaceStarted(raceId);

      expect(await lockUntil(raceId, ['cancelled', 'locking'])).toBe('locking');
      const response = await settle(a, raceId);
      expect(response.status).toBe(200);
      const places = response.body.data.places as Array<{ participantType: string }>;
      expect(places).toHaveLength(8);
      expect(places.filter((place) => place.participantType === 'ai')).toHaveLength(6);
    });

    it('BOTSUZ yarış (aiFill: false): yalnızca gerçek oyuncular koşar, tek oyuncu yetmez', async () => {
      const a = await registerTestPlayerWithStarterHorse(app, 'Botsuz A');
      const b = await registerTestPlayerWithStarterHorse(app, 'Botsuz B');
      const raceId = await createRace(a, { aiFill: false });
      const stored = await pool.query<{ ai_fill: boolean; min_real_players: number }>(
        'SELECT ai_fill, min_real_players FROM races WHERE id = $1',
        [raceId],
      );
      expect(stored.rows[0]).toEqual({
        ai_fill: false,
        min_real_players: Math.max(LOBBY.fieldRules.paidMinRealPlayers, LOBBY.fieldRules.botlessMinRealPlayers),
      });
      await joinReady(a, raceId);
      await joinReady(b, raceId);
      await makeRaceStarted(raceId);

      const response = await settle(a, raceId);
      expect(response.status).toBe(200);
      const places = response.body.data.places as Array<{ participantType: string; prizeAmount: number }>;
      expect(places).toHaveLength(2);
      expect(places.every((place) => place.participantType === 'human')).toBe(true);
      // Botsuz sahada ödül sırasının tamamı gerçek oyuncudur (bot payı yanmaz).
      expect(places.every((place) => place.prizeAmount > 0)).toBe(true);

      const solo = await registerTestPlayerWithStarterHorse(app, 'Botsuz Yalnız');
      const soloRace = await createRace(solo, { aiFill: false, entryFee: 0, raceType: 'free' });
      await joinReady(solo, soloRace);
      await makeRaceStarted(soloRace);
      expect(await lockUntil(soloRace, ['cancelled', 'locking'])).toBe('cancelled');
      expect((await cancelledNotifications(solo))[0]!.payload).toMatchObject({
        reason: 'not_enough_players',
        refundedAmount: 0,
      });
    });

    it('hazır demeyen oyuncu düşer ve `not_ready` bildirimi alır; yarış diğerleriyle koşar', async () => {
      const a = await registerTestPlayerWithStarterHorse(app, 'Hazır A');
      const b = await registerTestPlayerWithStarterHorse(app, 'Hazır B');
      const late = await registerTestPlayerWithStarterHorse(app, 'Hazır Değil');
      const raceId = await createRace(a);
      await joinReady(a, raceId);
      await joinReady(b, raceId);
      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/join`)
        .set('Authorization', late.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: late.horseId })
        .expect(200);
      await makeRaceStarted(raceId);

      expect(await lockUntil(raceId, ['cancelled', 'locking'])).toBe('locking');
      expect(await ledgerNetFor(late.playerId, raceId)).toBe(0);
      expect((await cancelledNotifications(late))[0]!.payload).toMatchObject({
        raceId,
        reason: 'not_ready',
        refundedAmount: ENTRY_FEE,
      });
      expect(await cancelledNotifications(a)).toHaveLength(0);
    });

    it('istemci bot iznini metinle kandıramaz: `aiFill: "false"` 400', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Metin Gönderen');
      const response = await request(app.getHttpServer())
        .post('/api/v1/races')
        .set('Authorization', player.authHeader)
        .send({
          name: 'Bozuk Kupa',
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
          aiFill: 'false',
        });
      expect(response.status).toBe(400);
    });
  });

  describe('saha boyutları', () => {
    it.each(LOBBY.fieldSizes)('%i atlık saha: 2 gerçek oyuncu + bot, kulvarlar tekil, sıralar 1..N', async (fieldSize) => {
      const a = await registerTestPlayerWithStarterHorse(app, `Saha${fieldSize} A`);
      const b = await registerTestPlayerWithStarterHorse(app, `Saha${fieldSize} B`);
      const raceId = await createRace(a, { fieldSize, maxPlayers: LOBBY.minPlayers });
      await joinReady(a, raceId);
      await joinReady(b, raceId);
      await makeRaceStarted(raceId);
      await lockUntil(raceId, ['locking']);

      const response = await settle(b, raceId);
      expect(response.status).toBe(200);
      const places = response.body.data.places as Array<{ finishPosition: number; participantType: string }>;
      expect(places).toHaveLength(fieldSize);
      expect(places.filter((place) => place.participantType === 'human')).toHaveLength(2);
      expect(places.map((place) => place.finishPosition).sort((x, y) => x - y)).toEqual(
        Array.from({ length: fieldSize }, (_, index) => index + 1),
      );

      const gates = await pool.query<{ gate_position: number }>(
        "SELECT gate_position FROM race_entries WHERE race_id = $1 AND status IS DISTINCT FROM 'cancelled'",
        [raceId],
      );
      const positions = gates.rows.map((row) => row.gate_position);
      expect(positions).toHaveLength(fieldSize);
      expect(new Set(positions).size).toBe(fieldSize);
      expect(Math.min(...positions)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...positions)).toBeLessThanOrEqual(fieldSize);
    });
  });

  describe('eşzamanlı kesinleşme', () => {
    it('aynı anda 5 kesinleştirme: biri koşar, diğerleri 409; ödül oyuncu başına EN FAZLA bir kez', async () => {
      const a = await registerTestPlayerWithStarterHorse(app, 'Yarışan A');
      const b = await registerTestPlayerWithStarterHorse(app, 'Yarışan B');
      const crank = await registerTestPlayerWithStarterHorse(app, 'Kesinleştiren');
      const raceId = await createRace(a, { aiFill: false });
      await joinReady(a, raceId);
      await joinReady(b, raceId);
      await makeRaceStarted(raceId);
      await lockUntil(raceId, ['locking']);

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, index) => settle(index % 2 === 0 ? crank : a, raceId)),
      );
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 409, 409, 409, 409]);
      expect(await statusOf(raceId)).toBe('finished');

      const prizes = await pool.query<{ player_id: string; count: string }>(
        `SELECT player_id, COUNT(*) AS count FROM economy_transactions
          WHERE reference_type = 'race' AND reference_id = $1 AND type = 'lobby_race_prize'
          GROUP BY player_id`,
        [raceId],
      );
      expect(prizes.rows.length).toBeGreaterThan(0);
      expect(prizes.rows.every((row) => Number(row.count) === 1)).toBe(true);
      const finished = await pool.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM notifications WHERE type = 'race_finished' AND payload->>'raceId' = $1",
        [raceId],
      );
      expect(Number(finished.rows[0]!.count)).toBe(2);
    });
  });

  it('yönetim iptali her katılımcıya `admin` sebepli bildirim yollar (iadeyle aynı transaction)', async () => {
    const admin = await registerTestPlayerWithStarterHorse(app, 'İptal Yöneticisi');
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);
    const a = await registerTestPlayerWithStarterHorse(app, 'Yönetim İadesi');
    const raceId = await createRace(a);
    await joinReady(a, raceId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/races/${raceId}/cancel`)
      .set('Authorization', admin.authHeader)
      .expect(200);
    expect((await cancelledNotifications(a))[0]!.payload).toEqual({
      raceId,
      raceName: 'Saha Kuralı Kupası',
      reason: 'admin',
      refundedAmount: ENTRY_FEE,
    });
  });
});
