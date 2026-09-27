import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * ARKADAŞLIK + MESAJLAŞMA — proje sahibinin açık talebi (27.09.2026:
 * "arkadaşlık + mesajlaşma").
 *
 * Diğer e2e dosyalarıyla AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEYLER:**
 *   (1) KANONİK ÇİFT: A→B ve B→A istekleri AYNI satırdır — iki tarafın da
 *       isteğiyle "iki bekleyen kayıt" OLUŞAMAZ (bu, veritabanı CHECK +
 *       UNIQUE kısıtının gerçekten devrede olduğunun kanıtıdır),
 *   (2) MESAJ KAPISI: arkadaş olmadan mesaj 403, arkadaş olduktan sonra
 *       201 — kural gerçekten uygulanıyor,
 *   (3) YETKİ: hiçbir uç nokta başkası adına çağrılamaz (assertSelf).
 *
 * **PARA YOLU YOK:** bu dilim `players`/`economy_transactions` tablolarına
 * HİÇ dokunmaz; bu yüzden dosyada bakiye/ledger doğrulaması BİLEREK yoktur
 * (hediye gönderimi ayrı dilimdir).
 */
describe('Arkadaşlık + mesajlaşma (e2e)', () => {
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

  const socialUrl = (playerId: string) => `/api/v1/players/${playerId}/social`;
  const requestsUrl = (playerId: string) => `/api/v1/players/${playerId}/friend-requests`;
  const respondUrl = (playerId: string, requestId: string) =>
    `/api/v1/players/${playerId}/friend-requests/${requestId}/respond`;
  const friendsUrl = (playerId: string, friendId: string) => `/api/v1/players/${playerId}/friends/${friendId}`;
  const messagesUrl = (playerId: string) => `/api/v1/players/${playerId}/messages`;
  const conversationUrl = (playerId: string, otherId: string) =>
    `/api/v1/players/${playerId}/messages/${otherId}`;
  const inboxUrl = (playerId: string) => `/api/v1/players/${playerId}/inbox`;

  /** İstek gönderir ve dönen `requestId`'yi verir. */
  async function sendRequest(from: RegisteredTestPlayer, to: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(requestsUrl(from.playerId))
      .set('Authorization', from.authHeader)
      .send({ addresseeId: to.playerId })
      .expect(201);
    return response.body.data.requestId as string;
  }

  /** İsteği yanıtlar (varsayılan `accept`) — mutlu yol kısayolu. */
  async function respond(
    responder: RegisteredTestPlayer,
    requestId: string,
    action: 'accept' | 'reject' = 'accept',
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(respondUrl(responder.playerId, requestId))
      .set('Authorization', responder.authHeader)
      .send({ action })
      .expect(200);
  }

  /** İki oyuncuyu arkadaş yapar (istek + kabul). */
  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    await respond(b, await sendRequest(a, b));
  }

  describe('GET /players/:id/social', () => {
    it('yeni oyuncunun özeti boştur (arkadaş yok, istek yok, okunmamış yok)', async () => {
      const player = await registerTestPlayer(app, 'Yalnız Oyuncu');
      const response = await request(app.getHttpServer())
        .get(socialUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .expect(200);

      expect(response.body.data.friends).toEqual([]);
      expect(response.body.data.incomingRequests).toEqual([]);
      expect(response.body.data.outgoingRequests).toEqual([]);
      expect(response.body.data.unreadMessageCount).toBe(0);
    });

    it('BAŞKASININ özeti 403 döner (IDOR kapısı — assertSelf)', async () => {
      const player = await registerTestPlayer(app, 'Meraklı Oyuncu');
      const victim = await registerTestPlayer(app, 'Kurban Oyuncu');

      const response = await request(app.getHttpServer())
        .get(socialUrl(victim.playerId))
        .set('Authorization', player.authHeader)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('kimlik doğrulanmadan 401 döner', async () => {
      const player = await registerTestPlayer(app, 'Kimliksiz Oyuncu');
      await request(app.getHttpServer()).get(socialUrl(player.playerId)).expect(401);
    });
  });

  describe('POST /players/:id/friend-requests', () => {
    it('istek gönderir; gönderen GİDEN, alan GELEN listesinde görür', async () => {
      const sender = await registerTestPlayer(app, 'İstek Gönderen');
      const addressee = await registerTestPlayer(app, 'İstek Alan');

      const response = await request(app.getHttpServer())
        .post(requestsUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ addresseeId: addressee.playerId })
        .expect(201);

      expect(response.body.data.direction).toBe('outgoing');
      expect(response.body.data.playerId).toBe(addressee.playerId);
      expect(response.body.data.displayName).toBe('İstek Alan');

      const senderOverview = await request(app.getHttpServer())
        .get(socialUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .expect(200);
      expect(senderOverview.body.data.outgoingRequests).toHaveLength(1);
      expect(senderOverview.body.data.outgoingRequests[0].playerId).toBe(addressee.playerId);
      expect(senderOverview.body.data.incomingRequests).toEqual([]);
      expect(senderOverview.body.data.friends).toEqual([]);

      const addresseeOverview = await request(app.getHttpServer())
        .get(socialUrl(addressee.playerId))
        .set('Authorization', addressee.authHeader)
        .expect(200);
      expect(addresseeOverview.body.data.incomingRequests).toHaveLength(1);
      expect(addresseeOverview.body.data.incomingRequests[0].playerId).toBe(sender.playerId);
      expect(addresseeOverview.body.data.incomingRequests[0].direction).toBe('incoming');
      expect(addresseeOverview.body.data.outgoingRequests).toEqual([]);
    });

    it('KENDİNE istek 400 CANNOT_FRIEND_SELF döner', async () => {
      const player = await registerTestPlayer(app, 'Kendine İstek');
      const response = await request(app.getHttpServer())
        .post(requestsUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .send({ addresseeId: player.playerId })
        .expect(400);
      expect(response.body.error.code).toBe('CANNOT_FRIEND_SELF');
    });

    it('KANONİK ÇİFT: karşı taraf da istek gönderirse 409 alır ve İKİNCİ satır OLUŞMAZ', async () => {
      const a = await registerTestPlayer(app, 'Kanıt A');
      const b = await registerTestPlayer(app, 'Kanıt B');
      await sendRequest(a, b);

      const response = await request(app.getHttpServer())
        .post(requestsUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .send({ addresseeId: a.playerId })
        .expect(409);
      expect(response.body.error.code).toBe('FRIENDSHIP_ALREADY_EXISTS');

      // ASIL KANIT: veritabanında bu çift için TAM OLARAK BİR satır var.
      // `player_low_id < player_high_id` CHECK'i + UNIQUE kısıtı olmasaydı
      // burada 2 satır olurdu ve iki taraf da "bekleyen" görünürdü.
      const rows = await pool.query(
        `SELECT count(*)::int AS total FROM friendships
         WHERE (player_low_id = $1 AND player_high_id = $2)
            OR (player_low_id = $2 AND player_high_id = $1)`,
        [a.playerId, b.playerId],
      );
      expect(rows.rows[0].total).toBe(1);
    });

    it('var olmayan oyuncuya istek 404 PLAYER_NOT_FOUND döner (FK 23503 → 500 DEĞİL)', async () => {
      const player = await registerTestPlayer(app, 'Hayalet Avcısı');
      const response = await request(app.getHttpServer())
        .post(requestsUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .send({ addresseeId: randomUUID() })
        .expect(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('başkası adına istek 403 döner (assertSelf)', async () => {
      const attacker = await registerTestPlayer(app, 'Sahte Gönderen');
      const victim = await registerTestPlayer(app, 'Gerçek Gönderen');
      const target = await registerTestPlayer(app, 'Hedef');

      const response = await request(app.getHttpServer())
        .post(requestsUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .send({ addresseeId: target.playerId })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      // Hiçbir satır yazılmadı — 403 gerçekten bir kapıdır, kozmetik değil.
      const rows = await pool.query('SELECT count(*)::int AS total FROM friendships WHERE requested_by_id = $1', [
        victim.playerId,
      ]);
      expect(rows.rows[0].total).toBe(0);
    });
  });

  describe('POST /players/:id/friend-requests/:requestId/respond', () => {
    it('accept: iki taraf da ARKADAŞ listesinde görünür, istek listeleri boşalır', async () => {
      const a = await registerTestPlayer(app, 'Kabul A');
      const b = await registerTestPlayer(app, 'Kabul B');
      const requestId = await sendRequest(a, b);

      const response = await respond(b, requestId, 'accept');
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.player.playerId).toBe(a.playerId);

      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const overview = await request(app.getHttpServer())
          .get(socialUrl(self.playerId))
          .set('Authorization', self.authHeader)
          .expect(200);
        expect(overview.body.data.friends).toHaveLength(1);
        expect(overview.body.data.friends[0].playerId).toBe(other.playerId);
        expect(overview.body.data.incomingRequests).toEqual([]);
        expect(overview.body.data.outgoingRequests).toEqual([]);
      }
    });

    it('reject: kayıt `rejected` olur ve AYNI çift YENİDEN istek gönderebilir', async () => {
      const a = await registerTestPlayer(app, 'Ret A');
      const b = await registerTestPlayer(app, 'Ret B');
      const requestId = await sendRequest(a, b);

      const response = await respond(b, requestId, 'reject');
      expect(response.body.data.status).toBe('rejected');

      // Reddedilmiş bir istek KALICI bir yasak değildir — yeniden
      // gönderilebilir ve bu, YENİ satır açmaz (UNIQUE), mevcut satırı
      // yeniden `pending` yapar.
      const again = await sendRequest(a, b);
      expect(again).toBe(requestId);

      const rows = await pool.query(
        `SELECT count(*)::int AS total FROM friendships
         WHERE (player_low_id = $1 AND player_high_id = $2)
            OR (player_low_id = $2 AND player_high_id = $1)`,
        [a.playerId, b.playerId],
      );
      expect(rows.rows[0].total).toBe(1);
    });

    it('KENDİ gönderdiğin isteği yanıtlayamazsın — 404 (kabul edilmiş sayılmaz)', async () => {
      const a = await registerTestPlayer(app, 'Kendi İsteği A');
      const b = await registerTestPlayer(app, 'Kendi İsteği B');
      const requestId = await sendRequest(a, b);

      const response = await request(app.getHttpServer())
        .post(respondUrl(a.playerId, requestId))
        .set('Authorization', a.authHeader)
        .send({ action: 'accept' })
        .expect(404);
      expect(response.body.error.code).toBe('FRIENDSHIP_NOT_FOUND');

      const rows = await pool.query('SELECT status FROM friendships WHERE id = $1', [requestId]);
      expect(rows.rows[0].status).toBe('pending');
    });

    it('AYNI istek İKİ KEZ yanıtlanamaz — ikincisi 404 (çift kabul imkânsız)', async () => {
      const a = await registerTestPlayer(app, 'Çift Kabul A');
      const b = await registerTestPlayer(app, 'Çift Kabul B');
      const requestId = await sendRequest(a, b);
      await respond(b, requestId, 'accept');

      const second = await request(app.getHttpServer())
        .post(respondUrl(b.playerId, requestId))
        .set('Authorization', b.authHeader)
        .send({ action: 'accept' })
        .expect(404);
      expect(second.body.error.code).toBe('FRIENDSHIP_NOT_FOUND');
    });

    it('BAŞKASININ isteğini yanıtlayamazsın — 404 (varlık sızdırılmaz)', async () => {
      const a = await registerTestPlayer(app, 'Üçüncü Kişi A');
      const b = await registerTestPlayer(app, 'Üçüncü Kişi B');
      const outsider = await registerTestPlayer(app, 'Üçüncü Kişi C');
      const requestId = await sendRequest(a, b);

      const response = await request(app.getHttpServer())
        .post(respondUrl(outsider.playerId, requestId))
        .set('Authorization', outsider.authHeader)
        .send({ action: 'accept' })
        .expect(404);
      expect(response.body.error.code).toBe('FRIENDSHIP_NOT_FOUND');
    });

    it('geçersiz `action` 400 INVALID_FRIENDSHIP_ACTION döner (DTO dekoratörüne GÜVENİLMEZ)', async () => {
      const a = await registerTestPlayer(app, 'Geçersiz A');
      const b = await registerTestPlayer(app, 'Geçersiz B');
      const requestId = await sendRequest(a, b);

      for (const action of ['ACCEPT', 'cancel', '']) {
        const response = await request(app.getHttpServer())
          .post(respondUrl(b.playerId, requestId))
          .set('Authorization', b.authHeader)
          .send({ action })
          .expect(400);
        expect(response.body.error.code).toBe('INVALID_FRIENDSHIP_ACTION');
      }
    });

    it('var olmayan istek id 404 döner', async () => {
      const player = await registerTestPlayer(app, 'Kayıp İstek');
      const response = await request(app.getHttpServer())
        .post(respondUrl(player.playerId, randomUUID()))
        .set('Authorization', player.authHeader)
        .send({ action: 'accept' })
        .expect(404);
      expect(response.body.error.code).toBe('FRIENDSHIP_NOT_FOUND');
    });
  });

  describe('DELETE /players/:id/friends/:friendId', () => {
    it('arkadaşlıktan çıkarır; iki tarafın listesinden de düşer', async () => {
      const a = await registerTestPlayer(app, 'Çıkış A');
      const b = await registerTestPlayer(app, 'Çıkış B');
      await makeFriends(a, b);

      const response = await request(app.getHttpServer())
        .delete(friendsUrl(a.playerId, b.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);
      // Gövde, silinen satırın KARŞI TARAFINI taşır (204 değil — gerekçe
      // `RemoveFriendResult` doc yorumunda: istemcinin `request()`
      // yardımcısı her yanıtta JSON ayrıştırır).
      expect(response.body.data.friendId).toBe(b.playerId);

      const overview = await request(app.getHttpServer())
        .get(socialUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(overview.body.data.friends).toEqual([]);
    });

    it('arkadaş OLMADIĞIN birini silmeye çalışmak 404 döner', async () => {
      const a = await registerTestPlayer(app, 'Yabancı A');
      const b = await registerTestPlayer(app, 'Yabancı B');
      const response = await request(app.getHttpServer())
        .delete(friendsUrl(a.playerId, b.playerId))
        .set('Authorization', a.authHeader)
        .expect(404);
      expect(response.body.error.code).toBe('FRIENDSHIP_NOT_FOUND');
    });

    it('BEKLEYEN isteği geri çeker (yanlışlıkla gönderilen istek için çıkış yolu)', async () => {
      const a = await registerTestPlayer(app, 'Geri Çeken');
      const b = await registerTestPlayer(app, 'Geri Çekilen');
      await sendRequest(a, b);

      await request(app.getHttpServer())
        .delete(friendsUrl(a.playerId, b.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);

      const overview = await request(app.getHttpServer())
        .get(socialUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(overview.body.data.incomingRequests).toEqual([]);

      // Geri çekilen istek yeni bir isteği ENGELLEMEZ (satır silindi,
      // `rejected` durumunda bırakılmadı).
      await sendRequest(a, b);
    });
  });

  describe('POST /players/:id/messages', () => {
    it('ARKADAŞ OLMAYANA mesaj 403 NOT_FRIENDS döner ve hiçbir satır yazılmaz', async () => {
      const sender = await registerTestPlayer(app, 'Yabancı Gönderen');
      const target = await registerTestPlayer(app, 'Yabancı Alan');

      const response = await request(app.getHttpServer())
        .post(messagesUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ recipientId: target.playerId, body: 'merhaba' })
        .expect(403);
      expect(response.body.error.code).toBe('NOT_FRIENDS');

      const rows = await pool.query('SELECT count(*)::int AS total FROM direct_messages WHERE sender_id = $1', [
        sender.playerId,
      ]);
      expect(rows.rows[0].total).toBe(0);
    });

    it('arkadaş olduktan sonra mesaj 201 döner, gövde KIRPILIR', async () => {
      const a = await registerTestPlayer(app, 'Mesaj A');
      const b = await registerTestPlayer(app, 'Mesaj B');
      await makeFriends(a, b);

      const response = await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: '  merhaba  ' })
        .expect(201);

      expect(response.body.data.body).toBe('merhaba');
      expect(response.body.data.senderId).toBe(a.playerId);
      expect(response.body.data.recipientId).toBe(b.playerId);
      expect(response.body.data.senderDisplayName).toBe('Mesaj A');
      expect(response.body.data.readAt).toBeNull();
    });

    it('boş / yalnızca boşluk gövde 400 INVALID_MESSAGE_BODY döner', async () => {
      const a = await registerTestPlayer(app, 'Boş Mesaj A');
      const b = await registerTestPlayer(app, 'Boş Mesaj B');
      await makeFriends(a, b);

      for (const body of ['', '   ']) {
        const response = await request(app.getHttpServer())
          .post(messagesUrl(a.playerId))
          .set('Authorization', a.authHeader)
          .send({ recipientId: b.playerId, body })
          .expect(400);
        expect(response.body.error.code).toBe('INVALID_MESSAGE_BODY');
      }
    });

    it('config sınırından UZUN gövde 400 döner (sınır config\'ten okunur, sabit değil)', async () => {
      const a = await registerTestPlayer(app, 'Uzun Mesaj A');
      const b = await registerTestPlayer(app, 'Uzun Mesaj B');
      await makeFriends(a, b);

      const tooLong = 'a'.repeat(config.social.maxMessageLength + 1);
      const response = await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: tooLong })
        .expect(400);
      expect(response.body.error.code).toBe('INVALID_MESSAGE_BODY');

      // Tam sınır KABUL edilir (DB CHECK `BETWEEN 1 AND N` kapsayıcıdır).
      await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: 'a'.repeat(config.social.maxMessageLength) })
        .expect(201);
    });

    it('KENDİNE mesaj 400 CANNOT_MESSAGE_SELF döner', async () => {
      const player = await registerTestPlayer(app, 'Kendine Mesaj');
      const response = await request(app.getHttpServer())
        .post(messagesUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .send({ recipientId: player.playerId, body: 'kendime' })
        .expect(400);
      expect(response.body.error.code).toBe('CANNOT_MESSAGE_SELF');
    });

    it('var olmayan alıcıya mesaj 404 PLAYER_NOT_FOUND döner', async () => {
      const player = await registerTestPlayer(app, 'Hayalet Mesajcı');
      const response = await request(app.getHttpServer())
        .post(messagesUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .send({ recipientId: randomUUID(), body: 'merhaba' })
        .expect(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('başkası adına mesaj 403 döner (assertSelf)', async () => {
      const attacker = await registerTestPlayer(app, 'Sahte Mesajcı');
      const victim = await registerTestPlayer(app, 'Gerçek Mesajcı');
      const target = await registerTestPlayer(app, 'Mesaj Hedefi');
      await makeFriends(victim, target);

      await request(app.getHttpServer())
        .post(messagesUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .send({ recipientId: target.playerId, body: 'sahte' })
        .expect(403);
    });
  });

  describe('GET /players/:id/messages/:otherPlayerId ve /inbox', () => {
    it('yazışma İKİ TARAFTA da aynı mesajları gösterir (en yeniden eskiye)', async () => {
      const a = await registerTestPlayer(app, 'Sohbet A');
      const b = await registerTestPlayer(app, 'Sohbet B');
      await makeFriends(a, b);

      for (const body of ['birinci', 'ikinci']) {
        await request(app.getHttpServer())
          .post(messagesUrl(a.playerId))
          .set('Authorization', a.authHeader)
          .send({ recipientId: b.playerId, body })
          .expect(201);
      }
      await request(app.getHttpServer())
        .post(messagesUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .send({ recipientId: a.playerId, body: 'üçüncü' })
        .expect(201);

      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const response = await request(app.getHttpServer())
          .get(conversationUrl(self.playerId, other.playerId))
          .set('Authorization', self.authHeader)
          .expect(200);
        expect(response.body.data).toHaveLength(3);
        expect(response.body.data[0].body).toBe('üçüncü');
        expect(response.body.data[2].body).toBe('birinci');
      }
    });

    it('sohbeti açmak BANA GELEN mesajları okundu işaretler (okunmamış sayısı 0\'a düşer)', async () => {
      const a = await registerTestPlayer(app, 'Okuma A');
      const b = await registerTestPlayer(app, 'Okuma B');
      await makeFriends(a, b);

      await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: 'okunacak' })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get(socialUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(before.body.data.unreadMessageCount).toBe(1);

      // A'nın kendi gönderdiği mesaj onun için "okunmamış" SAYILMAZ —
      // okuma yalnızca ALICININ gelen kutusuyla ilgilidir.
      const senderBefore = await request(app.getHttpServer())
        .get(socialUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);
      expect(senderBefore.body.data.unreadMessageCount).toBe(0);

      await request(app.getHttpServer())
        .get(conversationUrl(b.playerId, a.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(socialUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(after.body.data.unreadMessageCount).toBe(0);

      // İkinci okuma ilk okumanın ZAMAN DAMGASINI ezmez (`read_at IS NULL`
      // koşulu) — bu yüzden damga değişmeden kalır.
      const firstReadAt = await pool.query(
        'SELECT read_at FROM direct_messages WHERE recipient_id = $1 AND sender_id = $2',
        [b.playerId, a.playerId],
      );
      await request(app.getHttpServer())
        .get(conversationUrl(b.playerId, a.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      const secondReadAt = await pool.query(
        'SELECT read_at FROM direct_messages WHERE recipient_id = $1 AND sender_id = $2',
        [b.playerId, a.playerId],
      );
      expect(secondReadAt.rows[0].read_at).toEqual(firstReadAt.rows[0].read_at);
    });

    it('GELEN KUTUSU bana gelen mesajları gösterir ve okundu işaretlemez', async () => {
      const a = await registerTestPlayer(app, 'Kutu A');
      const b = await registerTestPlayer(app, 'Kutu B');
      await makeFriends(a, b);

      await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: 'kutuya' })
        .expect(201);

      const inbox = await request(app.getHttpServer())
        .get(inboxUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(inbox.body.data).toHaveLength(1);
      expect(inbox.body.data[0].body).toBe('kutuya');
      expect(inbox.body.data[0].readAt).toBeNull();

      // Gelen kutusunu listelemek OKUMA SAYILMAZ — okunmamış sayısı hâlâ 1.
      const overview = await request(app.getHttpServer())
        .get(socialUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(overview.body.data.unreadMessageCount).toBe(1);
    });

    it('arkadaşlıktan çıkınca GEÇMİŞ yazışma OKUNABİLİR ama YENİ mesaj gönderilemez', async () => {
      const a = await registerTestPlayer(app, 'Geçmiş A');
      const b = await registerTestPlayer(app, 'Geçmiş B');
      await makeFriends(a, b);

      await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: 'eski mesaj' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(friendsUrl(a.playerId, b.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);

      const history = await request(app.getHttpServer())
        .get(conversationUrl(b.playerId, a.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(history.body.data).toHaveLength(1);

      const blocked = await request(app.getHttpServer())
        .post(messagesUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .send({ recipientId: b.playerId, body: 'yeni mesaj' })
        .expect(403);
      expect(blocked.body.error.code).toBe('NOT_FRIENDS');
    });

    it('KENDİNLE yazışma boş liste döner (404 değil)', async () => {
      const player = await registerTestPlayer(app, 'Kendinle Sohbet');
      const response = await request(app.getHttpServer())
        .get(conversationUrl(player.playerId, player.playerId))
        .set('Authorization', player.authHeader)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('BAŞKASININ gelen kutusu 403 döner (IDOR kapısı)', async () => {
      const player = await registerTestPlayer(app, 'Meraklı Kutu');
      const victim = await registerTestPlayer(app, 'Gizli Kutu');

      await request(app.getHttpServer())
        .get(inboxUrl(victim.playerId))
        .set('Authorization', player.authHeader)
        .expect(403);
      await request(app.getHttpServer())
        .get(conversationUrl(victim.playerId, player.playerId))
        .set('Authorization', player.authHeader)
        .expect(403);
    });

    it('var olmayan oyuncuyla yazışma 404 döner', async () => {
      const player = await registerTestPlayer(app, 'Kayıp Sohbet');
      const response = await request(app.getHttpServer())
        .get(conversationUrl(player.playerId, randomUUID()))
        .set('Authorization', player.authHeader)
        .expect(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });
  });

  describe('Sosyal özet — birleşik görünüm', () => {
    it('arkadaş + gelen + giden + okunmamış sayısını TEK istekte döner', async () => {
      const self = await registerTestPlayer(app, 'Özet Ben');
      const friend = await registerTestPlayer(app, 'Özet Arkadaş');
      const requester = await registerTestPlayer(app, 'Özet İstekçi');
      const addressee = await registerTestPlayer(app, 'Özet Hedef');

      await makeFriends(self, friend);
      await sendRequest(requester, self);
      await sendRequest(self, addressee);
      await request(app.getHttpServer())
        .post(messagesUrl(friend.playerId))
        .set('Authorization', friend.authHeader)
        .send({ recipientId: self.playerId, body: 'okunmamış' })
        .expect(201);

      const overview = await request(app.getHttpServer())
        .get(socialUrl(self.playerId))
        .set('Authorization', self.authHeader)
        .expect(200);

      expect(overview.body.data.friends).toHaveLength(1);
      expect(overview.body.data.friends[0].playerId).toBe(friend.playerId);
      expect(overview.body.data.friends[0].friendshipId).toBeDefined();
      expect(overview.body.data.friends[0].friendsSince).toBeDefined();
      expect(overview.body.data.incomingRequests).toHaveLength(1);
      expect(overview.body.data.incomingRequests[0].playerId).toBe(requester.playerId);
      expect(overview.body.data.outgoingRequests).toHaveLength(1);
      expect(overview.body.data.outgoingRequests[0].playerId).toBe(addressee.playerId);
      expect(overview.body.data.unreadMessageCount).toBe(1);

      // GİZLİLİK: başka oyuncunun bakiyesi asla taşınmaz (AUDIT_REPORT.md
      // Bulgu S4) — `SocialPlayerView` yalnızca ad + seviye içerir.
      const friendRow = overview.body.data.friends[0];
      expect(friendRow.money).toBeUndefined();
      expect(friendRow.gems).toBeUndefined();
    });
  });
});
