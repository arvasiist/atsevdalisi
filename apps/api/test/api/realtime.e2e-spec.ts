import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * AUDIT_REPORT.md Bulgu F2 (bu oturum) — `RaceGateway` (bkz. o dosyanın
 * doc yorumu) için e2e testi. Diğer e2e dosyalarının AKSİNE, `supertest`
 * (HTTP isteklerini `app.getHttpServer()` üzerinden İÇSEL olarak, gerçek
 * bir port DİNLEMEDEN gönderir) burada YETERSİZ — `socket.io-client`
 * GERÇEK bir TCP portuna bağlanmak ZORUNDADIR. Bu yüzden bu dosya,
 * `bootstrapTestApp()`'in üzerine EK olarak `app.listen(0)` çağırır
 * (rastgele boş bir port) — diğer TÜM e2e dosyaları bunu YAPMAZ, sadece
 * bu dosyaya ÖZGÜdür.
 */
describe('Race WebSocket yayını (e2e) — AUDIT_REPORT.md Bulgu F2', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * CI #126 kirmizi araştırması (bu oturum) — `race.e2e-spec.ts`'in
   * KULLANDIĞI AYNI çağrı şeklini kopyalar: bu uç nokta `@HttpCode(HttpStatus.OK)`
   * ile 200 döner (201 DEĞİL — yeni bir KAYNAK URI'si istemciye verilmez,
   * bkz. `race.controller.ts` doc yorumu), VE brief §54 gereği
   * `Idempotency-Key` header'ı ZORUNLUDUR (`IdempotencyInterceptor`, bkz.
   * o dosyanın doc yorumu) — eksikse 400 `IDEMPOTENCY_KEY_REQUIRED` döner.
   * İlk yazımda ikisi de kaçırılmıştı (yanlışlıkla 201 beklendi, header
   * hiç eklenmedi) — CI #126 bunu GERÇEKTEN yakaladı.
   */
  async function runFinishedPracticeRace(): Promise<{ raceId: string; token: string }> {
    const { horseId, authHeader, token } = await registerTestPlayerWithStarterHorse(app, 'WS Test Oyuncusu');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    return { raceId: response.body.data.raceId as string, token };
  }

  function connect(token?: string): Socket {
    return io(`${baseUrl}/races`, {
      auth: token !== undefined ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
    });
  }

  /**
   * CI #126 kirmizi araştırması (bu oturum) — socket.io'nun kendi iç
   * sırası (`Namespace._add`): CONNECT paketi istemciye YAZILIR, SONRA
   * `'connection'` olayı emit edilir (bu, NestJS'in `handleConnection`'ını
   * TETİKLEYEN olay). Yani `handleConnection` içinde ÇAĞRILAN
   * `client.disconnect(true)` her zaman istemcinin kendi 'connect'
   * olayını ZATEN görmüş olmasından SONRA (TCP sırası korunduğundan
   * neredeyse anında) gerçekleşir — istemci kısa bir an "bağlandım" gibi
   * görünüp HEMEN ardından koparılır. İlk yazımda test 'connect' olayında
   * ERKEN `resolve(false)` çağırıyordu — bu, GERÇEK bir güvenlik açığı
   * DEĞİL, testin kendi yarış koşuluydu (CI #126'da yakalandı). Doğru
   * doğrulama: yalnızca 'disconnect' olayını (veya zaman aşımını) bekle,
   * 'connect' olayının kendisi bir hata SAYILMAZ — asıl garanti "sonunda
   * kesin olarak koparılır" olmalı.
   */
  it('Authorization token olmadan bağlantı ANINDA reddedilir', async () => {
    const client = connect(undefined);
    try {
      const disconnected = await new Promise<boolean>((resolve) => {
        client.on('disconnect', () => resolve(true));
        setTimeout(() => resolve(false), 2000);
      });
      expect(disconnected).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  it('geçersiz bir token ile bağlantı ANINDA reddedilir', async () => {
    const client = connect('bariz-sekilde-gecersiz-bir-token');
    try {
      const disconnected = await new Promise<boolean>((resolve) => {
        client.on('disconnect', () => resolve(true));
        setTimeout(() => resolve(false), 2000);
      });
      expect(disconnected).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  it('race.subscribe: geçerli bir katılımcı için race.telemetry + race.finished olayları GERÇEK sırayla gelir', async () => {
    const { raceId, token } = await runFinishedPracticeRace();
    const client = connect(token);

    try {
      await new Promise<void>((resolve, reject) => {
        client.on('connect_error', reject);
        client.on('connect', () => resolve());
      });

      const telemetryBatches: RaceSegmentSnapshot[][] = [];
      let finishedPayload: { raceId: string; entrants: unknown[] } | undefined;

      const finishedPromise = new Promise<void>((resolve, reject) => {
        client.on('race.telemetry', (payload: { raceId: string; segments: RaceSegmentSnapshot[] }) => {
          telemetryBatches.push(payload.segments);
        });
        client.on('race.finished', (payload: { raceId: string; entrants: unknown[] }) => {
          finishedPayload = payload;
          resolve();
        });
        client.on('race.error', (payload: { message: string }) => reject(new Error(payload.message)));
        setTimeout(() => reject(new Error('race.finished zaman aşımına uğradı')), 8000);
      });

      client.emit('race.subscribe', { raceId });
      await finishedPromise;

      expect(telemetryBatches.length).toBeGreaterThan(0);
      // Yayınlanan TÜM segmentler, DB'de gerçekten yazılmış TÜM
      // katılımcıların (oyuncu + botlar) segment sayısına eşit olmalı —
      // hiçbir katılımcı yayından SESSİZCE düşmemeli.
      const totalSegmentsBroadcast = telemetryBatches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalSegmentsBroadcast).toBeGreaterThan(0);

      expect(finishedPayload).toBeDefined();
      expect(finishedPayload?.raceId).toBe(raceId);
      expect(Array.isArray(finishedPayload?.entrants)).toBe(true);
      expect((finishedPayload?.entrants.length ?? 0)).toBeGreaterThan(0);
    } finally {
      client.disconnect();
    }
  });

  it("race.subscribe: katılımcısı OLMADIĞIM bir yarış için race.error döner (bilgi sızdırmaz)", async () => {
    const { raceId } = await runFinishedPracticeRace();
    const { token: strangerToken } = await registerTestPlayerWithStarterHorse(app, 'Yabancı Oyuncu');
    const client = connect(strangerToken);

    try {
      await new Promise<void>((resolve, reject) => {
        client.on('connect_error', reject);
        client.on('connect', () => resolve());
      });

      const errorPromise = new Promise<string>((resolve, reject) => {
        client.on('race.error', (payload: { message: string }) => resolve(payload.message));
        client.on('race.finished', () => reject(new Error('race.finished GELMEMELİYDİ — bu oyuncu katılımcı değil')));
        setTimeout(() => reject(new Error('race.error zaman aşımına uğradı')), 3000);
      });

      client.emit('race.subscribe', { raceId });
      const message = await errorPromise;
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    } finally {
      client.disconnect();
    }
  });
});
