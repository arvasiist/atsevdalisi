import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import { RaceGateway } from '../../src/api/realtime/race.gateway';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * BEKLEYEN TRİBÜN (01.10.2026). Bitmemiş bir yarışa abone olmak eskiden BOŞ
 * bir oynatma oturumu kuruyordu: 4 sn sonra sırasız `race.finished`, oturum
 * 60 sn önbellekte — kesinleşmeden sonra gelen izleyici bile yarışı
 * göremiyordu. Kontrollü yarışta bu pencere dakikalar sürer.
 *
 * **KANITLANAN:**
 *  1. Kilitli (canlı koşan) yarışa abone olan izleyici `race.waiting` alır ve
 *     oynatma süresi geçse de `race.finished` ALMAZ.
 *  2. Yarış kesinleşince bekleyen odaya gerçek oynatma başlar: segmentler ve
 *     sıralı `race.finished` gelir.
 *  3. Beklenen yarış iptal edilirse oda `race.cancelled` alır — bu senaryoda
 *     tur ELLE değil, config aralığıyla kurulan zamanlayıcıyla gelir.
 *
 * Yoklama aralığını beklememek için tur `RaceGateway.checkWaitingRace` ile
 * doğrudan sürülür (zamanlayıcının kendisi aynı fonksiyonu çağırır).
 */
describe('Bekleyen tribün (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let gateway: RaceGateway;
  let scheduler: RaceLockScheduler;
  let baseUrl: string;
  const racesUrl = '/api/v1/races';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    pool = app.get<Pool>(PG_POOL);
    gateway = app.get(RaceGateway);
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

  async function createControlledRace(p: RegisteredTestPlayer): Promise<string> {
    const created = await http()
      .post(racesUrl)
      .set('Authorization', p.authHeader)
      .send({
        name: 'Tribün Bekleme',
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
        playerControl: true,
      })
      .expect(201);
    const raceId = created.body.data.id as string;
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
    return raceId;
  }

  interface Recorder {
    socket: Socket;
    events: string[];
    segments: RaceSegmentSnapshot[];
    finished: { entrants: { finishPosition: number | null }[] } | null;
  }

  async function subscribe(token: string, raceId: string, until: string): Promise<Recorder> {
    const socket = io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
    const recorder: Recorder = { socket, events: [], segments: [], finished: null };
    socket.onAny((event: string) => recorder.events.push(event));
    socket.on('race.telemetry', (payload: { segments: RaceSegmentSnapshot[] }) => {
      recorder.segments.push(...payload.segments);
    });
    socket.on('race.finished', (payload: Recorder['finished']) => {
      recorder.finished = payload;
    });
    await new Promise<void>((resolve, reject) => {
      socket.on(until, () => resolve());
      socket.on('race.error', (error: { message: string }) => reject(new Error(error.message)));
      socket.on('connect', () => socket.emit('race.subscribe', { raceId }));
      setTimeout(() => reject(new Error(`${until} gelmedi`)), 8000);
    });
    return recorder;
  }

  function waitFor(socket: Socket, event: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once(event, () => resolve());
      setTimeout(() => reject(new Error(`${event} gelmedi`)), 8000);
    });
  }

  it('canlı yarışta boş oturum kurulmaz; kesinleşince oynatma odaya başlar', async () => {
    const owner = await player('Tribün Sahibi');
    const raceId = await createControlledRace(owner);
    await pool.query("UPDATE races SET start_time = now() - interval '1 second' WHERE id = $1", [
      raceId,
    ]);
    await scheduler.tickNow();

    const viewer = await subscribe(owner.token, raceId, 'race.waiting');
    expect(viewer.events).toContain('race.roster');
    // Eski davranış 4 sn'de sırasız `race.finished` yayınlıyordu.
    await new Promise((resolve) => setTimeout(resolve, 4500));
    expect(viewer.finished).toBeNull();
    expect(viewer.segments).toHaveLength(0);
    await gateway.checkWaitingRace(raceId);
    expect(viewer.finished).toBeNull();

    await pool.query(
      "UPDATE races SET live_starts_at = now() - interval '1 hour' WHERE id = $1",
      [raceId],
    );
    await http()
      .post(`${racesUrl}/${raceId}/live/finish`)
      .set('Authorization', owner.authHeader)
      .expect(200);
    const finished = waitFor(viewer.socket, 'race.finished');
    await gateway.checkWaitingRace(raceId);
    await finished;

    expect(viewer.segments.length).toBeGreaterThan(0);
    expect(viewer.finished?.entrants).toHaveLength(8);
    expect(viewer.finished?.entrants.every((entrant) => entrant.finishPosition !== null)).toBe(true);
    viewer.socket.disconnect();
  }, 30_000);

  it('beklenen yarış iptal edilirse oda race.cancelled alır', async () => {
    const owner = await player('Tribün İptal');
    const raceId = await createControlledRace(owner);
    const viewer = await subscribe(owner.token, raceId, 'race.waiting');

    await pool.query("UPDATE races SET status = 'cancelled' WHERE id = $1", [raceId]);
    // Burada tur ELLE sürülmez: `spectatorWaitPollSeconds` ile kurulan gerçek
    // zamanlayıcının iptali yakaladığı kanıtlanır.
    await waitFor(viewer.socket, 'race.cancelled');
    expect(viewer.finished).toBeNull();
    viewer.socket.disconnect();
  }, 20_000);
});
