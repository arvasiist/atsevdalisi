import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import { TournamentScheduler } from '../../src/infrastructure/scheduler/tournament.scheduler';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * TURNUVA (30.09.2026, `FINAL_PROJECT_AUDIT.md` #50, migration 0045).
 * Proje sahibinin kararı: sunucu her kademe için otomatik açar; turnuva TEK
 * BÜYÜK FİNALdir.
 *
 * **KANITLANAN:**
 *  1. Takvim her kademe için bir turnuva açar; ikinci tur yenisini AÇMAZ.
 *     Turnuva lobi listesinde kademesi ve seviye şartıyla görünür.
 *  2. Seviye şartı: yetersiz seviye 409 `PLAYER_LEVEL_TOO_LOW`, para oynamaz.
 *  3. Final BOTSUZ koşulur ve havuz ilk üçe config paylarıyla (50/30/20)
 *     TAM dağıtılır — lobinin `top5`/rake modeli uygulanmaz.
 *  4. `minParticipants`in altında hazır oyuncu varsa turnuva iptal olur ve
 *     kalanlar dahil herkes iade alır.
 *  5. Başlangıcı geçmiş boş turnuva iptal edilir ve kademeye yenisi açılır.
 */
describe('Turnuva (e2e) — otomatik takvim + tek final', () => {
  let app: INestApplication;
  let pool: Pool;
  let tournaments: TournamentScheduler;
  let races: RaceLockScheduler;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    tournaments = app.get(TournamentScheduler);
    races = app.get(RaceLockScheduler);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  // Turnuva kademe başına TEKTİR — önceki testlerin açık bıraktığı turnuva
  // bir sonrakinin "yeni açıldı" varsayımını bozar. Katılımsız olduklarından
  // iptal etmek para hareketi gerektirmez; katılımlı olanlar testin kendi
  // sonunda zaten bitmiş/iptal olur.
  beforeEach(async () => {
    await pool.query(
      `UPDATE races SET status = 'cancelled'
       WHERE status = 'scheduled' AND id IN (SELECT race_id FROM tournaments)`,
    );
  });

  async function openTournamentOf(tier: string): Promise<{ raceId: string; entryFee: number }> {
    const result = await pool.query<{ race_id: string; entry_fee: string }>(
      `SELECT t.race_id, r.entry_fee FROM tournaments t JOIN races r ON r.id = t.race_id
       WHERE t.tier = $1 AND r.status = 'scheduled'`,
      [tier],
    );
    expect(result.rows).toHaveLength(1);
    return { raceId: result.rows[0].race_id, entryFee: Number(result.rows[0].entry_fee) };
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

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0].money);
  }

  async function statusOf(raceId: string): Promise<string> {
    const result = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
    return result.rows[0].status;
  }

  async function startNow(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function tickRacesUntilDone(raceId: string): Promise<void> {
    for (let tick = 0; tick < 25; tick += 1) {
      await races.tickNow();
      const status = await statusOf(raceId);
      if (status === 'finished' || status === 'cancelled') {
        return;
      }
    }
    throw new Error(`Turnuva 25 turda sonuçlanmadı: ${raceId}`);
  }

  it('takvim her kademe için BİR turnuva açar; ikinci tur yenisini açmaz; lobide kademesiyle görünür', async () => {
    const first = await tournaments.tickNow();
    expect(first?.opened).toHaveLength(Object.keys(config.online.tournament.tiers).length);
    const second = await tournaments.tickNow();
    expect(second?.opened).toHaveLength(0);

    // Lobi listesi `start_time ASC` + en fazla 100 satırdır; birikmiş test
    // verisinde 6 saat sonra başlayan turnuvalar listenin dışında kalabilir.
    // Başlangıçlarını en öne alacak kadar yaklaştır (hâlâ gelecekte).
    await pool.query("UPDATE races SET start_time = now() + interval '61 seconds' WHERE id = ANY($1::uuid[])", [
      first?.opened ?? [],
    ]);
    const viewer = await registerTestPlayerWithStarterHorse(app, 'Turnuva Bakan');
    const lobby = await request(app.getHttpServer())
      .get('/api/v1/races')
      .query({ limit: '100' })
      .set('Authorization', viewer.authHeader)
      .expect(200);
    const listed = (lobby.body.data as Array<{ id: string; tournament: { tier: string; minPlayerLevel: number } | null }>)
      .filter((race) => first?.opened.includes(race.id));
    expect(listed).toHaveLength(first?.opened.length ?? -1);
    for (const race of listed) {
      const tier = config.online.tournament.tiers[race.tournament?.tier ?? ''];
      expect(race.tournament?.minPlayerLevel).toBe(tier?.minPlayerLevel);
    }
  });

  it('seviye şartı: yetersiz seviye 409 PLAYER_LEVEL_TOO_LOW, para oynamaz; yeterli seviye katılır', async () => {
    await tournaments.tickNow();
    const { raceId } = await openTournamentOf('silver');
    const player = await registerTestPlayerWithStarterHorse(app, 'Acemi Turnuvacı');
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    const before = await moneyOf(player.playerId);

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(409);
    expect(rejected.body.error.code).toBe('PLAYER_LEVEL_TOO_LOW');
    expect(await moneyOf(player.playerId)).toBe(before);

    await pool.query('UPDATE players SET level = $2 WHERE id = $1', [
      player.playerId,
      config.online.tournament.tiers.silver?.minPlayerLevel,
    ]);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  });

  it('final BOTSUZ koşulur ve havuz ilk üçe config paylarıyla TAM dağıtılır', async () => {
    await tournaments.tickNow();
    const { raceId, entryFee } = await openTournamentOf('bronze');
    const players = [
      await registerTestPlayerWithStarterHorse(app, 'Finalist 1'),
      await registerTestPlayerWithStarterHorse(app, 'Finalist 2'),
      await registerTestPlayerWithStarterHorse(app, 'Finalist 3'),
    ];
    for (const player of players) {
      await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
      await joinReady(player, raceId);
    }
    await startNow(raceId);
    await tickRacesUntilDone(raceId);

    expect(await statusOf(raceId)).toBe('finished');
    const bots = await pool.query('SELECT 1 FROM race_entries WHERE race_id = $1 AND bot_label IS NOT NULL', [raceId]);
    expect(bots.rows).toHaveLength(0);

    const pool3 = entryFee * players.length;
    const shares = config.online.tournament.prizeDistributionByPlacement;
    const placed = await pool.query<{ player_id: string; finish_position: number }>(
      'SELECT player_id, finish_position FROM race_entries WHERE race_id = $1 ORDER BY finish_position',
      [raceId],
    );
    expect(placed.rows.map((row) => row.finish_position)).toEqual([1, 2, 3]);
    let paid = 0;
    for (const row of placed.rows) {
      const prize = await pool.query<{ amount: string }>(
        `SELECT amount FROM economy_transactions
         WHERE player_id = $1 AND reference_id = $2 AND type = 'lobby_race_prize'`,
        [row.player_id, raceId],
      );
      const expected = Math.floor(pool3 * (shares[String(row.finish_position)] ?? 0));
      expect(prize.rows.map((r) => Number(r.amount))).toEqual([expected]);
      paid += expected;
    }
    // Rake yok: turnuva payları toplamı 1.0; yuvarlama artığı en fazla sıra sayısı kadar.
    expect(pool3 - paid).toBeLessThan(placed.rows.length);
  });

  it('minParticipants altında hazır oyuncu varsa turnuva İPTAL olur ve kalanlar dahil herkes iade alır', async () => {
    await tournaments.tickNow();
    const { raceId } = await openTournamentOf('bronze');
    const ready = await registerTestPlayerWithStarterHorse(app, 'Yalnız Finalist');
    const unready = await registerTestPlayerWithStarterHorse(app, 'Hazır Olmayan Finalist');
    for (const player of [ready, unready]) {
      await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    }
    await joinReady(ready, raceId);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', unready.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: unready.horseId })
      .expect(200);
    await startNow(raceId);
    await tickRacesUntilDone(raceId);

    expect(await statusOf(raceId)).toBe('cancelled');
    expect(await moneyOf(ready.playerId)).toBe(100000);
    expect(await moneyOf(unready.playerId)).toBe(100000);
    const racePool = await pool.query<{ prize_pool: string }>('SELECT prize_pool FROM races WHERE id = $1', [raceId]);
    expect(Number(racePool.rows[0].prize_pool)).toBe(0);
  });

  it('başlangıcı geçmiş BOŞ turnuva iptal edilir ve kademeye yenisi açılır', async () => {
    await tournaments.tickNow();
    const { raceId } = await openTournamentOf('gold');
    await startNow(raceId);

    const result = await tournaments.tickNow();

    expect(result?.cancelledEmpty).toBeGreaterThanOrEqual(1);
    expect(await statusOf(raceId)).toBe('cancelled');
    const reopened = await openTournamentOf('gold');
    expect(reopened.raceId).not.toBe(raceId);
  });
});
