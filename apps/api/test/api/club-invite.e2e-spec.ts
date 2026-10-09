import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOnlineConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, sendConcurrentRequests, type RegisteredTestPlayer } from './test-helpers';

/**
 * KULÜP DAVETİ (09.10.2026, migration 0080). Kanıtlananlar:
 *   (1) Subay/lider kullanıcı adıyla davet eder; davetliye `club_invite`
 *       bildirimi AYNI transaction'da düşer; davet listesinde görünür.
 *   (2) Kabul = katılım (üyelik `member`), oyuncunun DİĞER bekleyen davetleri
 *       `cancelled` olur; ret yalnızca daveti kapatır.
 *   (3) Kapılar: üye davet edemez (403), kulübü olan davet edilemez (409),
 *       aynı oyuncuya ikinci bekleyen davet 409, bekleyen sınırı 409, engel
 *       iki yönde 403, kendini/olmayanı davet 404, süresi dolan davet 409.
 *   (4) Başkasının davetine yanıt verilemez (404 — varlığı sızmaz).
 *   (5) Aynı oyuncunun iki daveti eşzamanlı kabul edilirse YALNIZCA biri
 *       üyelik yazar, öteki 404/409 alır (500 değil).
 */
describe('Kulüp daveti (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const online = loadOnlineConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function createClub(owner: RegisteredTestPlayer): Promise<string> {
    const response = await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: `Davet Kulübü ${randomUUID().slice(0, 8)}` })
      .expect(201);
    return response.body.data.club.id as string;
  }

  const invite = (actor: RegisteredTestPlayer, clubId: string, username: string) =>
    http().post(`/api/v1/clubs/${clubId}/invites`).set('Authorization', actor.authHeader).send({ username });

  const invitesOf = async (player: RegisteredTestPlayer) =>
    (await http().get('/api/v1/clubs/invites').set('Authorization', player.authHeader).expect(200)).body.data as Array<{
      id: string;
      clubId: string;
      clubName: string;
      inviterName: string;
      expiresAt: string;
    }>;

  const respond = (player: RegisteredTestPlayer, inviteId: string, action: 'accept' | 'decline') =>
    http().post(`/api/v1/clubs/invites/${inviteId}/${action}`).set('Authorization', player.authHeader);

  const statusOf = async (inviteId: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM club_invites WHERE id = $1', [inviteId])).rows[0]!.status;

  it('davet → bildirim + liste; kabul üyelik yazar ve diğer davetleri iptal eder', async () => {
    const leaderA = await registerTestPlayer(app, 'Davet Lideri A');
    const leaderB = await registerTestPlayer(app, 'Davet Lideri B');
    const guest = await registerTestPlayer(app, 'Davetli');
    const clubA = await createClub(leaderA);
    const clubB = await createClub(leaderB);

    // Baştaki "@" ve büyük harf sunucuda normalleştirilir.
    await invite(leaderA, clubA, `  @${guest.username.toUpperCase()} `).expect(201);
    await invite(leaderB, clubB, guest.username).expect(201);

    const list = await invitesOf(guest);
    expect(list.map((item) => item.clubId).sort()).toEqual([clubA, clubB].sort());
    const fromA = list.find((item) => item.clubId === clubA)!;
    expect(fromA.inviterName).toBe('Davet Lideri A');
    const expiresInDays = (new Date(fromA.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(expiresInDays).toBeGreaterThan(online.club.invites.expiryDays - 0.01);
    expect(expiresInDays).toBeLessThanOrEqual(online.club.invites.expiryDays);

    const notifications = await http()
      .get(`/api/v1/players/${guest.playerId}/notifications`)
      .set('Authorization', guest.authHeader)
      .expect(200);
    const clubInvites = (notifications.body.data.notifications as Array<{ type: string; payload: Record<string, unknown> }>).filter(
      (item) => item.type === 'club_invite',
    );
    expect(clubInvites).toHaveLength(2);
    expect(clubInvites.find((item) => item.payload.clubId === clubA)!.payload).toMatchObject({
      inviteId: fromA.id,
      clubId: clubA,
      inviterId: leaderA.playerId,
      inviterName: 'Davet Lideri A',
    });

    const accepted = await respond(guest, fromA.id, 'accept').expect(200);
    expect(accepted.body.data.club.id).toBe(clubA);
    expect(accepted.body.data.myRole).toBe('member');
    const membership = await pool.query<{ club_id: string; role: string }>(
      'SELECT club_id, role FROM club_members WHERE player_id = $1',
      [guest.playerId],
    );
    expect(membership.rows).toEqual([{ club_id: clubA, role: 'member' }]);

    const fromB = list.find((item) => item.clubId === clubB)!;
    expect(await statusOf(fromA.id)).toBe('accepted');
    expect(await statusOf(fromB.id)).toBe('cancelled');
    expect(await invitesOf(guest)).toEqual([]);
    // İptal edilen davet artık kabul edilemez.
    expect((await respond(guest, fromB.id, 'accept').expect(404)).body.error.code).toBe('CLUB_INVITE_NOT_FOUND');
  });

  it('ret daveti kapatır, üyelik yazmaz; aynı davete ikinci yanıt 404', async () => {
    const leader = await registerTestPlayer(app, 'Ret Lideri');
    const guest = await registerTestPlayer(app, 'Ret Davetli');
    const clubId = await createClub(leader);
    await invite(leader, clubId, guest.username).expect(201);
    const [pending] = await invitesOf(guest);

    await respond(guest, pending!.id, 'decline').expect(200);
    expect(await statusOf(pending!.id)).toBe('declined');
    expect((await pool.query('SELECT 1 FROM club_members WHERE player_id = $1', [guest.playerId])).rowCount).toBe(0);
    await respond(guest, pending!.id, 'decline').expect(404);
    // Reddedilen oyuncu yeniden davet edilebilir (tekil indeks yalnızca bekleyende).
    await invite(leader, clubId, guest.username).expect(201);
  });

  it('kapılar: yetki, kulübü olan, tekrar, engel, kendisi/olmayan, başkasının daveti', async () => {
    const leader = await registerTestPlayer(app, 'Kapı Lideri');
    const member = await registerTestPlayer(app, 'Kapı Üyesi');
    const guest = await registerTestPlayer(app, 'Kapı Davetli');
    const stranger = await registerTestPlayer(app, 'Kapı Yabancı');
    const clubId = await createClub(leader);
    await http().post(`/api/v1/clubs/${clubId}/join`).set('Authorization', member.authHeader).expect(200);

    // Sıradan üye davet edemez.
    expect((await invite(member, clubId, guest.username).expect(403)).body.error.code).toBe('INSUFFICIENT_CLUB_PERMISSION');
    // Kulübün üyesi olmayan davet edemez.
    expect((await invite(stranger, clubId, guest.username).expect(403)).body.error.code).toBe('NOT_CLUB_MEMBER');
    // Kulübü olan oyuncu davet edilemez.
    expect((await invite(leader, clubId, member.username).expect(409)).body.error.code).toBe('ALREADY_CLUB_MEMBER');
    // Kendini ve olmayan kullanıcıyı davet: 404.
    await invite(leader, clubId, leader.username).expect(404);
    await invite(leader, clubId, `yok_${randomUUID().slice(0, 8)}`).expect(404);
    // Geçersiz kullanıcı adı 400.
    await invite(leader, clubId, 'a').expect(400);
    await http().post(`/api/v1/clubs/${clubId}/invites`).set('Authorization', leader.authHeader).send({}).expect(400);

    // Aynı oyuncuya ikinci bekleyen davet 409.
    await invite(leader, clubId, guest.username).expect(201);
    expect((await invite(leader, clubId, guest.username).expect(409)).body.error.code).toBe('CLUB_INVITE_EXISTS');

    // Başkasının davetine yanıt verilemez — varlığı sızmaz (404).
    const [pending] = await invitesOf(guest);
    await respond(stranger, pending!.id, 'accept').expect(404);
    await respond(stranger, pending!.id, 'decline').expect(404);
    expect(await statusOf(pending!.id)).toBe('pending');

    // Engel iki yönde: davetli lideri engellediyse de lider davetliyi engellediyse de 403.
    const blockedGuest = await registerTestPlayer(app, 'Engelli Davetli');
    await pool.query('INSERT INTO player_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [blockedGuest.playerId, leader.playerId]);
    expect((await invite(leader, clubId, blockedGuest.username).expect(403)).body.error.code).toBe('PLAYER_BLOCKED');
    const blockedByLeader = await registerTestPlayer(app, 'Engellenen Davetli');
    await pool.query('INSERT INTO player_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [leader.playerId, blockedByLeader.playerId]);
    expect((await invite(leader, clubId, blockedByLeader.username).expect(403)).body.error.code).toBe('PLAYER_BLOCKED');
    expect(
      (await pool.query('SELECT 1 FROM club_invites WHERE invitee_id = ANY($1::uuid[])', [[blockedGuest.playerId, blockedByLeader.playerId]]))
        .rowCount,
    ).toBe(0);

    // Subay davet edebilir.
    await http()
      .post(`/api/v1/clubs/${clubId}/members/${member.playerId}/role`)
      .set('Authorization', leader.authHeader)
      .send({ role: 'officer' })
      .expect(200);
    await invite(member, clubId, stranger.username).expect(201);
  });

  it('bekleyen davet sınırı; süresi dolan davet sayılmaz ve kabul edilemez', async () => {
    const leader = await registerTestPlayer(app, 'Sınır Lideri');
    const clubId = await createClub(leader);
    const limit = online.club.invites.maxPendingPerClub;
    const guests: RegisteredTestPlayer[] = [];
    for (let index = 0; index <= limit; index += 1) {
      guests.push(await registerTestPlayer(app, `Sınır Davetli ${index}`));
    }
    for (const guest of guests.slice(0, limit)) {
      await invite(leader, clubId, guest.username).expect(201);
    }
    const overflow = guests[limit]!;
    expect((await invite(leader, clubId, overflow.username).expect(409)).body.error.code).toBe('CLUB_INVITE_LIMIT');

    // Bir davetin süresi dolar: listeden düşer, kabulü 409 + `expired`, yeri açılır.
    const first = guests[0]!;
    const [pending] = await invitesOf(first);
    await pool.query("UPDATE club_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [pending!.id]);
    expect(await invitesOf(first)).toEqual([]);
    expect((await respond(first, pending!.id, 'accept').expect(409)).body.error.code).toBe('CLUB_INVITE_EXPIRED');
    expect(await statusOf(pending!.id)).toBe('expired');
    expect((await pool.query('SELECT 1 FROM club_members WHERE player_id = $1', [first.playerId])).rowCount).toBe(0);
    await invite(leader, clubId, overflow.username).expect(201);
  });

  it('dolu kulübün davetini kabul etmek 409 CLUB_FULL; davet bekler', async () => {
    const leader = await registerTestPlayer(app, 'Dolu Davet Lideri');
    const guest = await registerTestPlayer(app, 'Dolu Davetli');
    const clubId = await createClub(leader);
    await invite(leader, clubId, guest.username).expect(201);
    for (let index = 0; index < online.club.maxMembers - 1; index += 1) {
      const filler = await registerTestPlayer(app, `Davet Dolgu ${index}`);
      await pool.query("INSERT INTO club_members (player_id, club_id, role) VALUES ($1, $2, 'member')", [filler.playerId, clubId]);
    }
    const [pending] = await invitesOf(guest);
    expect((await respond(guest, pending!.id, 'accept').expect(409)).body.error.code).toBe('CLUB_FULL');
    expect(await statusOf(pending!.id)).toBe('pending');
  });

  it('aynı oyuncunun iki daveti eşzamanlı kabul edilirse yalnızca biri üyelik yazar', async () => {
    const leaderA = await registerTestPlayer(app, 'Eşzamanlı A');
    const leaderB = await registerTestPlayer(app, 'Eşzamanlı B');
    const guest = await registerTestPlayer(app, 'Eşzamanlı Davetli');
    const clubA = await createClub(leaderA);
    const clubB = await createClub(leaderB);
    await invite(leaderA, clubA, guest.username).expect(201);
    await invite(leaderB, clubB, guest.username).expect(201);
    const ids = (await invitesOf(guest)).map((item) => item.id);

    const responses = await sendConcurrentRequests(2, (index) => respond(guest, ids[index]!, 'accept'));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);
    expect((await pool.query('SELECT 1 FROM club_members WHERE player_id = $1', [guest.playerId])).rowCount).toBe(1);
  });
});
