import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * YARIŞ DAVETİ + BİLDİRİMLER — `POST /players/:id/race-invites`,
 * `POST /players/:id/race-invites/:inviteId/respond`,
 * `GET  /players/:id/notifications` (brief §16 RACE INVITE, §28 SOCIAL
 * NOTIFICATIONS, §42 PHASE 11).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **DAVET TEK BAŞINA YETMEZ, BİLDİRİM DE DOĞAR.** brief §16'nın istediği
 *     şey "davet gönder" değil, "`[JOIN] [DECLINE]` BİLDİRİMİ gelsin"dir.
 *     Bu yüzden mutlu yolda İKİ satır da (`race_invites` + `notifications`)
 *     veritabanında aranır — biri eksikse dilim tamamlanmamıştır.
 *  2. **YALNIZCA ARKADAŞLAR DAVET EDEBİLİR** (403 `INVITE_REQUIRES_FRIENDSHIP`).
 *  3. **HER RET NEDENİ AYRI VE DOĞRU KODLA DÖNER:** 400 kendini davet,
 *     404 oyuncu/yarış/davet yok, 409 yarış davet edilemez / zaten davetli
 *     / zaten yanıtlanmış / tavan dolu.
 *  4. **BOZUK KİMLİK 500 DEĞİL 404 DÖNER.** `@IsUUID()` esbuild altında
 *     atlanır; koruma domain'dedir (`isUuid`). Bu testler o korumanın
 *     gerçekten devrede olduğunu kanıtlar.
 *  5. **YANIT YALNIZCA DAVET EDİLENDEN GELİR.** Davet eden kendi davetini
 *     yanıtlayamaz (404 — başkasının davetinin varlığı sızdırılmaz).
 *  6. **IDOR KAPISI.** `:id` her zaman İŞLEMİ YAPAN oyuncudur; başkasının
 *     `:id`si ile 403.
 *  7. **`accept` YARIŞA KATILMAK DEĞİLDİR.** Kabul sonrası `race_entries`
 *     satırı OLUŞMAZ ve bakiye DEĞİŞMEZ — giriş ücreti tek yoldan
 *     (`JoinRaceUseCase`) geçer.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Yarış daveti + bildirimler (e2e) — PHASE 11', () => {
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

  const racesUrl = '/api/v1/races';
  const invitesUrl = (playerId: string) => `/api/v1/players/${playerId}/race-invites`;
  const respondUrl = (playerId: string, inviteId: string) =>
    `/api/v1/players/${playerId}/race-invites/${inviteId}/respond`;
  const notificationsUrl = (playerId: string) => `/api/v1/players/${playerId}/notifications`;
  const readUrl = (playerId: string, notificationId: string) =>
    `/api/v1/players/${playerId}/notifications/${notificationId}/read`;
  const readAllUrl = (playerId: string) => `/api/v1/players/${playerId}/notifications/read-all`;

  /** `POST /races` ile bir yarış açar (`race-leave.e2e-spec.ts` ile aynı gövde). */
  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Ayrılık Kupası',
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
        ...override,
      })
      .expect(201);
    return response.body.data.id as string;
  }

  /** Arkadaşlık isteği gönderir ve `requestId`yi verir. */
  async function sendFriendRequest(from: RegisteredTestPlayer, to: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/players/${from.playerId}/friend-requests`)
      .set('Authorization', from.authHeader)
      .send({ addresseeId: to.playerId })
      .expect(201);
    return response.body.data.requestId as string;
  }

  /** İki oyuncuyu arkadaş yapar (istek + kabul). */
  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    const requestId = await sendFriendRequest(a, b);
    await request(app.getHttpServer())
      .post(`/api/v1/players/${b.playerId}/friend-requests/${requestId}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  /**
   * Davet isteği — durum kodu DAYATMAYAN sürüm (ret testleri için).
   * `body` olduğu gibi gönderilir ki bozuk gövdeler de denenebilsin.
   */
  function rawInvite(inviter: RegisteredTestPlayer, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(invitesUrl(inviter.playerId))
      .set('Authorization', inviter.authHeader)
      .send(body);
  }

  /** Mutlu yol kısayolu: davet gönderir ve `inviteId`yi verir. */
  async function invite(
    inviter: RegisteredTestPlayer,
    invitee: RegisteredTestPlayer,
    raceId: string,
  ): Promise<string> {
    const response = await rawInvite(inviter, { inviteeId: invitee.playerId, raceId }).expect(201);
    return response.body.data.inviteId as string;
  }

  async function notificationRowsOf(playerId: string): Promise<
    { id: string; type: string; payload: Record<string, unknown>; read_at: Date | null }[]
  > {
    const result = await pool.query(
      'SELECT id, type, payload, read_at FROM notifications WHERE player_id = $1 ORDER BY created_at',
      [playerId],
    );
    return result.rows;
  }

  async function inviteRowOf(raceId: string, inviteeId: string) {
    const result = await pool.query<{ status: string; inviter_id: string; responded_at: Date | null }>(
      'SELECT status, inviter_id, responded_at FROM race_invites WHERE race_id = $1 AND invitee_id = $2',
      [raceId, inviteeId],
    );
    return result.rows[0];
  }

  describe('POST /players/:id/race-invites — gönderme', () => {
    it('arkadaşı yarışa davet eder; DAVET ve BİLDİRİM satırları birlikte doğar', async () => {
      const inviter = await registerTestPlayer(app, 'Davet Eden');
      const invitee = await registerTestPlayer(app, 'Davet Edilen');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);

      const response = await rawInvite(inviter, { inviteeId: invitee.playerId, raceId }).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        raceId,
        raceName: 'Ayrılık Kupası',
        inviterId: inviter.playerId,
        inviteeId: invitee.playerId,
        status: 'pending',
        respondedAt: null,
      });
      expect(typeof response.body.data.inviteId).toBe('string');

      // 1) DAVET satırı.
      const inviteRow = await inviteRowOf(raceId, invitee.playerId);
      expect(inviteRow?.status).toBe('pending');
      expect(inviteRow?.inviter_id).toBe(inviter.playerId);
      expect(inviteRow?.responded_at).toBeNull();

      // 2) BİLDİRİM satırı — brief §16'nın asıl istediği şey.
      const notifications = await notificationRowsOf(invitee.playerId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('race_invite');
      expect(notifications[0].read_at).toBeNull();
      // Payload'ın `inviteId`si DAVETİN kimliğidir (bildiriminkinden farklı).
      expect(notifications[0].payload).toMatchObject({
        inviteId: response.body.data.inviteId,
        raceId,
        raceName: 'Ayrılık Kupası',
        inviterId: inviter.playerId,
        inviterDisplayName: 'Davet Eden',
      });

      // 3) Davet edenin kendi bildirim listesi BOŞ kalır (bildirim alıcıya gider).
      expect(await notificationRowsOf(inviter.playerId)).toHaveLength(0);
    });

    it('ARKADAŞ OLMAYAN oyuncu davet edilemez (403 INVITE_REQUIRES_FRIENDSHIP)', async () => {
      const inviter = await registerTestPlayer(app, 'Yabancı Davetçi');
      const stranger = await registerTestPlayer(app, 'Yabancı');
      const raceId = await createRace(inviter);

      const response = await rawInvite(inviter, { inviteeId: stranger.playerId, raceId }).expect(403);

      expect(response.body.error.code).toBe('INVITE_REQUIRES_FRIENDSHIP');
      // Hiçbir şey yazılmamış olmalı — ne davet ne bildirim.
      expect(await inviteRowOf(raceId, stranger.playerId)).toBeUndefined();
      expect(await notificationRowsOf(stranger.playerId)).toHaveLength(0);
    });

    it('kendini davet etmek 400 CANNOT_INVITE_SELF', async () => {
      const player = await registerTestPlayer(app, 'Kendini Davetçi');
      const raceId = await createRace(player);

      const response = await rawInvite(player, { inviteeId: player.playerId, raceId }).expect(400);

      expect(response.body.error.code).toBe('CANNOT_INVITE_SELF');
    });

    it('olmayan oyuncu 404 PLAYER_NOT_FOUND', async () => {
      const inviter = await registerTestPlayer(app, 'Hayalet Avcısı');
      const raceId = await createRace(inviter);

      const response = await rawInvite(inviter, {
        inviteeId: '99999999-9999-4999-8999-999999999999',
        raceId,
      }).expect(404);

      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('olmayan yarış 404 RACE_NOT_FOUND', async () => {
      const inviter = await registerTestPlayer(app, 'Yarışsız Davetçi');
      const friend = await registerTestPlayer(app, 'Arkadaş');
      await makeFriends(inviter, friend);

      const response = await rawInvite(inviter, {
        inviteeId: friend.playerId,
        raceId: '88888888-8888-4888-8888-888888888888',
      }).expect(404);

      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('BOZUK `inviteeId` 500 DEĞİL 404 döner (`@IsUUID` esbuild altında atlanır)', async () => {
      // Bu testin varlık sebebi doğrudan CLAUDE.md kural 5'tir: gövde
      // doğrulaması dekoratöre bırakılırsa, `"abc"` doğrudan `WHERE id = $1`e
      // gider, PostgreSQL 22P02 fırlatır ve istemci 400/404 yerine 500 alır.
      const inviter = await registerTestPlayer(app, 'Bozuk Kimlik');
      const raceId = await createRace(inviter);

      const response = await rawInvite(inviter, { inviteeId: 'abc', raceId }).expect(404);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('BOZUK `raceId` 500 DEĞİL 404 döner', async () => {
      const inviter = await registerTestPlayer(app, 'Bozuk Yarış Kimliği');
      const friend = await registerTestPlayer(app, 'Arkadaş İki');
      await makeFriends(inviter, friend);

      const response = await rawInvite(inviter, {
        inviteeId: friend.playerId,
        raceId: 'not-a-uuid',
      }).expect(404);
      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('aynı yarışa ikinci davet 409 RACE_INVITE_ALREADY_EXISTS', async () => {
      const inviter = await registerTestPlayer(app, 'Israrcı Davetçi');
      const invitee = await registerTestPlayer(app, 'Israra Maruz');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);
      await invite(inviter, invitee, raceId);

      const response = await rawInvite(inviter, { inviteeId: invitee.playerId, raceId }).expect(409);

      expect(response.body.error.code).toBe('RACE_INVITE_ALREADY_EXISTS');
      // İkinci istek İKİNCİ bir bildirim yazmamalı (transaction bütündür).
      expect(await notificationRowsOf(invitee.playerId)).toHaveLength(1);
    });

    it('başlamış yarışa davet 409 RACE_NOT_INVITABLE', async () => {
      const inviter = await registerTestPlayer(app, 'Geç Kalan');
      const invitee = await registerTestPlayer(app, 'Geç Kalanın Arkadaşı');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);
      // `POST /races` GEÇMİŞ bir `startTime`ı reddeder
      // (`raceLobby.startDelaySeconds.min`), bu yüzden "hâlâ `scheduled`
      // ama başlama zamanı geçmiş" durumu doğrudan veritabanında kurulur.
      // Ölçülen şey uç nokta değil, DAVET KAPISIDIR (`checkInviteable`).
      await pool.query("UPDATE races SET start_time = now() - interval '1 hour' WHERE id = $1", [raceId]);

      const response = await rawInvite(inviter, { inviteeId: invitee.playerId, raceId }).expect(409);

      expect(response.body.error.code).toBe('RACE_NOT_INVITABLE');
    });

    it('`scheduled` olmayan yarışa davet 409 RACE_NOT_INVITABLE', async () => {
      const inviter = await registerTestPlayer(app, 'Durum Bekçisi');
      const invitee = await registerTestPlayer(app, 'Durum Arkadaşı');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);

      // Durumu doğrudan veritabanından değiştiriyoruz: `POST /races` her
      // zaman `scheduled` üretir ve iptal/başlatma uçları bu dosyanın
      // kapsamı dışındadır. Ölçülen şey uç nokta değil, DAVET KAPISIDIR.
      await pool.query("UPDATE races SET status = 'cancelled' WHERE id = $1", [raceId]);

      const response = await rawInvite(inviter, { inviteeId: invitee.playerId, raceId }).expect(409);

      expect(response.body.error.code).toBe('RACE_NOT_INVITABLE');
    });

    it('bekleyen davet TAVANI dolduğunda 409 SOCIAL_LIMIT_REACHED', async () => {
      const inviter = await registerTestPlayer(app, 'Tavan Davetçisi');
      const invitee = await registerTestPlayer(app, 'Tavan Arkadaşı');
      await makeFriends(inviter, invitee);

      // Tavanı API üzerinden doldurmak `pendingInvitesLimit` kadar yarış
      // açmayı gerektirir; satırlar doğrudan yazılır çünkü ölçülen şey
      // DAVET GÖNDERME uç noktası değil, TAVAN kapısıdır
      // (`countOutgoingPending`). Her satır AYRI bir yarışa aittir ki
      // `(race_id, invitee_id)` tekil indeksi çiğnenmesin.
      //
      // DİKKAT — yarışları TEK oyuncu açamaz: `POST /races` bir oyuncu
      // başına `maxOpenRacesPerPlayer` ile sınırlıdır. Bu yüzden yarışları
      // BİRDEN FAZLA kurucu açar; davetin `inviter_id`si yarışı AÇANDAN
      // bağımsızdır (aşağıdaki INSERT hepsini aynı davetçiye yazar).
      const limit = config.social.pendingInvitesLimit;
      const racesPerCreator = config.raceLobby.maxOpenRacesPerPlayer;
      const raceIds: string[] = [];
      while (raceIds.length < limit) {
        const creator = await registerTestPlayer(app, `Tavan Kurucusu ${raceIds.length}`);
        for (let i = 0; i < racesPerCreator && raceIds.length < limit; i += 1) {
          raceIds.push(await createRace(creator));
        }
      }
      await pool.query(
        `INSERT INTO race_invites (race_id, inviter_id, invitee_id, status)
         SELECT t.race_id, $1, $2, 'pending' FROM unnest($3::uuid[]) AS t(race_id)`,
        [inviter.playerId, invitee.playerId, raceIds],
      );

      const response = await rawInvite(inviter, {
        inviteeId: invitee.playerId,
        raceId: await createRace(inviter),
      }).expect(409);

      expect(response.body.error.code).toBe('SOCIAL_LIMIT_REACHED');
    });

    it('BAŞKASININ :id`si ile davet göndermek 403 FORBIDDEN (IDOR)', async () => {
      const attacker = await registerTestPlayer(app, 'Sahte Davetçi');
      const victim = await registerTestPlayer(app, 'Kurban');
      const raceId = await createRace(attacker);

      const response = await request(app.getHttpServer())
        .post(invitesUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .send({ inviteeId: victim.playerId, raceId })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /players/:id/race-invites/:inviteId/respond — yanıt', () => {
    async function pendingInvite(): Promise<{
      inviter: RegisteredTestPlayer;
      invitee: RegisteredTestPlayer;
      raceId: string;
      inviteId: string;
    }> {
      const inviter = await registerTestPlayer(app, 'Bekleyen Davetçi');
      const invitee = await registerTestPlayer(app, 'Bekleyen Davetli');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);
      return { inviter, invitee, raceId, inviteId: await invite(inviter, invitee, raceId) };
    }

    function respond(player: RegisteredTestPlayer, inviteId: string, action: unknown) {
      return request(app.getHttpServer())
        .post(respondUrl(player.playerId, inviteId))
        .set('Authorization', player.authHeader)
        .send({ action });
    }

    it('`accept` daveti kabul eder ve `responded_at`i YAZAR', async () => {
      const { invitee, raceId, inviteId } = await pendingInvite();

      const response = await respond(invitee, inviteId, 'accept').expect(200);

      expect(response.body.data).toEqual({ inviteId, status: 'accepted' });
      const row = await inviteRowOf(raceId, invitee.playerId);
      expect(row?.status).toBe('accepted');
      expect(row?.responded_at).not.toBeNull();
    });

    it('`accept` YARIŞA KATILMAK DEĞİLDİR — katılım ve bakiye DEĞİŞMEZ', async () => {
      // brief §16'nın [JOIN] düğmesi istemcide iki adımdır. Bu test, kabulün
      // sessizce bir "ücretsiz katılım"a dönüşmediğini kanıtlar: giriş
      // ücreti tek yoldan (`JoinRaceUseCase`) geçer.
      const { invitee, raceId, inviteId } = await pendingInvite();
      const moneyBefore = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
        invitee.playerId,
      ]);

      await respond(invitee, inviteId, 'accept').expect(200);

      const entries = await pool.query('SELECT 1 FROM race_entries WHERE race_id = $1 AND player_id = $2', [
        raceId,
        invitee.playerId,
      ]);
      expect(entries.rowCount).toBe(0);
      const moneyAfter = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
        invitee.playerId,
      ]);
      expect(moneyAfter.rows[0].money).toBe(moneyBefore.rows[0].money);
    });

    it('`decline` daveti reddeder', async () => {
      const { invitee, raceId, inviteId } = await pendingInvite();

      const response = await respond(invitee, inviteId, 'decline').expect(200);

      expect(response.body.data).toEqual({ inviteId, status: 'declined' });
      const row = await inviteRowOf(raceId, invitee.playerId);
      expect(row?.status).toBe('declined');
      expect(row?.responded_at).not.toBeNull();
    });

    it('aynı daveti İKİ KEZ yanıtlamak 409 RACE_INVITE_NOT_RESPONDABLE', async () => {
      const { invitee, inviteId } = await pendingInvite();
      await respond(invitee, inviteId, 'accept').expect(200);

      const response = await respond(invitee, inviteId, 'decline').expect(409);

      expect(response.body.error.code).toBe('RACE_INVITE_NOT_RESPONDABLE');
    });

    it('geçersiz `action` 400 INVALID_RACE_INVITE_ACTION (`@IsIn` esbuild altında atlanır)', async () => {
      const { invitee, inviteId } = await pendingInvite();

      const response = await respond(invitee, inviteId, 'ACCEPT').expect(400);

      expect(response.body.error.code).toBe('INVALID_RACE_INVITE_ACTION');
      // Geçersiz gövde daveti TÜKETMEMELİ — hâlâ `pending` olmalı.
      expect((await pool.query('SELECT status FROM race_invites WHERE id = $1', [inviteId])).rows[0].status).toBe(
        'pending',
      );
    });

    it('`action` HİÇ gönderilmezse de 400 döner (eksik alan)', async () => {
      const { invitee, inviteId } = await pendingInvite();

      const response = await request(app.getHttpServer())
        .post(respondUrl(invitee.playerId, inviteId))
        .set('Authorization', invitee.authHeader)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_RACE_INVITE_ACTION');
    });

    it('DAVET EDEN kendi davetini yanıtlayamaz (404 RACE_INVITE_NOT_FOUND)', async () => {
      // "Bu id var ama senin değil" demek, başkasının davetinin VARLIĞINI
      // sızdırırdı — `RaceInviteNotFoundError` üç durumu tek kodda birleştirir.
      const { inviter, inviteId } = await pendingInvite();

      const response = await respond(inviter, inviteId, 'accept').expect(404);

      expect(response.body.error.code).toBe('RACE_INVITE_NOT_FOUND');
    });

    it('olmayan davet 404 RACE_INVITE_NOT_FOUND', async () => {
      const player = await registerTestPlayer(app, 'Kayıp Davet Avcısı');

      const response = await respond(player, '77777777-7777-4777-8777-777777777777', 'accept').expect(404);

      expect(response.body.error.code).toBe('RACE_INVITE_NOT_FOUND');
    });

    it('BAŞKASININ :id`si ile yanıtlamak 403 FORBIDDEN (IDOR)', async () => {
      // Saldırgan, DAVET EDİLENİN yolundaki `:id`siyle istek atar —
      // `assertSelf` kapısı burada devreye girer ve use-case'e hiç
      // inilmez. (Saldırgan KENDİ `:id`siyle başkasının davet kimliğini
      // denerse farklı bir kapı çalışır: 404 RACE_INVITE_NOT_FOUND — o
      // durum aşağıdaki ayrı testte ölçülür.)
      const { invitee, inviteId } = await pendingInvite();
      const attacker = await registerTestPlayer(app, 'Davet Hırsızı');

      const response = await request(app.getHttpServer())
        .post(respondUrl(invitee.playerId, inviteId))
        .set('Authorization', attacker.authHeader)
        .send({ action: 'accept' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      // Davet DEĞİŞMEMİŞ olmalı.
      expect((await pool.query('SELECT status FROM race_invites WHERE id = $1', [inviteId])).rows[0].status).toBe(
        'pending',
      );
    });

    it('KENDİ :id`siyle BAŞKASININ davetini yanıtlamak 404 (varlık sızdırılmaz)', async () => {
      // `assertSelf` geçer (yol kendi kimliği), ama `respond` sorgusu
      // `WHERE id = $1 AND invitee_id = $2 AND status = 'pending'` olduğu
      // için 0 satır döner. "Bu id var ama senin değil" demek, başkasının
      // davetinin VARLIĞINI sızdırırdı.
      const { invitee, inviteId } = await pendingInvite();
      const nosy = await registerTestPlayer(app, 'Meraklı Yanıtlayıcı');

      const response = await request(app.getHttpServer())
        .post(respondUrl(nosy.playerId, inviteId))
        .set('Authorization', nosy.authHeader)
        .send({ action: 'accept' })
        .expect(404);

      expect(response.body.error.code).toBe('RACE_INVITE_NOT_FOUND');
      // Davet DEĞİŞMEMİŞ olmalı — yalnızca gerçek davetli yanıtlayabilir.
      expect((await pool.query('SELECT status FROM race_invites WHERE id = $1', [inviteId])).rows[0].status).toBe(
        'pending',
      );
      expect(invitee.playerId).not.toBe(nosy.playerId);
    });
  });

  describe('GET /players/:id/notifications — listeleme ve okundu işaretleme', () => {
    it('yeni oyuncunun listesi boş ve `unreadCount` sıfırdır', async () => {
      const player = await registerTestPlayer(app, 'Bildirimsiz');

      const response = await request(app.getHttpServer())
        .get(notificationsUrl(player.playerId))
        .set('Authorization', player.authHeader)
        .expect(200);

      expect(response.body.data).toEqual({ notifications: [], unreadCount: 0 });
    });

    it('davet bildirimi listelenir ve `unreadCount` 1 olur', async () => {
      const inviter = await registerTestPlayer(app, 'Liste Davetçisi');
      const invitee = await registerTestPlayer(app, 'Liste Davetlisi');
      await makeFriends(inviter, invitee);
      const raceId = await createRace(inviter);
      const inviteId = await invite(inviter, invitee, raceId);

      const response = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);

      expect(response.body.data.unreadCount).toBe(1);
      expect(response.body.data.notifications).toHaveLength(1);
      expect(response.body.data.notifications[0]).toMatchObject({
        type: 'race_invite',
        readAt: null,
        payload: { inviteId, raceId, raceName: 'Ayrılık Kupası', inviterId: inviter.playerId },
      });
      // `createdAt` ISO 8601 olmalı (sözleşme `string` der; `Date` JSON'a
      // çevrilirken de string olurdu — bu yüzden ŞEKLİ doğruluyoruz).
      expect(response.body.data.notifications[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('tek bildirimi okundu işaretler; `unreadCount` düşer, gövde korunur', async () => {
      const inviter = await registerTestPlayer(app, 'Okuma Davetçisi');
      const invitee = await registerTestPlayer(app, 'Okuma Davetlisi');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));

      const listBefore = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      const notificationId = listBefore.body.data.notifications[0].notificationId as string;

      const response = await request(app.getHttpServer())
        .post(readUrl(invitee.playerId, notificationId))
        .set('Authorization', invitee.authHeader)
        .expect(200);

      expect(response.body.data.notificationId).toBe(notificationId);
      expect(response.body.data.readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const listAfter = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      expect(listAfter.body.data.unreadCount).toBe(0);
      // Okundu işaretlemek bildirimi SİLMEZ ve payload'ı bozmaz.
      expect(listAfter.body.data.notifications[0].payload.inviteId).toBe(
        listBefore.body.data.notifications[0].payload.inviteId,
      );
    });

    it('aynı bildirimi ikinci kez okundu işaretlemek İDEMPOTENTTİR (200, zaman değişmez)', async () => {
      const inviter = await registerTestPlayer(app, 'İdempotent Davetçi');
      const invitee = await registerTestPlayer(app, 'İdempotent Davetli');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));

      const list = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      const notificationId = list.body.data.notifications[0].notificationId as string;

      const first = await request(app.getHttpServer())
        .post(readUrl(invitee.playerId, notificationId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post(readUrl(invitee.playerId, notificationId))
        .set('Authorization', invitee.authHeader)
        .expect(200);

      expect(second.body.data.readAt).toBe(first.body.data.readAt);
    });

    it('olmayan bildirim 404 NOTIFICATION_NOT_FOUND', async () => {
      const player = await registerTestPlayer(app, 'Kayıp Bildirim Avcısı');

      const response = await request(app.getHttpServer())
        .post(readUrl(player.playerId, '66666666-6666-4666-8666-666666666666'))
        .set('Authorization', player.authHeader)
        .expect(404);

      expect(response.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
    });

    it('BAŞKASININ bildirimi okundu işaretlenemez (404 — varlık sızdırılmaz)', async () => {
      const inviter = await registerTestPlayer(app, 'Sızıntı Davetçisi');
      const invitee = await registerTestPlayer(app, 'Sızıntı Davetlisi');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));

      const list = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      const notificationId = list.body.data.notifications[0].notificationId as string;

      // Saldırgan KENDİ :id`siyle BAŞKASININ bildirim kimliğini dener.
      const attacker = await registerTestPlayer(app, 'Bildirim Hırsızı');
      const response = await request(app.getHttpServer())
        .post(readUrl(attacker.playerId, notificationId))
        .set('Authorization', attacker.authHeader)
        .expect(404);

      expect(response.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
      // Ve gerçekten okunmamış kalmalı.
      expect(
        (await pool.query('SELECT read_at FROM notifications WHERE id = $1', [notificationId])).rows[0].read_at,
      ).toBeNull();
    });

    it('`read-all` TÜM bildirimleri okundu yapar ve `markedCount` döner', async () => {
      const inviter = await registerTestPlayer(app, 'Toplu Okuyucu Davetçisi');
      const invitee = await registerTestPlayer(app, 'Toplu Okuyucu');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));
      await invite(inviter, invitee, await createRace(inviter));

      const response = await request(app.getHttpServer())
        .post(readAllUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);

      expect(response.body.data).toEqual({ markedCount: 2 });

      const list = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);
      expect(list.body.data.unreadCount).toBe(0);
      expect(list.body.data.notifications).toHaveLength(2);
    });

    it('`read-all` yalnızca ÇAĞIRANIN bildirimlerini işaretler', async () => {
      // IDOR'un ikinci kapısı: `read-all` yanlış yazılsaydı (ör. `WHERE
      // read_at IS NULL` tek başına) TÜM oyuncuların bildirimleri
      // okunmuş olurdu ve bu sessiz, geri dönüşsüz bir veri bozulmasıdır.
      const inviter = await registerTestPlayer(app, 'Kapsam Davetçisi');
      const invitee = await registerTestPlayer(app, 'Kapsam Davetlisi');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));

      await request(app.getHttpServer())
        .post(readAllUrl(inviter.playerId))
        .set('Authorization', inviter.authHeader)
        .expect(200);

      expect(await notificationRowsOf(invitee.playerId)).toHaveLength(1);
      expect((await notificationRowsOf(invitee.playerId))[0].read_at).toBeNull();
    });

    it('BAŞKASININ bildirim listesi 403 FORBIDDEN (IDOR)', async () => {
      const attacker = await registerTestPlayer(app, 'Liste Gözcüsü');
      const victim = await registerTestPlayer(app, 'Liste Kurbanı');

      const response = await request(app.getHttpServer())
        .get(notificationsUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('`unreadCount` LİSTE LİMİTİNDEN bağımsızdır (kırpılmış uzunluk değildir)', async () => {
      // `NotificationListResult` sözleşmesi bunu açıkça söyler: sayaç ayrı
      // bir `COUNT(*)`tur. İki bildirim üretip listenin uzunluğu ile sayacı
      // AYRI AYRI doğruluyoruz ki biri gün gelip diğerinden türetilmesin.
      const inviter = await registerTestPlayer(app, 'Sayaç Davetçisi');
      const invitee = await registerTestPlayer(app, 'Sayaç Davetlisi');
      await makeFriends(inviter, invitee);
      await invite(inviter, invitee, await createRace(inviter));
      await invite(inviter, invitee, await createRace(inviter));

      const response = await request(app.getHttpServer())
        .get(notificationsUrl(invitee.playerId))
        .set('Authorization', invitee.authHeader)
        .expect(200);

      expect(response.body.data.unreadCount).toBe(2);
      expect(response.body.data.notifications.length).toBeLessThanOrEqual(
        config.social.notificationsLimit,
      );
    });
  });
});
