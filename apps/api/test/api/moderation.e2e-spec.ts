import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * BLOCK / REPORT — sosyal moderasyon (brief §33, §42 PHASE 15).
 *
 * Diğer e2e dosyalarıyla AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEYLER:**
 *   (1) ENGEL GERÇEKTEN KAPATIYOR: engellenen çiftte mesaj / hediye /
 *       yarış daveti / arkadaşlık isteği 403 `PLAYER_BLOCKED` döner — hem
 *       engelleyen hem engellenen yönde (kural SİMETRİKTİR),
 *   (2) ENGEL KALDIRILINCA YOL YENİDEN AÇILIYOR: engelleme arkadaşlığı
 *       silmediği için mesajlaşma kendiliğinden geri gelir,
 *   (3) ENGEL İDEMPOTENTTİR: ikinci engelleme ikinci satır ÜRETMEZ ve
 *       VAR OLAN `blockedAt`i döner (DB'de satır sayısı sayılarak kanıtlanır),
 *   (4) ŞİKÂYET KAYDI yazılır ve TEKRARLANABİLİR (idempotent değildir),
 *   (5) ŞİKÂYET ARKADAŞLIK GEREKTİRMEZ ve engelden ETKİLENMEZ (bilinçli),
 *   (6) YETKİ: hiçbir uç nokta başkası adına çağrılamaz (assertSelf).
 *
 * **PARA YOLU YOK — TEK İSTİSNA HEDİYE:** hediye testi gerçek bir transfer
 * dener; 403 döndüğünde bakiye ve defter satırı sayısının DEĞİŞMEDİĞİNİ
 * doğrular (engelin parayı gerçekten durdurduğunun kanıtı budur; yalnızca
 * HTTP koduna bakmak "kapı çalıştı" demek için yetersizdir).
 */
describe('Block / Report — moderasyon (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const blocksUrl = (playerId: string) => `/api/v1/players/${playerId}/blocks`;
  const unblockUrl = (playerId: string, blockedId: string) =>
    `/api/v1/players/${playerId}/blocks/${blockedId}`;
  const reportsUrl = (playerId: string) => `/api/v1/players/${playerId}/reports`;
  const requestsUrl = (playerId: string) => `/api/v1/players/${playerId}/friend-requests`;
  const respondUrl = (playerId: string, requestId: string) =>
    `/api/v1/players/${playerId}/friend-requests/${requestId}/respond`;
  const messagesUrl = (playerId: string) => `/api/v1/players/${playerId}/messages`;
  const giftsUrl = (playerId: string) => `/api/v1/players/${playerId}/gifts`;
  const invitesUrl = (playerId: string) => `/api/v1/players/${playerId}/race-invites`;

  /** İki oyuncuyu arkadaş yapar (istek + kabul). */
  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    const created = await request(app.getHttpServer())
      .post(requestsUrl(a.playerId))
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    await request(app.getHttpServer())
      .post(respondUrl(b.playerId, created.body.data.requestId as string))
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  /** Engel koyar ve yanıtı döner (beklenen kod ZORUNLU — çağrı yerinde okunur). */
  async function block(
    blocker: RegisteredTestPlayer,
    blockedId: unknown,
    expectedStatus: number,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(blocksUrl(blocker.playerId))
      .set('Authorization', blocker.authHeader)
      .send({ blockedId })
      .expect(expectedStatus);
  }

  /** Mesaj gönderir ve yanıtı döner. */
  async function sendMessage(
    sender: RegisteredTestPlayer,
    recipientId: string,
    expectedStatus: number,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(messagesUrl(sender.playerId))
      .set('Authorization', sender.authHeader)
      .send({ recipientId, body: 'merhaba' })
      .expect(expectedStatus);
  }

  /** `player_blocks` satır sayısı — idempotentliğin GERÇEK kanıtı. */
  async function countBlocks(blockerId: string, blockedId: string): Promise<number> {
    const result = await pool.query(
      'SELECT count(*)::int AS count FROM player_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, blockedId],
    );
    return result.rows[0].count as number;
  }

  describe('POST /players/:id/blocks', () => {
    it('engel koyar; liste yalnızca ENGELLEYENİN listesinde görünür', async () => {
      const blocker = await registerTestPlayer(app, 'Engelleyen');
      const blocked = await registerTestPlayer(app, 'Engellenen');

      const response = await block(blocker, blocked.playerId, 201);
      expect(response.body.data.playerId).toBe(blocked.playerId);
      expect(response.body.data.displayName).toBe('Engellenen');
      expect(typeof response.body.data.blockedAt).toBe('string');

      const list = await request(app.getHttpServer())
        .get(blocksUrl(blocker.playerId))
        .set('Authorization', blocker.authHeader)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].playerId).toBe(blocked.playerId);

      // TERS YÖN LİSTESİ BOŞTUR — engelleme YÖNLÜDÜR ve "beni engelleyenler"
      // listesi bilinçli olarak yoktur (bkz. `findBlockedPlayers` doc yorumu).
      const reverse = await request(app.getHttpServer())
        .get(blocksUrl(blocked.playerId))
        .set('Authorization', blocked.authHeader)
        .expect(200);
      expect(reverse.body.data).toEqual([]);
    });

    it('İDEMPOTENTTİR: ikinci engelleme satır ÜRETMEZ ve VAR OLAN tarihi döner', async () => {
      const blocker = await registerTestPlayer(app, 'İki Kez Engelleyen');
      const blocked = await registerTestPlayer(app, 'İki Kez Engellenen');

      const first = await block(blocker, blocked.playerId, 201);
      const second = await block(blocker, blocked.playerId, 201);

      // ASIL İDDİA: iki çağrı da AYNI `blockedAt`i döner — yani ikincisi
      // çağıranın `new Date()`ini değil, var olan satırın tarihini taşır.
      expect(second.body.data.blockedAt).toBe(first.body.data.blockedAt);
      expect(await countBlocks(blocker.playerId, blocked.playerId)).toBe(1);
    });

    it('kendini engellemek 400 CANNOT_BLOCK_SELF döner', async () => {
      const player = await registerTestPlayer(app, 'Kendini Engelleyen');
      const response = await block(player, player.playerId, 400);
      expect(response.body.error.code).toBe('CANNOT_BLOCK_SELF');
    });

    it('olmayan bir oyuncuyu engellemek 404 döner', async () => {
      const player = await registerTestPlayer(app, 'Hayalet Engelleyen');
      const response = await block(player, randomUUID(), 404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('geçersiz UUID gövdesi 400 döner (500 DEĞİL — controller kapısı)', async () => {
      const player = await registerTestPlayer(app, 'Bozuk Gövde');
      const response = await block(player, 'abc', 400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('BAŞKASI adına engelleme 403 döner (IDOR kapısı — assertSelf)', async () => {
      const attacker = await registerTestPlayer(app, 'Saldırgan');
      const victim = await registerTestPlayer(app, 'Kurban');
      const target = await registerTestPlayer(app, 'Hedef');

      const response = await request(app.getHttpServer())
        .post(blocksUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .send({ blockedId: target.playerId })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('kimlik doğrulanmadan 401 döner', async () => {
      const player = await registerTestPlayer(app, 'Kimliksiz Engelleyen');
      await request(app.getHttpServer())
        .post(blocksUrl(player.playerId))
        .send({ blockedId: player.playerId })
        .expect(401);
    });
  });

  describe('DELETE /players/:id/blocks/:blockedId', () => {
    it('engeli kaldırır ve listeyi boşaltır', async () => {
      const blocker = await registerTestPlayer(app, 'Engeli Kaldıran');
      const blocked = await registerTestPlayer(app, 'Engeli Kalkan');
      await block(blocker, blocked.playerId, 201);

      const response = await request(app.getHttpServer())
        .delete(unblockUrl(blocker.playerId, blocked.playerId))
        .set('Authorization', blocker.authHeader)
        .expect(200);
      // Gövdesiz 204 DEĞİL (bkz. `RemoveBlockResult` doc yorumu).
      expect(response.body.data.blockedId).toBe(blocked.playerId);

      const list = await request(app.getHttpServer())
        .get(blocksUrl(blocker.playerId))
        .set('Authorization', blocker.authHeader)
        .expect(200);
      expect(list.body.data).toEqual([]);
      expect(await countBlocks(blocker.playerId, blocked.playerId)).toBe(0);
    });

    it('olmayan bir engeli kaldırmak 404 BLOCK_NOT_FOUND döner', async () => {
      const blocker = await registerTestPlayer(app, 'Boş Engel Kaldıran');
      const stranger = await registerTestPlayer(app, 'Yabancı');
      const response = await request(app.getHttpServer())
        .delete(unblockUrl(blocker.playerId, stranger.playerId))
        .set('Authorization', blocker.authHeader)
        .expect(404);
      expect(response.body.error.code).toBe('BLOCK_NOT_FOUND');
    });

    it('BAŞKASININ engelini kaldırmak 403 döner (assertSelf)', async () => {
      const blocker = await registerTestPlayer(app, 'Gerçek Engelleyen');
      const blocked = await registerTestPlayer(app, 'Gerçek Engellenen');
      const attacker = await registerTestPlayer(app, 'Kaldırmaya Çalışan');
      await block(blocker, blocked.playerId, 201);

      await request(app.getHttpServer())
        .delete(unblockUrl(blocker.playerId, blocked.playerId))
        .set('Authorization', attacker.authHeader)
        .expect(403);

      // Engel YERİNDE durur.
      expect(await countBlocks(blocker.playerId, blocked.playerId)).toBe(1);
    });
  });

  describe('ENGEL YAZMA YOLLARINI KAPATIR (brief §33)', () => {
    it('MESAJ: iki yönde de 403 PLAYER_BLOCKED döner', async () => {
      const a = await registerTestPlayer(app, 'Mesaj Engelleyen');
      const b = await registerTestPlayer(app, 'Mesaj Engellenen');
      await makeFriends(a, b);

      // Engelden ÖNCE yol açıktır — kontrolün gerçekten bir fark
      // yarattığının kanıtı (aksi hâlde 403 zaten arkadaşlıktan gelebilirdi).
      await sendMessage(a, b.playerId, 201);

      await block(a, b.playerId, 201);

      const fromBlocker = await sendMessage(a, b.playerId, 403);
      expect(fromBlocker.body.error.code).toBe('PLAYER_BLOCKED');

      // TERS YÖN: engellenen taraf da yazamaz — kural SİMETRİKTİR ve cevap
      // yönü SIZDIRMAZ (aynı kod).
      const fromBlocked = await sendMessage(b, a.playerId, 403);
      expect(fromBlocked.body.error.code).toBe('PLAYER_BLOCKED');
    });

    it('ARKADAŞLIK İSTEĞİ: engellenen çiftte 403 PLAYER_BLOCKED döner', async () => {
      // brief §33 arkadaşlık isteğini SAYMAZ; buraya BİLİNÇLİ bir sapmayla
      // eklendi (gerekçe `SendFriendRequestUseCase` doc yorumunda: sayılmasa
      // engel gerçek bir delik bırakırdı).
      const a = await registerTestPlayer(app, 'İstek Engelleyen');
      const b = await registerTestPlayer(app, 'İstek Engellenen');
      await block(a, b.playerId, 201);

      const response = await request(app.getHttpServer())
        .post(requestsUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .send({ addresseeId: a.playerId })
        .expect(403);
      expect(response.body.error.code).toBe('PLAYER_BLOCKED');
    });

    it('YARIŞ DAVETİ: engellenen çiftte 403 PLAYER_BLOCKED döner', async () => {
      const inviter = await registerTestPlayerWithStarterHorse(app, 'Davet Engelleyen');
      const invitee = await registerTestPlayer(app, 'Davet Engellenen');
      await makeFriends(inviter, invitee);

      const race = await request(app.getHttpServer())
        .post('/api/v1/races')
        .set('Authorization', inviter.authHeader)
        .send({
          name: 'Moderasyon Kupası',
          fieldSize: 12,
          maxPlayers: 8,
          entryFee: 0,
          raceType: 'free',
          startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
          surface: 'grass',
          weather: 'sunny',
          distanceMeters: 1_600,
          tribuneFee: 0,
          spectatorCapacity: 500,
        })
        .expect(201);

      await block(inviter, invitee.playerId, 201);

      const response = await request(app.getHttpServer())
        .post(invitesUrl(inviter.playerId))
        .set('Authorization', inviter.authHeader)
        .send({ inviteeId: invitee.playerId, raceId: race.body.data.id })
        .expect(403);
      expect(response.body.error.code).toBe('PLAYER_BLOCKED');
    });

    it('HEDİYE: 403 PLAYER_BLOCKED döner ve NE BAKİYE NE DEFTER DEĞİŞİR', async () => {
      const sender = await registerTestPlayer(app, 'Hediye Engelleyen');
      const recipient = await registerTestPlayer(app, 'Hediye Engellenen');
      await makeFriends(sender, recipient);

      // `setBalance` doğrudan UPDATE'tir — hediye e2e dosyasıyla AYNI
      // gerekçe: para hareketi yalnızca defter yazan use-case'lerden geçer,
      // bu satır yalnızca testin başlangıç durumunu kurar.
      await pool.query('UPDATE players SET money = $2 WHERE id = $1', [sender.playerId, 5_000]);
      await pool.query('UPDATE players SET money = $2 WHERE id = $1', [recipient.playerId, 100]);

      await block(sender, recipient.playerId, 201);

      const response = await request(app.getHttpServer())
        .post(giftsUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: recipient.playerId, amount: 250, currency: 'money' })
        .expect(403);
      expect(response.body.error.code).toBe('PLAYER_BLOCKED');

      // ASIL İDDİA: engel PARAYI durdurdu. Yalnızca HTTP koduna bakmak
      // yetersizdir — kapı yanlış yerde olsaydı (transferden SONRA) 403
      // yine dönerdi ama para çoktan hareket etmiş olurdu.
      const balances = await pool.query(
        'SELECT id, money FROM players WHERE id = ANY($1::uuid[])',
        [[sender.playerId, recipient.playerId]],
      );
      const byId = new Map(balances.rows.map((row) => [row.id as string, row.money as string]));
      expect(Number(byId.get(sender.playerId))).toBe(5_000);
      expect(Number(byId.get(recipient.playerId))).toBe(100);
    });

    it('ENGEL KALDIRILINCA yol yeniden AÇILIR (arkadaşlık silinmediği için)', async () => {
      const a = await registerTestPlayer(app, 'Yol Kapatan');
      const b = await registerTestPlayer(app, 'Yol Açılan');
      await makeFriends(a, b);
      await block(a, b.playerId, 201);
      await sendMessage(a, b.playerId, 403);

      await request(app.getHttpServer())
        .delete(unblockUrl(a.playerId, b.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);

      // Engel arkadaşlığı SİLMEZ (bkz. migration 0040 notu), yani kaldırma
      // sonrası mesajlaşma kendiliğinden geri gelir.
      await sendMessage(a, b.playerId, 201);

      // ARKADAŞLIK HÂLÂ YERİNDE — engelin yan etkisi olmadığının kanıtı.
      const overview = await request(app.getHttpServer())
        .get(`/api/v1/players/${a.playerId}/social`)
        .set('Authorization', a.authHeader)
        .expect(200);
      expect(overview.body.data.friends).toHaveLength(1);
    });
  });

  describe('POST /players/:id/reports', () => {
    it('şikâyeti `open` durumunda kaydeder ve VERİTABANINA yazar', async () => {
      const reporter = await registerTestPlayer(app, 'Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Şikâyet Edilen');

      const response = await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: reported.playerId, category: 'harassment', reason: '  sürekli hakaret  ' })
        .expect(201);

      expect(response.body.data.reportedId).toBe(reported.playerId);
      expect(response.body.data.category).toBe('harassment');
      expect(response.body.data.status).toBe('open');
      expect(typeof response.body.data.reportId).toBe('string');

      const rows = await pool.query(
        'SELECT category, reason, status FROM player_reports WHERE id = $1',
        [response.body.data.reportId],
      );
      expect(rows.rowCount).toBe(1);
      // Gerekçe KIRPILMIŞ yazılır (`normalizeReportReason`).
      expect(rows.rows[0].reason).toBe('sürekli hakaret');
      expect(rows.rows[0].status).toBe('open');
    });

    it('ARKADAŞLIK GEREKTİRMEZ (bilinçli — asıl şikâyet edilenler yabancılardır)', async () => {
      const reporter = await registerTestPlayer(app, 'Yabancıyı Şikâyet Eden');
      const stranger = await registerTestPlayer(app, 'Yabancı');
      await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: stranger.playerId, category: 'spam' })
        .expect(201);
    });

    it('ENGELDEN ETKİLENMEZ (bilinçli: engelle → sonra şikâyet et sırası doğaldır)', async () => {
      const reporter = await registerTestPlayer(app, 'Engelleyip Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Engellenip Şikâyet Edilen');
      await block(reporter, reported.playerId, 201);

      await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: reported.playerId, category: 'cheating' })
        .expect(201);
    });

    it('İDEMPOTENT DEĞİLDİR: aynı oyuncu iki kez şikâyet edilirse İKİ satır yazılır', async () => {
      const reporter = await registerTestPlayer(app, 'Tekrarlayan Şikâyetçi');
      const reported = await registerTestPlayer(app, 'Tekrarlayan Şikâyet Edilen');
      const url = reportsUrl(reporter.playerId);
      for (let i = 0; i < 2; i += 1) {
        await request(app.getHttpServer())
          .post(url)
          .set('Authorization', reporter.authHeader)
          .send({ reportedId: reported.playerId, category: 'spam' })
          .expect(201);
      }
      const rows = await pool.query(
        'SELECT count(*)::int AS count FROM player_reports WHERE reporter_id = $1 AND reported_id = $2',
        [reporter.playerId, reported.playerId],
      );
      expect(rows.rows[0].count).toBe(2);
    });

    it('BOŞ gerekçe NULL olarak yazılır (gerekçe isteğe bağlıdır)', async () => {
      const reporter = await registerTestPlayer(app, 'Gerekçesiz Şikâyetçi');
      const reported = await registerTestPlayer(app, 'Gerekçesiz Şikâyet Edilen');
      const response = await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: reported.playerId, category: 'other', reason: '   ' })
        .expect(201);

      const rows = await pool.query('SELECT reason FROM player_reports WHERE id = $1', [
        response.body.data.reportId,
      ]);
      expect(rows.rows[0].reason).toBeNull();
    });

    it('kendini şikâyet etmek 400 CANNOT_REPORT_SELF döner', async () => {
      const player = await registerTestPlayer(app, 'Kendini Şikâyet Eden');
      const response = await request(app.getHttpServer())
        .post(reportsUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .send({ reportedId: player.playerId, category: 'spam' })
        .expect(400);
      expect(response.body.error.code).toBe('CANNOT_REPORT_SELF');
    });

    it('geçersiz kategori 400 INVALID_REPORT_CATEGORY döner (domain doğrulaması)', async () => {
      const reporter = await registerTestPlayer(app, 'Kategorisiz Şikâyetçi');
      const reported = await registerTestPlayer(app, 'Kategori Hedefi');
      const response = await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: reported.playerId, category: 'racism' })
        .expect(400);
      expect(response.body.error.code).toBe('INVALID_REPORT_CATEGORY');
    });

    it('aşırı uzun gerekçe 400 INVALID_REPORT_REASON döner', async () => {
      const reporter = await registerTestPlayer(app, 'Uzun Gerekçe');
      const reported = await registerTestPlayer(app, 'Uzun Gerekçe Hedefi');
      const response = await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({
          reportedId: reported.playerId,
          category: 'spam',
          reason: 'a'.repeat(10_000),
        })
        .expect(400);
      expect(response.body.error.code).toBe('INVALID_REPORT_REASON');
    });

    it('olmayan bir oyuncuyu şikâyet etmek 404 döner', async () => {
      const reporter = await registerTestPlayer(app, 'Hayalet Şikâyetçi');
      const response = await request(app.getHttpServer())
        .post(reportsUrl(reporter.playerId))
        .set('Authorization', reporter.authHeader)
        .send({ reportedId: randomUUID(), category: 'spam' })
        .expect(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('BAŞKASI adına şikâyet 403 döner (assertSelf)', async () => {
      const attacker = await registerTestPlayer(app, 'Şikâyet Saldırganı');
      const victim = await registerTestPlayer(app, 'Şikâyet Kurbanı');
      const target = await registerTestPlayer(app, 'Şikâyet Hedefi');
      await request(app.getHttpServer())
        .post(reportsUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .send({ reportedId: target.playerId, category: 'spam' })
        .expect(403);
    });
  });
});
