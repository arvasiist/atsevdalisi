import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import { ScheduleRaceCalendarUseCase } from '../../src/application/use-cases/schedule-race-calendar.use-case';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * LOBİ LİSTESİ SIRASI (09.10.2026). Takvim aynı anda liste sınırından
 * (`lobbyListDefaultLimit`) FAZLA yarış açık tutar; liste salt başlangıç
 * saatine göre kesildiğinde oyuncunun açtığı ve KATILDIĞI geç yarış listeden
 * düşüyordu (katıldığı yarışı göremeyen oyuncu "hazır" diyemez).
 *
 * Kanıtlananlar (gerçek takvim turuyla, gerçek saatle):
 *   (1) Takvim yarışları sınırı aştığında bile çağıranın AÇTIĞI ve KATILDIĞI
 *       en geç yarışlar listededir ve listenin başındadır.
 *   (2) Katmanlar her izleyicide sıralıdır: kendi → öne çıkan → turnuva →
 *       kalan (başka oyuncuların yarışları ve takvim KARIŞIK, başlangıca göre).
 */
describe('Lobi listesi sırası (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;
  const openedHere: string[] = [];

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
    const opened = await app.get(ScheduleRaceCalendarUseCase).execute(new Date());
    openedHere.push(...opened.opened);
  });

  afterAll(async () => {
    if (openedHere.length > 0) {
      await pool.query(`UPDATE races SET status = 'cancelled' WHERE status = 'scheduled' AND id = ANY($1::uuid[])`, [
        openedHere,
      ]);
    }
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const list = async (viewer: RegisteredTestPlayer) =>
    (await http().get('/api/v1/races').set('Authorization', viewer.authHeader).expect(200)).body
      .data as RaceLobbyListItem[];

  async function createRace(creator: RegisteredTestPlayer, startInMs: number): Promise<string> {
    const response = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: `Geç Yarış ${randomUUID().slice(0, 6)}`,
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 0,
        raceType: 'free',
        startTime: new Date(Date.now() + startInMs).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    return response.body.data.id as string;
  }

  /** Sunucunun katman kuralının bağımsız yazımı — yanıttaki alanlardan. */
  function tierOf(row: RaceLobbyListItem, viewerId: string): number {
    if ((row.myEntry !== null && row.myEntry.status !== 'cancelled') || row.createdBy === viewerId) return 0;
    if (row.calendar?.featured === true) return 1;
    if (row.tournament !== null) return 2;
    return 3;
  }

  it('takvim sınırı aşsa da kendi açtığı ve katıldığı geç yarış listenin başındadır', async () => {
    const limit = config.raceLobby.lobbyListDefaultLimit;
    const player = await registerTestPlayerWithStarterHorse(app, 'Geç Yarışçı');
    const other = await registerTestPlayer(app, 'Başka Açan');
    // Takvim ufkunun ötesinde: salt başlangıç saatiyle sınırın dışında kalırdı.
    const horizonMs = (config.raceLobby.calendar.horizonHours + 1) * MS_PER_HOUR;
    const created = await createRace(player, horizonMs);
    const joinedId = await createRace(other, horizonMs + MS_PER_HOUR);
    await http()
      .post(`/api/v1/races/${joinedId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);

    // Önkoşul: ikisinden ÖNCE başlayan açık yarış liste sınırından fazla —
    // yalnızca başlangıç saatiyle kesilen liste ikisini de dışarıda bırakırdı.
    const earlier = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM races WHERE status = 'scheduled'
          AND start_time < (SELECT start_time FROM races WHERE id = $1)`,
      [created],
    );
    expect(Number(earlier.rows[0]!.n)).toBeGreaterThanOrEqual(limit);

    const rows = await list(player);
    expect(rows.length).toBe(limit);
    expect(rows.slice(0, 2).map((row) => row.id)).toEqual([created, joinedId]);
    expect(rows.slice(0, 2).every((row) => tierOf(row, player.playerId) === 0)).toBe(true);
    expect(rows[1]!.myEntry).toMatchObject({ horseId: player.horseId });
  });

  it('katmanlar her izleyicide sıralıdır; katman içinde başlangıç saatine göre', async () => {
    const creator = await registerTestPlayer(app, 'Yarış Açan');
    const created = await createRace(creator, (config.raceLobby.calendar.horizonHours + 2) * MS_PER_HOUR);
    const viewer = await registerTestPlayer(app, 'Lobiye Bakan');
    const rows = await list(viewer);
    const tiers = rows.map((row) => tierOf(row, viewer.playerId));
    for (let index = 1; index < rows.length; index += 1) {
      expect(tiers[index]).toBeGreaterThanOrEqual(tiers[index - 1]!);
      if (tiers[index] === tiers[index - 1]) {
        expect(Date.parse(rows[index]!.startTime)).toBeGreaterThanOrEqual(Date.parse(rows[index - 1]!.startTime));
      }
    }
    // Açanın kendi listesinde ise yarışı en baştadır.
    const ownerView = await list(creator);
    expect(ownerView[0]!.id).toBe(created);
  });
});
