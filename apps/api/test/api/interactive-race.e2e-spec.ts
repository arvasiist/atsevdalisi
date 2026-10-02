import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { InteractiveRaceScheduler } from '../../src/infrastructure/scheduler/interactive-race.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026, migration 0053).
 *
 * Zaman, oturumun `starts_at` sütunu SQL ile geri çekilerek ilerletilir
 * (sunucu saati gerçek; test "yarış şu kadar önce başladı" der).
 *
 * **KANITLANAN:**
 *  1. Başlatma: giriş ücreti hemen düşer (defter satırı, ref = yarış);
 *     geri sayımda hiç segment yok; gizli tohum yanıtta YOK.
 *  2. Tek süren oturum: ikinci başlatma 409, `current` oturumu döner.
 *  3. Süren yarıştaki at pazara çıkamaz (`HORSE_IN_ACTIVE_RACE`).
 *  4. Komut: ilk gösterilmemiş segmente yazılır; geçersiz düğme 400;
 *     başkasının yarışı 404.
 *  5. Yarış ortasında komut GÖSTERİLMİŞ segmentleri değiştirmez.
 *  6. Bitmeden kesinleşme 409; bitince sonuç + ödül + yarış kaydı; ikinci
 *     kesinleşme ikinci ödül YAZMAZ; bitmiş yarışa komut 409.
 *  7. Terk: zamanlayıcı kesinleştirir (ücretten kaçılamaz).
 *  8. Kırbaç komutu kayıtlı yarışın o segmentine `push_for_finish` olarak işler.
 */
describe('Oyuncu kontrollü pratik yarış (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: InteractiveRaceScheduler;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(InteractiveRaceScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function start(player: RegisteredTestPlayer) {
    return http()
      .post(`/api/v1/horses/${player.horseId}/interactive-race`)
      .set('Authorization', player.authHeader)
      .send({});
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
      playerId,
    ]);
    return Number(result.rows[0].money);
  }

  /** Yarışın `secondsAgo` saniye önce başlamış olmasını sağlar. */
  async function startedAgo(raceId: string, secondsAgo: number): Promise<void> {
    await pool.query(
      `UPDATE interactive_races SET starts_at = now() - make_interval(secs => $2) WHERE id = $1`,
      [raceId, secondsAgo],
    );
  }

  async function freshPlayer(name: string): Promise<RegisteredTestPlayer> {
    const player = await registerTestPlayerWithStarterHorse(app, name);
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    await pool.query(
      'UPDATE horses SET energy = 100, health = 100, fatigue = 0, morale = 80 WHERE id = $1',
      [player.horseId],
    );
    return player;
  }

  it('başlatma: ücret hemen düşer, geri sayımda segment yok, tohum yanıtta yok; tek süren oturum', async () => {
    const player = await freshPlayer('Kontrol Bir');
    const before = await moneyOf(player.playerId);
    const response = await start(player).expect(200);
    const view = response.body.data;
    expect(view.status).toBe('running');
    expect(view.revealedSegments).toBe(0);
    expect(view.segments).toEqual([]);
    expect(view.result).toBeNull();
    expect(view.nextCommandSegment).toBe(0);
    expect(view.entrants[0]).toMatchObject({ label: player.horseId, isPlayer: true });

    const row = await pool.query<{ entry_fee: string; simulation_seed: string }>(
      'SELECT entry_fee, simulation_seed FROM interactive_races WHERE id = $1',
      [view.raceId],
    );
    const fee = Number(row.rows[0].entry_fee);
    expect(fee).toBeGreaterThan(0);
    expect(before - (await moneyOf(player.playerId))).toBe(fee);
    expect(JSON.stringify(response.body)).not.toContain(row.rows[0].simulation_seed);
    const ledger = await pool.query<{ amount: string }>(
      `SELECT amount FROM economy_transactions WHERE player_id = $1 AND type = 'practice_race_entry_fee' AND reference_id = $2`,
      [player.playerId, view.raceId],
    );
    expect(ledger.rows.map((r) => Number(r.amount))).toEqual([-fee]);

    const second = await start(player).expect(409);
    expect(second.body.error.code).toBe('INTERACTIVE_RACE_IN_PROGRESS');
    const current = await http()
      .get('/api/v1/interactive-races/current')
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(current.body.data.raceId).toBe(view.raceId);

    const listing = await http()
      .post('/api/v1/market/listings')
      .set('Authorization', player.authHeader)
      .send({ horseId: player.horseId, price: 1000 })
      .expect(409);
    expect(listing.body.error.code).toBe('HORSE_IN_ACTIVE_RACE');

    // Temizlik: kesinleştir.
    await startedAgo(view.raceId, 3600);
    await http()
      .post(`/api/v1/interactive-races/${view.raceId}/finish`)
      .set('Authorization', player.authHeader)
      .expect(200);
  });

  it('komut: ilk gösterilmemiş segmente yazılır; geçersiz düğme 400; başkasının yarışı 404', async () => {
    const player = await freshPlayer('Kontrol İki');
    const other = await freshPlayer('Kontrol Yabancı');
    const raceId = (await start(player).expect(200)).body.data.raceId as string;
    const url = `/api/v1/interactive-races/${raceId}/commands`;

    const whip = await http()
      .post(url)
      .set('Authorization', player.authHeader)
      .send({ control: 'whip' })
      .expect(200);
    expect(whip.body.data.myCommands['0']).toMatchObject({ whips: 1, laneShift: 0, ease: false });
    await http()
      .post(url)
      .set('Authorization', player.authHeader)
      .send({ control: 'whip' })
      .expect(200);
    const left = await http()
      .post(url)
      .set('Authorization', player.authHeader)
      .send({ control: 'left' })
      .expect(200);
    expect(left.body.data.myCommands['0']).toMatchObject({ whips: 2, laneShift: -1 });

    const bad = await http()
      .post(url)
      .set('Authorization', player.authHeader)
      .send({ control: 'jump' })
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_PLAYER_CONTROL');
    const foreign = await http()
      .post(url)
      .set('Authorization', other.authHeader)
      .send({ control: 'whip' })
      .expect(404);
    expect(foreign.body.error.code).toBe('INTERACTIVE_RACE_NOT_FOUND');
    await http()
      .get(`/api/v1/interactive-races/${raceId}`)
      .set('Authorization', other.authHeader)
      .expect(404);

    await startedAgo(raceId, 3600);
    await http()
      .post(`/api/v1/interactive-races/${raceId}/finish`)
      .set('Authorization', player.authHeader)
      .expect(200);
    // Kayıtlı yarışta segment 0 kararı kırbacın kararıdır.
    const decision = await pool.query<{ jockey_decision: string }>(
      `SELECT s.jockey_decision FROM race_entry_segments s
       JOIN race_entries e ON e.id = s.race_entry_id
       WHERE e.race_id = $1 AND e.horse_id = $2
       ORDER BY s.timestamp_ms ASC LIMIT 1`,
      [raceId, player.horseId],
    );
    expect(decision.rows[0].jockey_decision).toBe('push_for_finish');
  });

  it('yarış ortasında komut gösterilmiş segmentleri DEĞİŞTİRMEZ', async () => {
    const player = await freshPlayer('Kontrol Üç');
    const raceId = (await start(player).expect(200)).body.data.raceId as string;
    await startedAgo(raceId, 40);
    const before = (
      await http()
        .get(`/api/v1/interactive-races/${raceId}`)
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;
    expect(before.revealedSegments).toBeGreaterThan(0);
    expect(before.revealedSegments).toBeLessThan(before.segmentCount);
    expect(before.nextCommandSegment).toBe(before.revealedSegments);

    const after = (
      await http()
        .post(`/api/v1/interactive-races/${raceId}/commands`)
        .set('Authorization', player.authHeader)
        .send({ control: 'whip' })
        .expect(200)
    ).body.data;
    // Komut, POST ANINDAKİ ilk gösterilmemiş segmente düşer. Yarış saati GET
    // ile POST arasında ilerleyebilir (CI'da yaşandı: 4 beklenip 5 geldi) —
    // bu yüzden iddia "GET'te görülen ilk boş segmentten önce DEĞİL ve
    // POST yanıtında gösterilenlerin ötesinde DEĞİL"dir.
    const commandSegments = Object.keys(after.myCommands).map(Number);
    expect(commandSegments).toHaveLength(1);
    expect(commandSegments[0]).toBeGreaterThanOrEqual(before.revealedSegments);
    expect(commandSegments[0]).toBeLessThanOrEqual(after.revealedSegments);
    const shown = before.segments.length;
    expect(after.segments.slice(0, shown)).toEqual(before.segments);

    const early = await http()
      .post(`/api/v1/interactive-races/${raceId}/finish`)
      .set('Authorization', player.authHeader)
      .expect(409);
    expect(early.body.error.code).toBe('INTERACTIVE_RACE_NOT_FINISHED');

    await startedAgo(raceId, 3600);
    await http()
      .post(`/api/v1/interactive-races/${raceId}/finish`)
      .set('Authorization', player.authHeader)
      .expect(200);
  });

  it('bitince: sonuç + ödül + yarış kaydı; ikinci kesinleşme ödülü tekrar yazmaz; bitmiş yarışa komut 409', async () => {
    const player = await freshPlayer('Kontrol Dört');
    const raceId = (await start(player).expect(200)).body.data.raceId as string;
    await startedAgo(raceId, 3600);
    const view = (
      await http()
        .get(`/api/v1/interactive-races/${raceId}`)
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;
    expect(view.canFinish).toBe(true);
    expect(view.revealedSegments).toBe(view.segmentCount);

    const afterStart = await moneyOf(player.playerId);
    const finished = (
      await http()
        .post(`/api/v1/interactive-races/${raceId}/finish`)
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;
    expect(finished.status).toBe('finished');
    const result = finished.result;
    expect(result.raceId).toBe(raceId);
    expect(typeof result.prizeWon).toBe('number');
    expect((await moneyOf(player.playerId)) - afterStart).toBe(result.prizeWon);
    expect(result.newBalance.money).toBe(await moneyOf(player.playerId));

    const race = await pool.query<{ status: string; entry_fee: string }>(
      'SELECT status, entry_fee FROM races WHERE id = $1',
      [raceId],
    );
    expect(race.rows[0].status).toBe('finished');
    expect(Number(race.rows[0].entry_fee)).toBe(result.entryFee);
    // Ücret YALNIZCA bir kez (başlangıçta) düşmüş olmalı.
    const fees = await pool.query(
      `SELECT 1 FROM economy_transactions WHERE reference_id = $1 AND type = 'practice_race_entry_fee'`,
      [raceId],
    );
    expect(fees.rows).toHaveLength(1);

    await http()
      .post(`/api/v1/interactive-races/${raceId}/finish`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(await moneyOf(player.playerId)).toBe(result.newBalance.money);
    const closed = await http()
      .post(`/api/v1/interactive-races/${raceId}/commands`)
      .set('Authorization', player.authHeader)
      .send({ control: 'whip' })
      .expect(409);
    expect(closed.body.error.code).toBe('INTERACTIVE_RACE_CLOSED');
  });

  it('terk edilen yarışı zamanlayıcı kesinleştirir', async () => {
    const player = await freshPlayer('Kontrol Kaçak');
    const raceId = (await start(player).expect(200)).body.data.raceId as string;
    await startedAgo(raceId, 3600);
    const finished = await scheduler.tickNow();
    expect(finished).toBeGreaterThanOrEqual(1);
    const row = await pool.query<{ status: string }>(
      'SELECT status FROM interactive_races WHERE id = $1',
      [raceId],
    );
    expect(row.rows[0].status).toBe('finished');
    const race = await pool.query('SELECT 1 FROM races WHERE id = $1', [raceId]);
    expect(race.rows).toHaveLength(1);
  });
});
