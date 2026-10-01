import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * LOBİ YARIŞINDA OYUNCU KONTROLÜ (01.10.2026, migration 0054).
 *
 * Zaman: kilit `tickNow()` ile; canlı koşunun ilerlemesi `live_starts_at`
 * SQL ile geri çekilerek.
 *
 * **KANITLANAN:**
 *  1. `playerControl` ile açılan yarış lobide işaretli; kilitte
 *     `live_starts_at` yazılır ve yarış KESİNLEŞMEZ (koşu sürüyor).
 *  2. Kilit sonrası tohum zaman çizelgesi ucundan SIZMAZ.
 *  3. Her katılımcı yalnızca kendi atına komut verir; katılımcı olmayan 404;
 *     `current` canlı yarışı bulur.
 *  4. Erken kesinleşme 409 (crank da); yarış bitince kesinleşir, komutlar
 *     kayıtlı segmentlere işler, ödül dağıtılır; bitmiş yarışa komut 409.
 *  5. Komut vermeyen (kopan) oyuncunun atı yapay zekâyla koşar — kaydı eksiksiz.
 *  6. `playerControl` verilmeyen yarışın akışı DEĞİŞMEDİ (kilit → hemen kesinleşme).
 */
describe('Lobi yarışında oyuncu kontrolü (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: RaceLockScheduler;
  const racesUrl = '/api/v1/races';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(RaceLockScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function player(name: string): Promise<RegisteredTestPlayer> {
    const p = await registerTestPlayerWithStarterHorse(app, name);
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [p.playerId]);
    await pool.query(
      'UPDATE horses SET energy = 100, health = 100, fatigue = 0, morale = 80 WHERE id = $1',
      [p.horseId],
    );
    return p;
  }

  async function createRace(
    creator: RegisteredTestPlayer,
    playerControl?: boolean,
  ): Promise<string> {
    const response = await http()
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Kontrollü Kupa',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1600,
        tribuneFee: 0,
        spectatorCapacity: 500,
        ...(playerControl === undefined ? {} : { playerControl }),
      })
      .expect(201);
    return response.body.data.id as string;
  }

  async function joinReady(p: RegisteredTestPlayer, raceId: string): Promise<void> {
    await http()
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', p.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: p.horseId })
      .expect(200);
    await http()
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', p.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  async function lock(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 second' WHERE id = $1", [
      raceId,
    ]);
    await scheduler.tickNow();
  }

  async function statusOf(raceId: string): Promise<string> {
    return (
      await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId])
    ).rows[0].status;
  }

  async function liveAgo(raceId: string, seconds: number): Promise<void> {
    await pool.query(
      'UPDATE races SET live_starts_at = now() - make_interval(secs => $2) WHERE id = $1',
      [raceId, seconds],
    );
  }

  it('geçersiz playerControl 400; işaret lobi satırında görünür', async () => {
    const creator = await player('Kontrol Kurucu');
    const bad = await http()
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Bozuk',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1600,
        tribuneFee: 0,
        spectatorCapacity: 500,
        playerControl: 'evet',
      })
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('Oyuncu kontrolü');
    const created = await http()
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'İşaretli',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1600,
        tribuneFee: 0,
        spectatorCapacity: 500,
        playerControl: true,
      })
      .expect(201);
    expect(created.body.data.playerControl).toBe(true);
    const raceId = created.body.data.id as string;
    await pool.query("UPDATE races SET status = 'cancelled' WHERE id = $1", [raceId]);
  });

  it('kontrollü yarış: kilitte canlı başlar, erken kesinleşmez, komutlar işler, bitince ödül', async () => {
    const a = await player('Kontrol A');
    const b = await player('Kontrol B');
    const outsider = await player('Kontrol Yabancı');
    const raceId = await createRace(a, true);
    await joinReady(a, raceId);
    await joinReady(b, raceId);
    await lock(raceId);

    expect(await statusOf(raceId)).toBe('locking');
    const live = await pool.query<{ live_starts_at: Date | null }>(
      'SELECT live_starts_at FROM races WHERE id = $1',
      [raceId],
    );
    expect(live.rows[0].live_starts_at).not.toBeNull();

    // Tohum kilitli yarışta sızmaz.
    const timeline = await http()
      .get(`${racesUrl}/${raceId}/timeline`)
      .set('Authorization', a.authHeader)
      .expect(200);
    expect(timeline.body.data.simulationSeed).toBeNull();

    const current = await http()
      .get(`${racesUrl}/live/current`)
      .set('Authorization', a.authHeader)
      .expect(200);
    expect(current.body.data.raceId).toBe(raceId);
    expect(current.body.data.kind).toBe('lobby');
    expect(current.body.data.revealedSegments).toBe(0);
    await http()
      .get(`${racesUrl}/${raceId}/live`)
      .set('Authorization', outsider.authHeader)
      .expect(404);
    await http()
      .post(`${racesUrl}/${raceId}/live/commands`)
      .set('Authorization', outsider.authHeader)
      .send({ control: 'whip' })
      .expect(404);

    // A geri sayımda segment 0'a kırbaç verir; B hiç komut vermez (kopmuş gibi).
    const cmd = await http()
      .post(`${racesUrl}/${raceId}/live/commands`)
      .set('Authorization', a.authHeader)
      .send({ control: 'whip' })
      .expect(200);
    expect(cmd.body.data.myCommands['0']).toMatchObject({ whips: 1 });
    const bView = await http()
      .get(`${racesUrl}/${raceId}/live`)
      .set('Authorization', b.authHeader)
      .expect(200);
    expect(bView.body.data.myCommands).toEqual({});

    // Erken kesinleşme: oyuncu ucu ve crank 409; zamanlayıcı da kesinleştirmez.
    const early = await http()
      .post(`${racesUrl}/${raceId}/live/finish`)
      .set('Authorization', a.authHeader)
      .expect(409);
    expect(early.body.error.code).toBe('INTERACTIVE_RACE_NOT_FINISHED');
    await http()
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', b.authHeader)
      .expect(409);
    await scheduler.tickNow();
    expect(await statusOf(raceId)).toBe('locking');

    // Yarış ortası: komut gösterilmiş geçmişi değiştirmez.
    await liveAgo(raceId, 40);
    const mid = (
      await http().get(`${racesUrl}/${raceId}/live`).set('Authorization', b.authHeader).expect(200)
    ).body.data;
    expect(mid.revealedSegments).toBeGreaterThan(0);
    const after = (
      await http()
        .post(`${racesUrl}/${raceId}/live/commands`)
        .set('Authorization', b.authHeader)
        .send({ control: 'ease' })
        .expect(200)
    ).body.data;
    expect(after.segments.slice(0, mid.segments.length)).toEqual(mid.segments);
    expect(Number(Object.keys(after.myCommands)[0])).toBeGreaterThanOrEqual(mid.revealedSegments);

    // Bitti: zamanlayıcı kesinleştirir.
    await liveAgo(raceId, 3600);
    await scheduler.tickNow();
    expect(await statusOf(raceId)).toBe('finished');

    const done = (
      await http().get(`${racesUrl}/${raceId}/live`).set('Authorization', a.authHeader).expect(200)
    ).body.data;
    expect(done.status).toBe('finished');
    expect(done.outcome.finishPosition).toBeGreaterThanOrEqual(1);
    expect(typeof done.outcome.prizeWon).toBe('number');
    expect(done.outcome.entryFee).toBe(100);
    const closed = await http()
      .post(`${racesUrl}/${raceId}/live/commands`)
      .set('Authorization', a.authHeader)
      .send({ control: 'whip' })
      .expect(409);
    expect(closed.body.error.code).toBe('INTERACTIVE_RACE_CLOSED');
    // Geç kalan bir "bitir" çağrısı ikinci ödül yazmaz.
    const ledgerBefore = await pool.query(
      'SELECT COUNT(*)::int AS n FROM economy_transactions WHERE reference_id = $1',
      [raceId],
    );
    await http()
      .post(`${racesUrl}/${raceId}/live/finish`)
      .set('Authorization', b.authHeader)
      .expect(200);
    const ledgerAfter = await pool.query(
      'SELECT COUNT(*)::int AS n FROM economy_transactions WHERE reference_id = $1',
      [raceId],
    );
    expect(ledgerAfter.rows[0].n).toBe(ledgerBefore.rows[0].n);

    // A'nın kırbacı kayıtlı segment 0'da; B (komutsuz) da eksiksiz koştu.
    const decisions = await pool.query<{ horse_id: string; jockey_decision: string; n: number }>(
      `SELECT e.horse_id, MIN(s.jockey_decision) FILTER (WHERE s.timestamp_ms = first.t) AS jockey_decision, COUNT(*)::int AS n
       FROM race_entries e
       JOIN race_entry_segments s ON s.race_entry_id = e.id
       JOIN LATERAL (SELECT MIN(timestamp_ms) AS t FROM race_entry_segments WHERE race_entry_id = e.id) first ON true
       WHERE e.race_id = $1 AND e.horse_id IS NOT NULL
       GROUP BY e.horse_id`,
      [raceId],
    );
    const byHorse = new Map(decisions.rows.map((row) => [row.horse_id, row]));
    expect(byHorse.get(a.horseId)?.jockey_decision).toBe('push_for_finish');
    expect(byHorse.get(b.horseId)?.n).toBe(byHorse.get(a.horseId)?.n);
  });

  it('playerControl verilmeyen yarış eskisi gibi: kilit turunda hemen kesinleşir', async () => {
    const a = await player('Eski Usul');
    const raceId = await createRace(a);
    await joinReady(a, raceId);
    await lock(raceId);
    expect(await statusOf(raceId)).toBe('finished');
    await http().get(`${racesUrl}/${raceId}/live`).set('Authorization', a.authHeader).expect(404);
  });
});
