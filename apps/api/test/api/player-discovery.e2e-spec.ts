import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSocialConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, recordSharedFinishedRace, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * 16.10.2026 — sosyal brief §3: oyuncu arama, profil ilişkisi, çevrimiçi
 * durumu (yalnızca arkadaşa) ve gizlilik ayarı.
 */
describe('Oyuncu arama + ilişki + çevrimiçi durumu (e2e)', () => {
  const social = loadSocialConfig();
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const search = async (player: RegisteredTestPlayer, q: string) =>
    (await http().get('/api/v1/social/search').query({ q }).set('Authorization', player.authHeader).expect(200)).body
      .data as Array<{ playerId: string; username: string; relation: string }>;

  const relationship = async (player: RegisteredTestPlayer, other: RegisteredTestPlayer) =>
    (
      await http()
        .get(`/api/v1/players/${player.playerId}/relationship/${other.playerId}`)
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;

  async function befriend(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    await recordSharedFinishedRace(app, [a, b]);
    const created = await http()
      .post(`/api/v1/players/${a.playerId}/friend-requests`)
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${b.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  it('kimlikle tam eşleşme ve kullanıcı adı ön ekiyle bulur; kısa sorgu boş döner, kendisi "self"', async () => {
    const seeker = await registerTestPlayer(app, 'Arayan');
    const target = await registerTestPlayer(app, 'Aranan');

    const byId = await search(seeker, target.playerId);
    expect(byId).toHaveLength(1);
    expect(byId[0]).toMatchObject({ playerId: target.playerId, username: target.username, relation: 'none' });

    const byPrefix = await search(seeker, `@${target.username}`);
    expect(byPrefix.map((row) => row.playerId)).toContain(target.playerId);
    expect(byPrefix[0]!.playerId).toBe(target.playerId); // tam eşleşme önce

    expect(await search(seeker, target.username.slice(0, social.playerSearch.minQueryLength - 1))).toEqual([]);
    expect((await search(seeker, seeker.playerId))[0]).toMatchObject({ relation: 'self' });
  });

  it('kullanıcı adındaki "_" LIKE jokeri gibi davranmaz', async () => {
    const seeker = await registerTestPlayer(app, 'Joker Arayan');
    const target = await registerTestPlayer(app, 'Joker Hedef');
    // "test_xxxx" → "testa" ön eki onu BULMAMALI ("_" tek karakter jokeri olsaydı bulurdu).
    const wrong = `${target.username.slice(0, 4)}a${target.username.slice(5)}`;
    expect((await search(seeker, wrong)).map((row) => row.playerId)).not.toContain(target.playerId);
  });

  it('engelli çift (iki yön) ve silinmiş hesap aramada görünmez', async () => {
    const seeker = await registerTestPlayer(app, 'Engel Arayan');
    const blocker = await registerTestPlayer(app, 'Engelleyen');
    const deleted = await registerTestPlayer(app, 'Silinen');
    await http()
      .post(`/api/v1/players/${blocker.playerId}/blocks`)
      .set('Authorization', blocker.authHeader)
      .send({ blockedId: seeker.playerId })
      .expect(201);
    await pool.query('UPDATE players SET deleted_at = now() WHERE id = $1', [deleted.playerId]);

    expect(await search(seeker, blocker.playerId)).toEqual([]);
    expect(await search(blocker, seeker.playerId)).toEqual([]);
    expect(await search(seeker, deleted.playerId)).toEqual([]);
    expect((await relationship(seeker, blocker)).status).toBe('blocked');
  });

  it('ilişki: birlikte yarışmadan istek kapalı ve sebebi söylenir; yarıştan sonra istek → outgoing/incoming → friend', async () => {
    const a = await registerTestPlayer(app, 'İlişki A');
    const b = await registerTestPlayer(app, 'İlişki B');

    expect(await relationship(a, b)).toMatchObject({
      status: 'none',
      canSendFriendRequest: false,
      friendRequestBlockedReason: 'needs_shared_race',
      presence: null,
    });

    await recordSharedFinishedRace(app, [a, b]);
    expect(await relationship(a, b)).toMatchObject({ status: 'none', canSendFriendRequest: true });

    const created = await http()
      .post(`/api/v1/players/${a.playerId}/friend-requests`)
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    expect(await relationship(a, b)).toMatchObject({ status: 'outgoing' });
    expect(await relationship(b, a)).toMatchObject({ status: 'incoming', requestId: created.body.data.requestId });
    expect((await search(b, a.playerId))[0]).toMatchObject({ relation: 'incoming' });

    await http()
      .post(`/api/v1/players/${b.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
    const friend = await relationship(a, b);
    expect(friend.status).toBe('friend');
    expect(friend.presence).not.toBeNull();

    // Başkasının adına ilişki sorulamaz.
    await http()
      .get(`/api/v1/players/${b.playerId}/relationship/${a.playerId}`)
      .set('Authorization', a.authHeader)
      .expect(403);
  });

  it('çevrimiçi durumu: nabız → online; eski nabız → offline + son görülme; gizlilik → hidden; liste çevrimiçi önce', async () => {
    const me = await registerTestPlayer(app, 'Durum Ben');
    const online = await registerTestPlayer(app, 'Durum Açık');
    const away = await registerTestPlayer(app, 'Durum Uzak');
    await befriend(me, online);
    await befriend(me, away);

    await http().post('/api/v1/presence/heartbeat').set('Authorization', online.authHeader).expect(200);
    const old = new Date(Date.now() - (social.presence.onlineWindowSeconds + 60) * 1000);
    await pool.query('UPDATE players SET last_seen_at = $2 WHERE id = $1', [away.playerId, old]);

    const overview = async () =>
      (await http().get(`/api/v1/players/${me.playerId}/social`).set('Authorization', me.authHeader).expect(200)).body
        .data.friends as Array<{ playerId: string; presence: { state: string; lastSeenAt: string | null } }>;

    let friends = await overview();
    expect(friends.map((friend) => friend.playerId)).toEqual([online.playerId, away.playerId]);
    expect(friends[0]!.presence.state).toBe('online');
    expect(friends[1]!.presence).toEqual({ state: 'offline', lastSeenAt: old.toISOString() });

    // Gizlilik: durum ve son görülme sızmaz.
    await http()
      .put(`/api/v1/players/${online.playerId}/privacy`)
      .set('Authorization', online.authHeader)
      .send({ showOnlineStatus: false })
      .expect(200);
    friends = await overview();
    expect(friends.find((friend) => friend.playerId === online.playerId)!.presence).toEqual({
      state: 'hidden',
      lastSeenAt: null,
    });
    expect(
      (await http().get(`/api/v1/players/${online.playerId}/privacy`).set('Authorization', online.authHeader).expect(200))
        .body.data,
    ).toEqual({ showOnlineStatus: false });
  });

  it('gizlilik ucu: geçersiz gövde 400, başkasının ayarı 403', async () => {
    const a = await registerTestPlayer(app, 'Gizlilik A');
    const b = await registerTestPlayer(app, 'Gizlilik B');
    await http()
      .put(`/api/v1/players/${a.playerId}/privacy`)
      .set('Authorization', a.authHeader)
      .send({ showOnlineStatus: 'evet' })
      .expect(400);
    await http()
      .put(`/api/v1/players/${b.playerId}/privacy`)
      .set('Authorization', a.authHeader)
      .send({ showOnlineStatus: false })
      .expect(403);
  });

  it('nabız sık yazılmaz: aralık içinde ikinci nabız last_seen_at değiştirmez', async () => {
    const player = await registerTestPlayer(app, 'Nabız');
    await http().post('/api/v1/presence/heartbeat').set('Authorization', player.authHeader).expect(200);
    const first = (await pool.query('SELECT last_seen_at FROM players WHERE id = $1', [player.playerId])).rows[0]
      .last_seen_at as Date;
    await http().post('/api/v1/presence/heartbeat').set('Authorization', player.authHeader).expect(200);
    const second = (await pool.query('SELECT last_seen_at FROM players WHERE id = $1', [player.playerId])).rows[0]
      .last_seen_at as Date;
    expect(second.getTime()).toBe(first.getTime());
  });
});
