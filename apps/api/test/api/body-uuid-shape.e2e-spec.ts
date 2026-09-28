import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * GÖVDEDEN gelen UUID alanlarının ŞEKİL kontrolü — CLAUDE.md kural 5
 * ("Kardeş tuzak") + docs/ARCHITECTURE.md §9.1 Hata 7.
 *
 * **Test edilen ortak kural:** `@IsUUID()` bir DTO dekoratörüdür ve
 * Vitest/esbuild `design:paramtypes` üretmediği için `ValidationPipe` GÖVDE
 * doğrulamasını SESSİZCE atlar. `ParseUUIDPipe` ise yalnızca YOL
 * parametrelerini korur. Korumasız bir `"not-a-uuid"` repository'ye ulaşır,
 * `WHERE id = $1` ham bir PostgreSQL tip hatası
 * (`22P02 invalid input syntax for type uuid`) atar ve istemci 400 yerine
 * **500** görür.
 *
 * **Neden TEK dosyada toplandı:** kural tek tek uç noktalara ait DEĞİL,
 * uç noktaların HEPSİNE ait. Yeni bir gövde-UUID alanı ekleyen geliştirici
 * buraya bir satır eklemeli; kural bir dosyada görünür durumda kalır.
 *
 * **Her bölümde İKİ test vardır ve ikincisi ŞARTTIR:** yalnızca "bozuk
 * girdi 400 veriyor" demek, korumanın FAZLA katı olmadığını kanıtlamaz.
 * İkinci test, biçimi GEÇERLİ ama var olmayan bir UUID'nin 400 DEĞİL 404
 * döndüğünü gösterir — yani şekil kontrolü varlık kontrolünün yerine
 * geçmiyor, ondan ÖNCE duruyor.
 */
describe('Gövdeden gelen UUID alanlarının şekil kontrolü (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Ne UUID ne de başka bir şey — korumasız hâlde PostgreSQL 22P02 atardı. */
  const BOZUK = 'not-a-uuid';

  /**
   * Biçimi KUSURSUZ ama hiçbir satıra karşılık gelmeyen UUID. `randomUUID()`
   * DEĞİL sabit: her çalıştırmada AYNI davranışı üretmeli.
   */
  const YOK = '00000000-0000-4000-8000-000000000000';

  describe('POST /players/:id/friend-requests — addresseeId', () => {
    it('addresseeId UUID değilse 400 döner (500 DEĞİL)', async () => {
      const player = await registerTestPlayer(app, 'İstek Sahibi');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${player.playerId}/friend-requests`)
        .set('Authorization', player.authHeader)
        .send({ addresseeId: BOZUK });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('addresseeId');
    });

    it('biçimi geçerli ama var olmayan addresseeId 404 döner', async () => {
      const player = await registerTestPlayer(app, 'İstek Sahibi');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${player.playerId}/friend-requests`)
        .set('Authorization', player.authHeader)
        .send({ addresseeId: YOK });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /players/:id/messages — recipientId', () => {
    it('recipientId UUID değilse 400 döner (500 DEĞİL)', async () => {
      const player = await registerTestPlayer(app, 'Mesaj Gönderen');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${player.playerId}/messages`)
        .set('Authorization', player.authHeader)
        .send({ recipientId: BOZUK, body: 'merhaba' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('recipientId');
    });

    it('biçimi geçerli ama var olmayan recipientId 404 döner', async () => {
      const player = await registerTestPlayer(app, 'Mesaj Gönderen');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${player.playerId}/messages`)
        .set('Authorization', player.authHeader)
        .send({ recipientId: YOK, body: 'merhaba' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /market/listings — horseId', () => {
    it('horseId UUID değilse 400 döner (500 DEĞİL)', async () => {
      const seller = await registerTestPlayerWithStarterHorse(app, 'Satıcı');
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', seller.authHeader)
        .send({ horseId: BOZUK, price: 1_000 });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('horseId');
    });

    it('biçimi geçerli ama var olmayan horseId 404 döner', async () => {
      const seller = await registerTestPlayerWithStarterHorse(app, 'Satıcı');
      const response = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', seller.authHeader)
        .send({ horseId: YOK, price: 1_000 });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /players/:id/gifts — recipientId', () => {
    /**
     * Hediye bir PARA YOLUDUR ve `IdempotencyInterceptor` ile korunur:
     * başlık olmadan istek handler'a HİÇ ulaşmaz, yani testi başlıksız
     * yazmak 400'ü YANLIŞ sebeple geçirirdi.
     */
    it('recipientId UUID değilse 400 döner (500 DEĞİL)', async () => {
      const sender = await registerTestPlayer(app, 'Hediye Gönderen');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${sender.playerId}/gifts`)
        .set('Authorization', sender.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: BOZUK, amount: 1, currency: 'money' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('recipientId');
    });

    it('biçimi geçerli ama var olmayan recipientId 404 döner', async () => {
      const sender = await registerTestPlayer(app, 'Hediye Gönderen');
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${sender.playerId}/gifts`)
        .set('Authorization', sender.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: YOK, amount: 1, currency: 'money' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /matchmaking/queue — horseId', () => {
    it('horseId UUID değilse 400 döner (500 DEĞİL)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kuyruk Oyuncusu');
      const response = await request(app.getHttpServer())
        .post('/api/v1/matchmaking/queue')
        .set('Authorization', player.authHeader)
        .send({ horseId: BOZUK });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('horseId');
    });

    it('biçimi geçerli ama var olmayan horseId 404 döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kuyruk Oyuncusu');
      const response = await request(app.getHttpServer())
        .post('/api/v1/matchmaking/queue')
        .set('Authorization', player.authHeader)
        .send({ horseId: YOK });

      expect(response.status).toBe(404);
    });
  });
});
