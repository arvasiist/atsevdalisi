import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceChatMessageView, RaceEmoteEvent, RaceSpectatorCountPayload } from '@at-sevdalisi/shared-types';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * İKİ API ÖRNEĞİ + REDIS KÖPRÜSÜ (02.10.2026, Faz 13). Aynı Node sürecinde
 * iki ayrı Nest uygulaması, iki ayrı HTTP portu, ORTAK Redis + Postgres —
 * yatay ölçeğin taklidi. Kanıtlananlar:
 *  (1) 1. örneğe bağlı oyuncunun sohbet mesajı ve emote'u 2. örneğe bağlı
 *      oyuncuya ulaşır;
 *  (2) izleyici sayısı İKİ örnekteki soketleri sayar (her iki tarafta 2);
 *  (3) yarış oynatması örneğe YERELDİR: her izleyici `race.finished`ı TAM
 *      BİR KEZ alır (köprüden geçseydi iki kez gelirdi).
 * (3)'ün yokluk iddiası zaman pencerelidir: iki örneğin oynatması AYNI
 * zaman çizelgesiyle koşar, kopya varsa ilk bitişle birkaç ms içinde gelir;
 * bekleme süresi bunun çok üstünde tutulur.
 */
const WAIT_MS = 20_000;
const DUPLICATE_WINDOW_MS = 2_000;

describe('Çok örnekli gerçek zamanlı (e2e, Redis köprüsü)', () => {
  const chatConfig = loadChatConfig();
  let appA: INestApplication;
  let appB: INestApplication;
  let urlA: string;
  let urlB: string;

  beforeAll(async () => {
    appA = await bootstrapTestApp(undefined, { redisAdapter: true });
    appB = await bootstrapTestApp(undefined, { redisAdapter: true });
    await appA.listen(0);
    await appB.listen(0);
    urlA = `http://127.0.0.1:${(appA.getHttpServer().address() as AddressInfo).port}`;
    urlB = `http://127.0.0.1:${(appB.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await appA.close();
    await appB.close();
  });

  async function connect(baseUrl: string, token: string): Promise<Socket> {
    const client = io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
      setTimeout(() => reject(new Error('bağlantı zaman aşımı')), WAIT_MS);
    });
    return client;
  }

  const waitFor = <T>(client: Socket, event: string, predicate: (payload: T) => boolean = () => true) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} zaman aşımı`)), WAIT_MS);
      const handler = (payload: T) => {
        if (predicate(payload)) {
          clearTimeout(timer);
          client.off(event, handler);
          resolve(payload);
        }
      };
      client.on(event, handler);
    });

  it('sohbet + emote örnekler arası; izleyici sayısı küme geneli; oynatma kopyalanmaz', async () => {
    const owner = await registerTestPlayerWithStarterHorse(appA, 'Örnek A');
    const viewer = await registerTestPlayerWithStarterHorse(appA, 'Örnek B');
    const race = await request(appA.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const raceId = race.body.data.raceId as string;
    await request(appB.getHttpServer())
      .post(`/api/v1/races/${raceId}/tickets`)
      .set('Authorization', viewer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const a = await connect(urlA, owner.token);
    const b = await connect(urlB, viewer.token);
    const finishedCounts = { a: 0, b: 0 };
    a.on('race.finished', () => (finishedCounts.a += 1));
    b.on('race.finished', () => (finishedCounts.b += 1));
    try {
      const rosterA = waitFor(a, 'race.roster');
      a.emit('race.subscribe', { raceId });
      await rosterA;
      // B abone olunca A da (öbür örnekte) 2 izleyici görmeli.
      const twoOnA = waitFor<RaceSpectatorCountPayload>(a, 'race.spectators', (p) => p.count === 2);
      const twoOnB = waitFor<RaceSpectatorCountPayload>(b, 'race.spectators', (p) => p.count === 2);
      b.emit('race.subscribe', { raceId });
      await Promise.all([twoOnA, twoOnB]);

      const chat = waitFor<RaceChatMessageView>(b, 'chat.message.received', (m) => m.body === 'örnekler arası merhaba');
      a.emit('chat.message', { raceId, body: 'örnekler arası merhaba' });
      expect((await chat).username).toBe(owner.username);

      const key = chatConfig.emotes.list[0]!.key;
      const emote = waitFor<RaceEmoteEvent>(a, 'race.emote');
      b.emit('race.emote', { raceId, key });
      expect(await emote).toEqual({ raceId, key });

      await Promise.all([waitFor(a, 'race.finished'), waitFor(b, 'race.finished')]);
      await new Promise((resolve) => setTimeout(resolve, DUPLICATE_WINDOW_MS));
      expect(finishedCounts).toEqual({ a: 1, b: 1 });

      // B ayrılınca A'nın gördüğü sayı 1'e iner (kopma da küme geneli sayılır).
      const oneOnA = waitFor<RaceSpectatorCountPayload>(a, 'race.spectators', (p) => p.count === 1);
      b.disconnect();
      await oneOnA;
    } finally {
      a.disconnect();
      b.disconnect();
    }
  }, 90_000);
});
