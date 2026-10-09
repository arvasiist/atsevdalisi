import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computePrizePayouts, resolvePrizeDistribution } from '../../src/domain/race/prize-distribution';
import { findRaceTable, loserRefundAmount } from '../../src/domain/race/table-rules';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * MASA KURALLARI (09.10.2026, migration 0079). Kanıtlananlar:
 *   (A) Katılırken kesilen masa (Mahalli): bedel katılımda düşer; ödül
 *       masanın dağılımıyla, kaybeden iadesi havuzdan ÖNCE ayrılarak ödenir;
 *       iade bandındaki sıraya (ödül alamayan) defterde
 *       `lobby_race_loser_refund`; bakiye = başlangıç + defter.
 *   (B) Start anında kesilen masa (Ulusal): katılımda para/defter YOK;
 *       bakiyesi yetmeyen katılamaz; start anında yetmeyen düşer (iptal,
 *       defter yok), yeten öder; yarış kalanla kesinleşir.
 */
describe('Masa kuralları (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function createTableRace(creator: RegisteredTestPlayer, tableId: string, maxPlayers: number): Promise<string> {
    const table = findRaceTable(config.economy, tableId)!;
    const response = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: `${table.label} Masası`,
        fieldSize: table.fieldSize,
        maxPlayers,
        entryFee: table.entryFee,
        raceType: 'paid',
        tableId,
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    expect(response.body.data.table).toMatchObject({ id: tableId, feeTiming: table.feeTiming });
    return response.body.data.id as string;
  }

  const join = (player: RegisteredTestPlayer, raceId: string) =>
    http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId });

  const ready = (player: RegisteredTestPlayer, raceId: string) =>
    http().post(`/api/v1/races/${raceId}/ready`).set('Authorization', player.authHeader).send({ status: 'ready' }).expect(200);

  const moneyOf = async (playerId: string) =>
    Number((await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId])).rows[0]!.money);

  const ledgerOf = async (playerId: string, raceId: string) =>
    (
      await pool.query<{ type: string; amount: string }>(
        `SELECT type, amount FROM economy_transactions
          WHERE player_id = $1 AND reference_type = 'race' AND reference_id = $2 ORDER BY created_at, id`,
        [playerId, raceId],
      )
    ).rows.map((row) => ({ type: row.type, amount: Number(row.amount) }));

  const startNow = (raceId: string) =>
    pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

  it('(A) katılırken kesilen masa: dağılım masanın, iade havuzdan önce, bakiye = başlangıç + defter', async () => {
    const table = findRaceTable(config.economy, 'local')!;
    expect(table.feeTiming).toBe('on_join');
    expect(table.loserRefund.percent).toBeGreaterThan(0);
    const shares = resolvePrizeDistribution(config.economy, table.distributionId)!.shares;

    // Saha tamamen gerçek oyunculardan (botsuz) → her sıra bir oyuncudur;
    // iade bandındaki sıra kesin olarak dolar.
    const players: RegisteredTestPlayer[] = [];
    for (let index = 0; index < table.fieldSize; index += 1) {
      players.push(await registerTestPlayerWithStarterHorse(app, `Masa A ${index}`));
    }
    const before = new Map<string, number>();
    for (const player of players) before.set(player.playerId, await moneyOf(player.playerId));

    const raceId = await createTableRace(players[0]!, 'local', table.fieldSize);
    for (const player of players) {
      await join(player, raceId).expect(200);
      await ready(player, raceId);
      expect(await ledgerOf(player.playerId, raceId)).toEqual([{ type: 'lobby_race_entry_fee', amount: -table.entryFee }]);
    }

    await startNow(raceId);
    const settled = await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', players[0]!.authHeader).expect(200);
    const places = settled.body.data.places as Array<{
      finishPosition: number;
      playerId: string | null;
      prizeAmount: number;
      loserRefundAmount: number;
    }>;
    expect(places.every((place) => place.playerId !== null)).toBe(true);

    const pool0 = table.entryFee * table.fieldSize;
    const refundEach = loserRefundAmount(table.entryFee, table.loserRefund);
    const refundedPositions = places
      .map((place) => place.finishPosition)
      .filter((position) => position > shares.length && position <= table.loserRefund.maxPosition);
    expect(refundedPositions.length).toBeGreaterThan(0);
    const payouts = computePrizePayouts(pool0 - refundEach * refundedPositions.length, shares);

    let paidOut = 0;
    for (const place of places) {
      const expectedPrize = payouts[place.finishPosition - 1] ?? 0;
      const expectedRefund = refundedPositions.includes(place.finishPosition) ? refundEach : 0;
      expect(place.prizeAmount).toBe(expectedPrize);
      expect(place.loserRefundAmount).toBe(expectedRefund);
      const ledger = await ledgerOf(place.playerId!, raceId);
      expect(ledger.filter((row) => row.type === 'lobby_race_prize').map((row) => row.amount)).toEqual(
        expectedPrize > 0 ? [expectedPrize] : [],
      );
      expect(ledger.filter((row) => row.type === 'lobby_race_loser_refund').map((row) => row.amount)).toEqual(
        expectedRefund > 0 ? [expectedRefund] : [],
      );
      // Mutabakat: bakiye = önce + bu yarışın defter toplamı.
      const net = ledger.reduce((sum, row) => sum + row.amount, 0);
      expect(await moneyOf(place.playerId!)).toBe(before.get(place.playerId!)! + net);
      paidOut += expectedPrize + expectedRefund;
    }
    // Oyun para basmaz: dağıtılan ≤ toplanan.
    expect(paidOut).toBeLessThanOrEqual(pool0);
  });

  it('(B) start anında kesilen masa: katılımda para yok, yetmeyen düşer, yeten öder', async () => {
    const table = findRaceTable(config.economy, 'national')!;
    expect(table.feeTiming).toBe('on_start');
    const payer = await registerTestPlayerWithStarterHorse(app, 'Masa B Öder');
    const broke = await registerTestPlayerWithStarterHorse(app, 'Masa B Batan');
    const poor = await registerTestPlayerWithStarterHorse(app, 'Masa B Fakir');
    await pool.query('UPDATE players SET money = $2 WHERE id = $1', [poor.playerId, table.entryFee - 1]);

    const raceId = await createTableRace(payer, 'national', 8);
    const payerBefore = await moneyOf(payer.playerId);

    // Bakiyesi yetmeyen katılamaz (para düşmeden denetlenir).
    const rejected = await join(poor, raceId).expect(409);
    expect(rejected.body.error.code).toBe('INSUFFICIENT_FUNDS');

    let row: { prizePool: number; topPrize: number | null; table: { feeTiming: string } } | null = null;
    for (const player of [payer, broke]) {
      row = (await join(player, raceId).expect(200)).body.data;
      await ready(player, raceId);
      expect(await ledgerOf(player.playerId, raceId)).toEqual([]);
    }
    expect(await moneyOf(payer.playerId)).toBe(payerBefore);
    // Havuz start'a kadar 0; gösterilen ödül katılanların ödeyeceği bedelden tahmin.
    if (row === null) throw new Error('katılım görünümü yok');
    expect(row.prizePool).toBe(0);
    expect(row.table.feeTiming).toBe('on_start');
    expect(row.topPrize).toBeGreaterThan(0);

    // Start öncesi parasını kaybeden oyuncu start anında düşer.
    await pool.query('UPDATE players SET money = 0 WHERE id = $1', [broke.playerId]);
    await startNow(raceId);
    const settled = await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', payer.authHeader).expect(200);

    expect(await ledgerOf(broke.playerId, raceId)).toEqual([]);
    expect(await moneyOf(broke.playerId)).toBe(0);
    const brokeEntry = await pool.query<{ status: string }>(
      'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2',
      [raceId, broke.playerId],
    );
    expect(brokeEntry.rows[0]!.status).toBe('cancelled');

    const payerLedger = await ledgerOf(payer.playerId, raceId);
    expect(payerLedger[0]).toEqual({ type: 'lobby_race_entry_fee', amount: -table.entryFee });
    expect(await moneyOf(payer.playerId)).toBe(payerBefore + payerLedger.reduce((sum, item) => sum + item.amount, 0));
    const humanPlaces = (settled.body.data.places as Array<{ playerId: string | null }>).filter((place) => place.playerId !== null);
    expect(humanPlaces.map((place) => place.playerId)).toEqual([payer.playerId]);
    const paidOut = payerLedger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    expect(paidOut).toBeLessThanOrEqual(table.entryFee);
  });

  it('(C) pratik yarış: masanın iadesi sıraya göre; sonuç alanı = defter, bakiye = başlangıç + defter', async () => {
    const table = findRaceTable(config.economy, 'regional')!;
    const shares = resolvePrizeDistribution(config.economy, table.distributionId)!.shares;
    const player = await registerTestPlayerWithStarterHorse(app, 'Masa C Pratik');
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    for (let run = 0; run < 6; run += 1) {
      await pool.query(
        "UPDATE horses SET health = 100, energy = 100, fatigue = 0, morale = 80, status = 'active' WHERE id = $1",
        [player.horseId],
      );
      const before = await moneyOf(player.playerId);
      const response = await http()
        .post(`/api/v1/horses/${player.horseId}/practice-race`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ tierId: table.id })
        .expect(200);
      const result = response.body.data as { raceId: string; loserRefund: number; prizeWon: number; finalResult: Array<{ horseId: string; finishPosition: number }> };
      const position = result.finalResult.find((row) => row.horseId === player.horseId)!.finishPosition;
      const inBand = position > shares.length && position <= table.loserRefund.maxPosition;
      expect(result.loserRefund).toBe(inBand ? loserRefundAmount(table.entryFee, table.loserRefund) : 0);
      const ledger = await ledgerOf(player.playerId, result.raceId);
      expect(ledger.filter((row) => row.type === 'practice_race_loser_refund').map((row) => row.amount)).toEqual(
        result.loserRefund > 0 ? [result.loserRefund] : [],
      );
      expect(await moneyOf(player.playerId)).toBe(before + ledger.reduce((sum, row) => sum + row.amount, 0));
    }
  });
});
