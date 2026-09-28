import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import {
  bootstrapTestApp,
  registerTestPlayer,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * BİLDİRİM ÜRETİCİLERİ — `friend_request`, `friend_accepted`,
 * `message_received` (brief §28, §42 PHASE 13).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEYLER:**
 *   (1) ATOMLİK: bildirim, birincil satırla AYNI transaction'da yazılır.
 *       `saveFriendRequest`/`respondToRequest`/`saveMessage` artık
 *       `withTransaction` kullanır; birincil satır YAZILMADIĞINDA (409
 *       yarışı) bildirim de YAZILMAZ — bu, ikinci testin konusudur.
 *   (2) YÖN: bildirim HER ZAMAN karşı tarafa gider; isteği GÖNDEREN kendi
 *       isteği için bildirim ALMAZ.
 *   (3) `friend_accepted` YALNIZCA kabulde üretilir — reddedilen bir istek
 *       karşı tarafa bildirim BIRAKMAZ (bilinçli ürün kararı).
 *   (4) ÖNİZLEME SUNUCUDA kırpılır: `payload.preview` `maxMessageLength`i
 *       değil `notificationPreviewLength`i aşar ve TAM GÖVDEYİ İÇERMEZ —
 *       bildirim ucu bir okuma yolu değildir.
 *
 * **PARA YOLU YOK:** bu dilim `players`/`economy_transactions` tablolarına
 * dokunmaz. `gift_received` ARTIK ÜRETİLİR (§13.13.1) ama kanıtı BURADA
 * DEĞİL, kendi para yolu dosyasındadır (`gift.e2e-spec.ts`) — iddiaları
 * ("403/409/400 → bildirim YOK") ancak orada kurulabilir, çünkü ancak
 * orada gerçek bir bakiye ve gerçek bir transfer vardır.
 */
describe('Bildirim üreticileri (e2e)', () => {
  let app: INestApplication;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const requestsUrl = (playerId: string) => `/api/v1/players/${playerId}/friend-requests`;
  const respondUrl = (playerId: string, requestId: string) =>
    `/api/v1/players/${playerId}/friend-requests/${requestId}/respond`;
  const messagesUrl = (playerId: string) => `/api/v1/players/${playerId}/messages`;
  const notificationsUrl = (playerId: string) => `/api/v1/players/${playerId}/notifications`;

  /** İstek gönderir ve dönen `requestId`'yi verir. */
  async function sendRequest(from: RegisteredTestPlayer, to: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(requestsUrl(from.playerId))
      .set('Authorization', from.authHeader)
      .send({ addresseeId: to.playerId })
      .expect(201);
    return response.body.data.requestId as string;
  }

  /** İki oyuncuyu arkadaş yapar (istek + kabul). */
  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    const requestId = await sendRequest(a, b);
    await request(app.getHttpServer())
      .post(respondUrl(b.playerId, requestId))
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  /**
   * Oyuncunun bildirimlerini okur.
   *
   * **`GET` KULLANILIR (repository'yi doğrudan okumak yerine):** testin
   * kanıtlaması gereken şey "satır veritabanında var" değil, "İSTEMCİ
   * bildirimi GÖRÜYOR"dur. Repository'den okumak, `NotificationView`
   * eşlemesindeki bir hatayı (ör. `payload`ın kaybolması) gizlerdi.
   */
  async function listNotifications(player: RegisteredTestPlayer): Promise<Record<string, unknown>[]> {
    const response = await request(app.getHttpServer())
      .get(notificationsUrl(player.playerId))
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data.notifications as Record<string, unknown>[];
  }

  /** Listede verilen TÜRDEKİ bildirimler (liste zaten en yeniden eskiye sıralıdır). */
  function ofType(notifications: Record<string, unknown>[], type: string): Record<string, unknown>[] {
    return notifications.filter((n) => n.type === type);
  }

  describe('friend_request', () => {
    it('istek ALANA bir bildirim düşer; payload karşı tarafı adıyla taşır', async () => {
      const requester = await registerTestPlayer(app, 'İstek Gönderen');
      const addressee = await registerTestPlayer(app, 'İstek Alan');

      const requestId = await sendRequest(requester, addressee);

      const notifications = await listNotifications(addressee);
      const received = ofType(notifications, 'friend_request');
      expect(received).toHaveLength(1);
      expect(received[0]?.payload).toEqual({
        requestId,
        playerId: requester.playerId,
        displayName: 'İstek Gönderen',
      });
    });

    it('isteği GÖNDEREN kendi isteği için bildirim ALMAZ (yön kanıtı)', async () => {
      const requester = await registerTestPlayer(app, 'İstek Gönderen');
      const addressee = await registerTestPlayer(app, 'İstek Alan');

      await sendRequest(requester, addressee);

      expect(ofType(await listNotifications(requester), 'friend_request')).toHaveLength(0);
    });

    it('409 alan İKİNCİ istek karşı tarafa İKİNCİ bir bildirim bırakmaz', async () => {
      const requester = await registerTestPlayer(app, 'Israrcı Gönderen');
      const addressee = await registerTestPlayer(app, 'Rahatsız Edilen');

      await sendRequest(requester, addressee);

      // Aynı çift için ikinci istek: satır `pending` olduğundan
      // `ON CONFLICT ... WHERE status = 'rejected'` hiçbir satır yazmaz →
      // repository `null` döner → bildirim de yazılmamalıdır. Bu, ATOMLİK
      // iddiasının asıl kanıtıdır: iki yazma ayrı ifadeler olsaydı burada
      // ikinci bir bildirim kalırdı.
      await request(app.getHttpServer())
        .post(requestsUrl(requester.playerId))
        .set('Authorization', requester.authHeader)
        .send({ addresseeId: addressee.playerId })
        .expect(409);

      expect(ofType(await listNotifications(addressee), 'friend_request')).toHaveLength(1);
    });
  });

  describe('friend_accepted', () => {
    it('kabul edilince İSTEK SAHİBİNE bildirim düşer; payload kabul edeni taşır', async () => {
      const requester = await registerTestPlayer(app, 'İstek Gönderen');
      const addressee = await registerTestPlayer(app, 'Kabul Eden');

      const requestId = await sendRequest(requester, addressee);
      await request(app.getHttpServer())
        .post(respondUrl(addressee.playerId, requestId))
        .set('Authorization', addressee.authHeader)
        .send({ action: 'accept' })
        .expect(200);

      const received = ofType(await listNotifications(requester), 'friend_accepted');
      expect(received).toHaveLength(1);
      expect(received[0]?.payload).toEqual({
        friendshipId: requestId,
        playerId: addressee.playerId,
        displayName: 'Kabul Eden',
      });
    });

    it('REDDEDİLEN istek karşı tarafa bildirim BIRAKMAZ (bilinçli)', async () => {
      const requester = await registerTestPlayer(app, 'İstek Gönderen');
      const addressee = await registerTestPlayer(app, 'Reddeden');

      const requestId = await sendRequest(requester, addressee);
      await request(app.getHttpServer())
        .post(respondUrl(addressee.playerId, requestId))
        .set('Authorization', addressee.authHeader)
        .send({ action: 'reject' })
        .expect(200);

      const notifications = await listNotifications(requester);
      expect(ofType(notifications, 'friend_accepted')).toHaveLength(0);

      // YANLIŞ SEBEPLE GEÇMEDİĞİNİN KANITI: istek sahibi kendi isteği için
      // `friend_request` bildirimi de ALMAZ (bildirim her zaman karşı tarafa
      // gider), yani onun listesi tamamen boştur — bu tek başına "hiçbir şey
      // üretilmiyor" ile ayırt edilemez. Bu yüzden üreticinin ÇALIŞTIĞINI
      // karşı tarafta doğrularız: isteği ALAN oyuncuda `friend_request`
      // VARDIR, dolayısıyla aynı isteğin reddi ona `friend_accepted`
      // bırakmamıştır.
      expect(notifications).toHaveLength(0);
      expect(ofType(await listNotifications(addressee), 'friend_request')).toHaveLength(1);
    });
  });

  describe('message_received', () => {
    it('mesaj ALANA bir bildirim düşer; önizleme gövdeyi taşır', async () => {
      const sender = await registerTestPlayer(app, 'Mesaj Gönderen');
      const recipient = await registerTestPlayer(app, 'Mesaj Alan');
      await makeFriends(sender, recipient);

      const sent = await request(app.getHttpServer())
        .post(messagesUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ recipientId: recipient.playerId, body: 'Yarın yarışta görüşürüz' })
        .expect(201);

      const received = ofType(await listNotifications(recipient), 'message_received');
      expect(received).toHaveLength(1);
      expect(received[0]?.payload).toEqual({
        messageId: sent.body.data.messageId,
        playerId: sender.playerId,
        displayName: 'Mesaj Gönderen',
        preview: 'Yarın yarışta görüşürüz',
      });
    });

    it('UZUN mesajın önizlemesi kırpılır ve TAM GÖVDEYİ içermez', async () => {
      const sender = await registerTestPlayer(app, 'Uzun Yazan');
      const recipient = await registerTestPlayer(app, 'Uzun Okuyan');
      await makeFriends(sender, recipient);

      // `maxMessageLength`e (500) KADAR geçerli, ama önizleme sınırından
      // çok daha uzun — sınırın gerçekten uygulandığını kanıtlar.
      const body = 'A'.repeat(config.social.maxMessageLength);
      await request(app.getHttpServer())
        .post(messagesUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ recipientId: recipient.playerId, body })
        .expect(201);

      const received = ofType(await listNotifications(recipient), 'message_received');
      expect(received).toHaveLength(1);
      const preview = (received[0]?.payload as { preview: string }).preview;

      expect(preview).toHaveLength(config.social.notificationPreviewLength + 1); // + '…'
      expect(preview.endsWith('…')).toBe(true);
      // ASIL İDDA: gövdenin TAMAMI sızmıyor. Yalnızca uzunluk kontrolü
      // yeterli değildir — kırpma yanlış yerden yapılsa da uzunluk tutardı.
      expect(preview).not.toBe(body);
      expect(body.startsWith(preview.slice(0, -1))).toBe(true);
    });

    it('mesajı GÖNDEREN kendi mesajı için bildirim ALMAZ', async () => {
      const sender = await registerTestPlayer(app, 'Mesaj Gönderen');
      const recipient = await registerTestPlayer(app, 'Mesaj Alan');
      await makeFriends(sender, recipient);

      await request(app.getHttpServer())
        .post(messagesUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ recipientId: recipient.playerId, body: 'merhaba' })
        .expect(201);

      expect(ofType(await listNotifications(sender), 'message_received')).toHaveLength(0);
    });
  });
});
