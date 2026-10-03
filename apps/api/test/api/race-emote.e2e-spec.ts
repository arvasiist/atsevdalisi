import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceEmoteEvent } from '@at-sevdalisi/shared-types';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * TRİBÜN EMOTE'LARI (02.10.2026, Faz 9). Kanıtlananlar: geçerli emote odadaki
 * herkese ANONİM yayılır (yalnızca yarış + anahtar); listede olmayan anahtar,
 * abone olmayan soket ve soğuma içindeki ikinci emote YAYILMAZ.
 *
 * YOKLUK İDDİASI BARİYERLE: reddedilmesi gereken emote'tan SONRA tanık
 * soketten geçerli bir emote atılır; dinleyicinin aldığı İLK olay o geçerli
 * emote olmalıdır (aynı odaya, aynı sunucu sırasıyla yayılır). Bariyersiz
 * "bir süre bekle, gelmedi" testi "sunucu yapmadı" ile "henüz yapmadı"yı
 * ayıramazdı (CLAUDE.md kopma testi dersi).
 */
const WAIT_MS = 20_000;

describe('Tribün emote (e2e)', () => {
  const config = loadChatConfig();
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function connect(token: string): Promise<Socket> {
    const client = io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
    if (!client.connected) {
      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('bağlantı zaman aşımı')), WAIT_MS);
      });
    }
    return client;
  }

  async function subscribe(client: Socket, raceId: string): Promise<void> {
    const roster = new Promise<void>((resolve, reject) => {
      client.once('race.roster', () => resolve());
      client.once('race.error', (payload: { message: string }) => reject(new Error(payload.message)));
      setTimeout(() => reject(new Error('race.roster zaman aşımı')), WAIT_MS);
    });
    client.emit('race.subscribe', { raceId });
    await roster;
  }

  const nextEmote = (client: Socket) =>
    new Promise<RaceEmoteEvent>((resolve, reject) => {
      client.once('race.emote', (event: RaceEmoteEvent) => resolve(event));
      setTimeout(() => reject(new Error('race.emote zaman aşımı')), WAIT_MS);
    });

  it('geçerli emote anonim yayılır; geçersiz anahtar, abone olmayan ve soğumadaki emote yayılmaz', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Emote Sahibi');
    const viewer = await registerTestPlayerWithStarterHorse(app, 'Emote İzleyici');
    const race = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const raceId = race.body.data.raceId as string;
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/tickets`)
      .set('Authorization', viewer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const ownerSocket = await connect(owner.token);
    const viewerSocket = await connect(viewer.token);
    const strangerSocket = await connect(viewer.token);
    try {
      await subscribe(ownerSocket, raceId);
      await subscribe(viewerSocket, raceId);
      const [first, second] = config.emotes.list;

      // 1) Geçerli emote odadaki iki sokete de gelir; gönderen kimliği YOK.
      let received = nextEmote(viewerSocket);
      ownerSocket.emit('race.emote', { raceId, key: first!.key });
      expect(await received).toEqual({ raceId, key: first!.key });

      // 2) Listede olmayan anahtar + abone olmayan soket → yayılmaz (bariyer: viewer'ın geçerli emote'u).
      received = nextEmote(ownerSocket);
      viewerSocket.emit('race.emote', { raceId, key: 'uydurma' });
      strangerSocket.emit('race.emote', { raceId, key: first!.key });
      viewerSocket.emit('race.emote', { raceId, key: second!.key });
      expect(await received).toEqual({ raceId, key: second!.key });

      // 3) Soğuma: owner az önce attı (1) — ama aradan zaman geçmiş olabilir; iki ardışık emote at.
      await new Promise((resolve) => setTimeout(resolve, config.emotes.cooldownMs + 50));
      received = nextEmote(viewerSocket);
      ownerSocket.emit('race.emote', { raceId, key: first!.key });
      ownerSocket.emit('race.emote', { raceId, key: second!.key }); // soğumada → düşer
      expect(await received).toEqual({ raceId, key: first!.key });
      const afterCooldownBarrier = nextEmote(viewerSocket);
      await new Promise((resolve) => setTimeout(resolve, config.emotes.cooldownMs + 50));
      // viewer'ın kendi soğuması da dolmuş olmalı — bariyer olarak viewer üçüncü emote'u atar.
      const third = config.emotes.list[2]!;
      viewerSocket.emit('race.emote', { raceId, key: third.key });
      expect(await afterCooldownBarrier).toEqual({ raceId, key: third.key });
    } finally {
      ownerSocket.disconnect();
      viewerSocket.disconnect();
      strangerSocket.disconnect();
    }
  }, 60_000);
});
