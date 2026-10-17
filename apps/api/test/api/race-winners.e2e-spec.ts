import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * KAZANANLAR TABLOSU (16.10.2026, brief §12). Kanıtlananlar:
 *  1. GERÇEK kesinleşmiş yarışın birincisi listede; ödül defterle aynı.
 *  2. Yalnızca gerçek oyuncunun kazandığı bitmiş lobi yarışları: bot birinci,
 *     pratik, iptal edilmiş/bitmemiş yarış GİRMEZ; aynı yarış iki kez görünmez.
 *  3. Sıra tamamlanma anına göre (eşitlikte yarış kimliği), imleçli sayfalar
 *     çakışmaz/atlamaz, tarih aralığı `[from, to)`; bozuk sorgu 400.
 * Fikstür yarışları ortak DB'de başka dosyalarla karışmasın diye 2001'e yazılır.
 */
describe('Kazananlar tablosu (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const lobby = loadRaceLobbyConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    // Önceki koşunun YALNIZCA bu dosyaya ait fikstürleri (kirli DB'de tekrar koşulabilsin).
    await pool.query(
      "DELETE FROM race_entries WHERE race_id IN (SELECT id FROM races WHERE name = 'Kazanan Fikstürü')",
    );
    await pool.query("DELETE FROM races WHERE name = 'Kazanan Fikstürü'");
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const winners = (query: Record<string, string>) => http().get('/api/v1/leaderboard/winners').query(query);

  /** 2001'de, verilen başlangıç + derece ile bitmiş bir lobi yarışı yazar. */
  async function fixtureRace(opts: {
    startTime: string;
    winner: RegisteredTestPlayer | 'bot';
    finalTimeMs?: number;
    status?: 'finished' | 'cancelled';
    lobbyEntry?: boolean;
    runnerUp?: RegisteredTestPlayer;
  }): Promise<string> {
    const raceId = randomUUID();
    await pool.query(
      `INSERT INTO races (id, name, distance_m, surface, weather, start_time, max_players, race_type, entry_fee,
                          participant_limit, status, engine_version, ruleset_version, config_version, weather_config_version)
       VALUES ($1, 'Kazanan Fikstürü', 1200, 'grass', 'sunny', $2, 8, 'free', 0, 8, $3,
               'test-engine', 'test-ruleset', 'test-config', 'test-weather-config')`,
      [raceId, opts.startTime, opts.status ?? 'finished'],
    );
    const entryStatus = opts.lobbyEntry === false ? null : 'ready';
    if (opts.winner === 'bot') {
      await pool.query(
        `INSERT INTO race_entries (race_id, bot_label, gate_position, finish_position, final_time_ms) VALUES ($1, 'bot-1', 1, 1, $2)`,
        [raceId, opts.finalTimeMs ?? 70_000],
      );
    } else {
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, player_id, gate_position, finish_position, final_time_ms, status)
         VALUES ($1, $2, $3, 1, 1, $4, $5)`,
        [raceId, opts.winner.horseId, opts.winner.playerId, opts.finalTimeMs ?? 70_000, entryStatus],
      );
    }
    if (opts.runnerUp) {
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, player_id, gate_position, finish_position, final_time_ms, status)
         VALUES ($1, $2, $3, 2, 2, $4, 'ready')`,
        [raceId, opts.runnerUp.horseId, opts.runnerUp.playerId, (opts.finalTimeMs ?? 70_000) + 500],
      );
    }
    return raceId;
  }

  it('gerçek kesinleşmiş yarışın birincisi listede; ödül defterle aynı', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Kazanan Aday A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Kazanan Aday B');
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', a.authHeader)
      .send({
        name: 'Kazananlar Kupası',
        fieldSize: lobby.fieldSizes[0],
        maxPlayers: lobby.minPlayers,
        entryFee: lobby.paidEntryFeeOptions[0],
        raceType: 'paid',
        aiFill: false,
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    const raceId = created.body.data.id as string;
    for (const player of [a, b]) {
      await http()
        .post(`/api/v1/races/${raceId}/join`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: player.horseId })
        .expect(200);
      await http().post(`/api/v1/races/${raceId}/ready`).set('Authorization', player.authHeader).send({ status: 'ready' }).expect(200);
    }
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', a.authHeader).send({}).expect(200);

    const winnerRow = (
      await pool.query<{ player_id: string }>(
        'SELECT player_id FROM race_entries WHERE race_id = $1 AND finish_position = 1',
        [raceId],
      )
    ).rows[0]!;
    const prize = Number(
      (
        await pool.query<{ total: string | null }>(
          "SELECT SUM(amount) AS total FROM economy_transactions WHERE player_id = $1 AND reference_id = $2 AND type = 'lobby_race_prize'",
          [winnerRow.player_id, raceId],
        )
      ).rows[0]!.total ?? 0,
    );
    const page = await winners({ limit: '50' }).expect(200);
    const row = page.body.data.rows.find((r: { raceId: string }) => r.raceId === raceId);
    expect(row).toMatchObject({ playerId: winnerRow.player_id, raceName: 'Kazananlar Kupası', prize, classLabel: 'Masasız' });
    expect(prize).toBeGreaterThan(0);
    expect(typeof row.finalTimeMs).toBe('number');
    expect(row.horseName).toEqual(expect.any(String));
  });

  it('yalnızca gerçek oyuncunun kazandığı bitmiş lobi yarışı; sıra, imleç, tarih aralığı; bozuk sorgu 400', async () => {
    const p = await registerTestPlayerWithStarterHorse(app, 'Fikstür Birincisi');
    const q = await registerTestPlayerWithStarterHorse(app, 'Fikstür İkincisi');
    // Aynı başlangıç + derece → eşzamanlı bitiş; sıra yarış kimliğine göre.
    const tieA = await fixtureRace({ startTime: '2001-01-10T10:00:00Z', winner: p, finalTimeMs: 60_000, runnerUp: q });
    const tieB = await fixtureRace({ startTime: '2001-01-10T10:00:00Z', winner: q, finalTimeMs: 60_000 });
    const earlier = await fixtureRace({ startTime: '2001-01-05T10:00:00Z', winner: p });
    const later = await fixtureRace({ startTime: '2001-01-20T10:00:00Z', winner: q });
    // Girmemesi gerekenler:
    await fixtureRace({ startTime: '2001-01-12T10:00:00Z', winner: 'bot' });
    await fixtureRace({ startTime: '2001-01-13T10:00:00Z', winner: p, lobbyEntry: false });
    await fixtureRace({ startTime: '2001-01-14T10:00:00Z', winner: p, status: 'cancelled' });
    // (Bitmemiş `scheduled` fikstür YAZILMAZ: 2001 başlangıçlı açık yarış diğer dosyaların
    // kilit zamanlayıcısı kuyruğunun başına oturur. Bitmemişlik `cancelled` ile sınanır.)

    const range = { from: '2001-01-01', to: '2001-02-01' };
    const all = (await winners({ ...range, limit: '50' }).expect(200)).body.data;
    const [tieFirst, tieSecond] = [tieA, tieB].sort().reverse();
    expect(all.rows.map((r: { raceId: string }) => r.raceId)).toEqual([later, tieFirst, tieSecond, earlier]);
    expect(all.nextCursor).toBeNull();

    // Sayfalar: 2 + 2, çakışma/atlama yok.
    const first = (await winners({ ...range, limit: '2' }).expect(200)).body.data;
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (await winners({ ...range, limit: '2', before: first.nextCursor }).expect(200)).body.data;
    expect([...first.rows, ...second.rows].map((r: { raceId: string }) => r.raceId)).toEqual(
      all.rows.map((r: { raceId: string }) => r.raceId),
    );
    expect(second.nextCursor).toBeNull();

    // Tarih aralığı [from, to).
    const january10 = (await winners({ from: '2001-01-10', to: '2001-01-11' }).expect(200)).body.data;
    expect(january10.rows.map((r: { raceId: string }) => r.raceId).sort()).toEqual([tieA, tieB].sort());

    for (const bad of [{ limit: '0' }, { from: 'dün' }, { before: 'bozuk' }, { from: '2001-02-01', to: '2001-01-01' }]) {
      const response = await winners(bad);
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
