import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceChatHistoryPayload, RaceChatMessageView, RaceSpectatorCountPayload } from '@at-sevdalisi/shared-types';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * Yarış sohbeti + canlı izleyici sayısı (e2e) — brief §13, §27, §32.
 *
 * `realtime.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt: bu dosya
 * da `socket.io-client` GERÇEK bir TCP portuna bağlanmak ZORUNDA olduğu
 * için `app.listen(0)` çağırır (diğer e2e dosyaları bunu YAPMAZ).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEYLER:**
 *   1. `race.spectators` sayısı GERÇEKTEN odadaki açık soketleri sayar
 *      (abone olunca artar, bağlantı kopunca azalır) — brief §27.
 *   2. `chat.message` ile gönderilen mesaj hem odadaki HERKESE yayınlanır
 *      hem de veritabanına YAZILIR; yayınlanan gövde, istemcinin
 *      gönderdiği HAM gövde DEĞİL, sunucunun normalize edip yazdığı
 *      satırdır (CLAUDE.md "SUNUCU OTORİTESİ").
 *   3. Abone OLMAYAN bir soket sohbet edemez — yeni bir yetki mekanizması
 *      icat edilmediği, mevcut `race.subscribe` kapısının (katılımcı VEYA
 *      tribün bileti sahibi) sohbete de kapı olduğu.
 *   4. Hız sınırı (brief §32) GERÇEKTEN devrededir: `config/chat.config.json
 *      → rateLimit` sınırı aşıldığında mesaj YAZILMAZ, `chat.error` döner.
 */
/**
 * Bekleme süreleri BİLEREK cömerttir. Bu makinede soket el sıkışması
 * (JWT doğrulama + DB okuması + WebSocket yükseltmesi) yüklü bir koşuda
 * 5 saniyeyi aşabiliyor — `CLAUDE.md`'nin "bu makine yavaş" notuyla AYNI
 * sınıf: iki e2e testi yerelde 5sn varsayılanını aşıyor ama CI'da geçiyor.
 * Bu bir ürün hatası DEĞİLDİR; sabitleri kısmak testi yalnızca yerelde
 * kararsız yapar.
 */
const WAIT_MS = 20_000;
const TEST_TIMEOUT_MS = 30_000;
const RATE_TEST_TIMEOUT_MS = 60_000;

describe('Yarış sohbeti + canlı izleyici sayısı (e2e) — brief §13/§27/§32', () => {
  const config = loadChatConfig();
  let app: INestApplication;
  let pool: Pool;
  let baseUrl: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Bir oyuncunun atıyla bitmiş bir yarış üretir (sunucuda ANINDA tamamlanır — bkz. `realtime.e2e-spec.ts` AYNI yardımcı). */
  async function runFinishedRace(horseId: string, authHeader: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    return response.body.data.raceId as string;
  }

  /**
   * Tribün bileti alır (`grandstand.e2e-spec.ts` ile AYNI çağrı deseni:
   * `@HttpCode(HttpStatus.OK)` → 200, VE brief §54 gereği
   * `Idempotency-Key` ZORUNLU).
   *
   * Bu, testteki "izleyici" rolünü üretmenin GERÇEK yoludur: bir yarışa
   * abone olabilmek için ya katılımcı ya bilet sahibi olmak gerekir
   * (`GetRaceTimelineUseCase`). Oyuncunun KENDİ yarışına bilet alamadığı
   * (`assertRaceWatchable` OWN_RACE kuralı) için izleyici AYRI bir oyuncu
   * olmak zorundadır — bu da brief §9'un "SPECTATE" kavramının ta kendisi.
   */
  async function buyTicket(raceId: string, authHeader: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/tickets`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
  }

  function connect(token: string): Socket {
    return io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
  }

  /**
   * Soketin bağlanmasını bekler.
   *
   * **`client.connected` KONTROLÜ BİR SÜS DEĞİL, GERÇEK BİR YARIŞ KOŞULUNUN
   * ÇÖZÜMÜDÜR.** `io()` çağrısı soketi HEMEN bağlamaya başlar; bu fonksiyon
   * ise çağrıldığı anda dinleyici kurar. Araya bir `await` girdiğinde
   * (örneğin başka bir soketin bağlanması beklenirken) soket ÇOKTAN
   * bağlanmış olabilir — o anda kurulan `connect` dinleyicisi, bir daha
   * ATEŞLENMEYECEK bir olayı sonsuza dek bekler ve test 20 saniye sonra
   * "Soket bağlantısı zaman aşımına uğradı" diye düşer (yaşandı: bu dosyanın
   * `chat.history` testi; soket bağlanmıyor DEĞİLDİ, çoktan bağlanmıştı).
   * Aynı sınıf hata `chat.history` dinleyicisinin `race.subscribe`'dan SONRA
   * kurulmasıyla da bir kez yaşanmıştı — kural aynı: **olay, dinleyiciden
   * önce ateşlenebilir; önce durumu SOR, sonra bekle.**
   */
  async function awaitConnect(client: Socket): Promise<void> {
    if (client.connected) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      client.on('connect_error', reject);
      client.on('connect', () => resolve());
      setTimeout(() => reject(new Error('Soket bağlantısı zaman aşımına uğradı')), WAIT_MS);
    });
  }

  /** `race.subscribe` çağırır ve aboneliğin GERÇEKTEN kurulduğunu `race.roster` ile doğrular. */
  async function subscribe(client: Socket, raceId: string): Promise<void> {
    const rosterPromise = new Promise<void>((resolve, reject) => {
      client.on('race.roster', () => resolve());
      client.on('race.error', (payload: { message: string }) => reject(new Error(payload.message)));
      setTimeout(() => reject(new Error('race.roster zaman aşımına uğradı')), WAIT_MS);
    });
    client.emit('race.subscribe', { raceId });
    await rosterPromise;
  }

  /** Belirli bir sayıyı taşıyan `race.spectators` olayını bekler. */
  function waitForSpectatorCount(client: Socket, expected: number, timeoutMs = WAIT_MS): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`race.spectators=${expected} zaman aşımına uğradı`)),
        timeoutMs,
      );
      client.on('race.spectators', (payload: RaceSpectatorCountPayload) => {
        if (payload.count === expected) {
          clearTimeout(timer);
          resolve(payload.count);
        }
      });
    });
  }

  /** Bir yarışın sohbet satırlarını doğrudan veritabanından okur (sunucu otoritesi kanıtı). */
  async function storedBodies(raceId: string): Promise<string[]> {
    const result = await pool.query<{ body: string }>(
      'SELECT body FROM race_messages WHERE race_id = $1 ORDER BY created_at ASC',
      [raceId],
    );
    return result.rows.map((row) => row.body);
  }

  it('race.spectators: abone olunca ARTAR, bağlantı kopunca AZALIR (brief §27)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'İzleyici Sayısı Sahibi');
    const viewer = await registerTestPlayerWithStarterHorse(app, 'İzleyici Sayısı Seyircisi');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);
    await buyTicket(raceId, viewer.authHeader);

    const ownerClient = connect(owner.token);
    let viewerClient: Socket | undefined;
    try {
      await awaitConnect(ownerClient);

      // Katılımcı abone olur → odada TEK soket var.
      const firstCount = waitForSpectatorCount(ownerClient, 1);
      await subscribe(ownerClient, raceId);
      expect(await firstCount).toBe(1);

      // Tribün bileti sahibi abone olur → HER İKİ istemci de 2 görür
      // (yayın ODAYA yapılır, tek bir istemciye değil).
      const lateClient = connect(viewer.token);
      viewerClient = lateClient;
      await awaitConnect(lateClient);

      const ownerSeesTwo = waitForSpectatorCount(ownerClient, 2);
      const viewerSeesTwo = waitForSpectatorCount(lateClient, 2);
      await subscribe(lateClient, raceId);
      expect(await ownerSeesTwo).toBe(2);
      expect(await viewerSeesTwo).toBe(2);

      // İzleyici kopar → kalan istemci 1'e düştüğünü GÖRÜR. Bu iddia
      // olmadan, sayaç yalnızca "artıyor" gibi görünür ve azalmayan bir
      // sayaç (gerçek bir hata sınıfı) testten KAÇARDI.
      const backToOne = waitForSpectatorCount(ownerClient, 1);
      lateClient.disconnect();
      expect(await backToOne).toBe(1);
    } finally {
      ownerClient.disconnect();
      viewerClient?.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  it('chat.message: mesaj odadaki HERKESE yayınlanır ve yayınlanan gövde SUNUCUNUN YAZDIĞI satırdır', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Sohbet Sahibi');
    const viewer = await registerTestPlayerWithStarterHorse(app, 'Sohbet Seyircisi');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);
    await buyTicket(raceId, viewer.authHeader);

    const ownerClient = connect(owner.token);
    const viewerClient = connect(viewer.token);
    try {
      await awaitConnect(ownerClient);
      await awaitConnect(viewerClient);
      await subscribe(ownerClient, raceId);
      await subscribe(viewerClient, raceId);

      const ownerReceives = new Promise<RaceChatMessageView>((resolve, reject) => {
        ownerClient.on('chat.message.received', (payload: RaceChatMessageView) => resolve(payload));
        ownerClient.on('chat.error', (payload: { message: string }) => reject(new Error(payload.message)));
        setTimeout(() => reject(new Error('chat.message.received (gönderen) zaman aşımına uğradı')), WAIT_MS);
      });
      const viewerReceives = new Promise<RaceChatMessageView>((resolve, reject) => {
        viewerClient.on('chat.message.received', (payload: RaceChatMessageView) => resolve(payload));
        viewerClient.on('chat.error', (payload: { message: string }) => reject(new Error(payload.message)));
        setTimeout(() => reject(new Error('chat.message.received (izleyici) zaman aşımına uğradı')), WAIT_MS);
      });

      // Gövde BİLEREK baş/son boşluklu gönderilir: sunucunun normalize
      // ettiğinin (kırptığının) kanıtı, dönen gövdede boşluk OLMAMASIDIR.
      ownerClient.emit('chat.message', { raceId, body: '  merhaba tribün  ' });

      const [forOwner, forViewer] = await Promise.all([ownerReceives, viewerReceives]);

      // İKİ istemci de AYNI satırı görür (sunucu otoritesi: istemcinin
      // ham gövdesi değil, yazılan satır yayınlanır).
      expect(forOwner.messageId).toBe(forViewer.messageId);
      expect(forOwner.body).toBe('merhaba tribün');
      expect(forViewer.body).toBe('merhaba tribün');
      expect(forOwner.raceId).toBe(raceId);
      // Gönderen SUNUCUNUN çözdüğü oyuncudur — istemci gövdesinde
      // `playerId` göndermeye çalışsa bile yok sayılır.
      expect(forOwner.playerId).toBe(owner.playerId);
      expect(typeof forOwner.username).toBe('string');
      expect(forOwner.username.length).toBeGreaterThan(0);
      expect(new Date(forOwner.createdAt).toString()).not.toBe('Invalid Date');

      // Ve GERÇEKTEN yazılmıştır.
      expect(await storedBodies(raceId)).toEqual(['merhaba tribün']);
    } finally {
      ownerClient.disconnect();
      viewerClient.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  it('chat.history: SONRADAN abone olan istemci geçmişi KRONOLOJİK sırada alır; gönderen istemci almaz', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Sahibi');
    const early = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Erken');
    const late = await registerTestPlayerWithStarterHorse(app, 'Geçmiş Geç');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);
    await buyTicket(raceId, early.authHeader);
    await buyTicket(raceId, late.authHeader);

    const earlyClient = connect(early.token);
    const lateClient = connect(late.token);
    try {
      await awaitConnect(earlyClient);

      // DİKKAT — dinleyici `subscribe`'dan ÖNCE kurulmalıdır: `chat.history`
      // abonelik ANINDA (tek seferlik) gönderilir, sonradan kurulan bir
      // dinleyici onu asla görmez (bkz. `joinSharedPlayback`).
      const firstHistory = new Promise<RaceChatHistoryPayload>((resolve, reject) => {
        earlyClient.on('chat.history', (payload: RaceChatHistoryPayload) => resolve(payload));
        setTimeout(() => reject(new Error('chat.history (ilk abone) zaman aşımına uğradı')), WAIT_MS);
      });
      await subscribe(earlyClient, raceId);

      // İlk abone olan istemci, abone olmadan ÖNCE hiç mesaj yoktu —
      // `chat.history` yine de GELİR (boş liste), çünkü istemcinin
      // "geçmişi sordum ve boştu" ile "geçmiş hiç gelmedi" arasındaki
      // farkı ayırt edebilmesi gerekir.
      expect((await firstHistory).messages).toEqual([]);

      // İki mesaj yazılır (sıra ÖNEMLİ — kronolojik dönüş kanıtlanacak).
      const writeAndWait = async (body: string): Promise<void> => {
        const received = new Promise<void>((resolve, reject) => {
          earlyClient.on('chat.message.received', () => resolve());
          earlyClient.on('chat.error', (payload: { message: string }) => reject(new Error(payload.message)));
          setTimeout(() => reject(new Error(`chat.message.received zaman aşımına uğradı: ${body}`)), WAIT_MS);
        });
        earlyClient.emit('chat.message', { raceId, body });
        await received;
      };
      await writeAndWait('birinci');
      await writeAndWait('ikinci');

      await awaitConnect(lateClient);
      const historyForLate = new Promise<RaceChatHistoryPayload>((resolve, reject) => {
        lateClient.on('chat.history', (payload: RaceChatHistoryPayload) => resolve(payload));
        setTimeout(() => reject(new Error('chat.history (geç abone) zaman aşımına uğradı')), WAIT_MS);
      });
      await subscribe(lateClient, raceId);

      const history = await historyForLate;
      expect(history.raceId).toBe(raceId);
      expect(history.messages.map((message) => message.body)).toEqual(['birinci', 'ikinci']);

      // Gönderen adı `players` JOIN'inden gelir ve istemciye GERÇEKTEN
      // taşınır. Beklenen değer, paylaşılan test yardımcısına yeni bir alan
      // eklemek yerine doğrudan DB'den okunur — böylece iddia "yardımcının
      // döndürdüğü şey" ile değil, SUNUCUNUN yazdığı satırla karşılaştırılır.
      const ownerRow = await pool.query<{ username: string }>(
        'SELECT username FROM players WHERE id = $1',
        [early.playerId],
      );
      expect(history.messages[0]?.username).toBe(ownerRow.rows[0]?.username);
      expect(history.messages[0]?.username).toBeTruthy();
    } finally {
      earlyClient.disconnect();
      lateClient.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  it('ABONE OLMAYAN bir soket sohbet edemez — mesaj yazılmaz (yeni yetki mekanizması İCAT EDİLMEDİ)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Yetki Sahibi');
    const viewer = await registerTestPlayerWithStarterHorse(app, 'Yetki Seyircisi');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);
    await buyTicket(raceId, viewer.authHeader);

    // Bu oyuncu bilet ALDI ama HİÇ abone olmadı (`race.subscribe` YOK).
    const client = connect(viewer.token);
    try {
      await awaitConnect(client);

      const errorMessage = new Promise<string>((resolve, reject) => {
        client.on('chat.error', (payload: { message: string }) => resolve(payload.message));
        client.on('chat.message.received', () =>
          reject(new Error('chat.message.received GELMEMELİYDİ — bu soket abone değil')),
        );
        setTimeout(() => reject(new Error('chat.error zaman aşımına uğradı')), WAIT_MS);
      });

      client.emit('chat.message', { raceId, body: 'izinsiz mesaj' });
      const message = await errorMessage;
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);

      // VE hiçbir şey YAZILMAMIŞ olmalı — hata dönmek tek başına yeterli
      // değildir; sessizce yazıp hatayı da döndürmek asıl tehlikeli hatadır.
      expect(await storedBodies(raceId)).toEqual([]);
    } finally {
      client.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  it('geçersiz gövdeler (boş / yalnızca boşluk / aşırı uzun) chat.error döner ve HİÇBİR ŞEY yazılmaz', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gövde Sahibi');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

    const client = connect(owner.token);
    try {
      await awaitConnect(client);
      await subscribe(client, raceId);

      const bodies: unknown[] = [
        '',
        '   ',
        'x'.repeat(config.maxMessageLength + 1),
        // Gövde hiç gönderilmemiş (undefined) — WebSocket gövdesi
        // doğrulanmamış JSON'dur, `ValidationPipe` YOKTUR.
        undefined,
        42,
      ];

      for (const body of bodies) {
        const errorMessage = await new Promise<string>((resolve, reject) => {
          client.on('chat.error', (payload: { message: string }) => resolve(payload.message));
          client.on('chat.message.received', () =>
            reject(new Error(`chat.message.received GELMEMELİYDİ: ${String(body)}`)),
          );
          setTimeout(() => reject(new Error(`chat.error zaman aşımına uğradı: ${String(body)}`)), WAIT_MS);
          client.emit('chat.message', { raceId, body });
        });
        expect(errorMessage.length).toBeGreaterThan(0);
      }

      expect(await storedBodies(raceId)).toEqual([]);

      // SINIRDA KALAN gövde (tam `maxMessageLength`) GEÇERLİ olmalı —
      // aksi halde sınır bir eksik olurdu ("en fazla 300" ≠ "en fazla 299").
      const exact = 'y'.repeat(config.maxMessageLength);
      const received = new Promise<RaceChatMessageView>((resolve, reject) => {
        client.on('chat.message.received', (payload: RaceChatMessageView) => resolve(payload));
        client.on('chat.error', (payload: { message: string }) => reject(new Error(payload.message)));
        setTimeout(() => reject(new Error('chat.message.received (sınır) zaman aşımına uğradı')), WAIT_MS);
      });
      client.emit('chat.message', { raceId, body: exact });
      expect((await received).body).toBe(exact);
    } finally {
      client.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  it('hız sınırı (brief §32): config sınırı aşıldığında mesaj YAZILMAZ, chat.error döner', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Hız Sahibi');
    const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

    const client = connect(owner.token);
    try {
      await awaitConnect(client);
      await subscribe(client, raceId);

      const { limit } = config.rateLimit;
      let receivedCount = 0;
      const errors: string[] = [];

      client.on('chat.message.received', () => {
        receivedCount += 1;
      });
      client.on('chat.error', (payload: { message: string }) => {
        errors.push(payload.message);
      });

      // Sınırın BİR FAZLASI gönderilir — hepsi TEK seferde (araya bekleme
      // konmaz), çünkü pencere 60 saniyedir ve testin amacı "pencere
      // içinde kaç mesaj geçer" sorusudur. Gateway sayacı, gövde
      // doğrulamasından ve `await`'ten ÖNCE (senkron) artırdığı için
      // paketlerin işlenme sırası belirsizliği burada bir yarış koşulu
      // YARATMAZ.
      for (let index = 0; index < limit + 1; index += 1) {
        client.emit('chat.message', { raceId, body: `mesaj ${index}` });
      }

      // DİKKAT — BURADA BİR KEZ GERÇEK BİR TEST HATASI YAPILDI: koşul
      // "`limit` yayın GELDİ **VEYA** bir hata geldi" olsaydı, 21 mesajın
      // yalnızca 3'ünün yayını dönmüşken gelen TEK bir hata bekleme
      // döngüsünü erken kapatırdı ve `expect(receivedCount).toBe(limit)`
      // uçuştaki yayınlara karşı yarışırdı (yaşandı: "expected 3 to be 20").
      // Doğrusu, TÜM isteklerin (yayın + hata) CEVAPLANMASINI beklemektir.
      const total = limit + 1;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('hız sınırı yanıtı zaman aşımına uğradı')), WAIT_MS);
        const check = setInterval(() => {
          if (receivedCount + errors.length >= total) {
            clearInterval(check);
            clearTimeout(timer);
            resolve();
          }
        }, 50);
      });

      // Hata metinleri iddiaya GÖMÜLÜR: bu test kırmızıya döndüğünde
      // "kaç tane" değil "NEDEN" görünsün (reddedilen mesajın gerekçesi
      // hız sınırı mı, abonelik kapısı mı, DB mi — üçü aynı olayı kullanır).
      const detail = `yayın=${receivedCount}, hata=${errors.length} → ${errors.join(' | ')}`;
      expect(errors.length, detail).toBeGreaterThan(0);
      expect(receivedCount, detail).toBe(limit);
      // AŞIRI mesaj GERÇEKTEN yazılmamış olmalı — reddedilen istek
      // veritabanına sızmamalıdır.
      expect((await storedBodies(raceId)).length, detail).toBe(limit);
    } finally {
      client.disconnect();
    }
  }, RATE_TEST_TIMEOUT_MS);
});
