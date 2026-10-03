import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { ErrorCode, type AnnouncementView } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, uniqueUsername, type RegisteredTestPlayer } from './test-helpers';

/**
 * MODERASYON + DUYURU (02.10.2026, Faz 10 + 11-A, migration 0060).
 *
 * Kanıtlanan şeyler:
 * - Askı: oyuncunun her isteği, soketi, yeni girişi ve yenilemesi 403
 *   ACCOUNT_SUSPENDED (401 DEĞİL); kaldırınca erişim aynı token'la döner.
 * - Moderatör askı verebilir (sınıra kadar) ama yasak veremez/kaldıramaz;
 *   yasak oturumları kapatır.
 * - Kendine/personele yaptırım yok; yetkisiz 403 (var olmayan hedefte de
 *   önce 403 — IDOR kapısı).
 * - Rol ataması: yalnızca yönetici, kendi rolü değişmez, denetime yazılır,
 *   anında etkili.
 * - Her yazma denetim günlüğüne AYNI transaction'da düşer.
 * - Duyuru: yönetici açar/arşivler, sınır aşılmaz, oyuncular yalnızca
 *   yayındakini görür (oturumsuz da).
 */
describe('Moderasyon + duyurular (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let baseUrl: string;
  const config = loadModerationConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function staff(role: 'admin' | 'moderator', name: string): Promise<RegisteredTestPlayer> {
    const player = await registerTestPlayer(app, name);
    await pool.query('UPDATE players SET is_admin = $2, is_moderator = $3 WHERE id = $1', [
      player.playerId,
      role === 'admin',
      role === 'moderator',
    ]);
    return player;
  }

  const me = (player: RegisteredTestPlayer) =>
    request(server()).get(`/api/v1/players/${player.playerId}`).set('Authorization', player.authHeader);
  const sanction = (actor: RegisteredTestPlayer, targetId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/v1/admin/players/${targetId}/sanctions`)
      .set('Authorization', actor.authHeader)
      .send(body);
  const lift = (actor: RegisteredTestPlayer, sanctionId: string, reason = 'itiraz kabul edildi') =>
    request(server())
      .post(`/api/v1/admin/sanctions/${sanctionId}/lift`)
      .set('Authorization', actor.authHeader)
      .send({ reason });

  async function auditActions(targetId: string): Promise<string[]> {
    const result = await pool.query<{ action: string }>(
      'SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at, id',
      [targetId],
    );
    return result.rows.map((row) => row.action);
  }

  it('askı: istek, soket, giriş, yenileme 403; kaldırınca AYNI token geri döner', async () => {
    const moderator = await staff('moderator', 'Moderatör');
    const target = await registerTestPlayer(app, 'Askıya Alınan');
    const email = `${uniqueUsername('aski')}@ornek.com`;
    await request(server())
      .post('/api/v1/auth/credentials')
      .set('Authorization', target.authHeader)
      .send({ email, password: 'sifre-12345' })
      .expect(201);
    const session = (
      await request(server()).post('/api/v1/auth/login/password').send({ email, password: 'sifre-12345' }).expect(200)
    ).body.data as { token: string; refreshToken: string };

    const created = await sanction(moderator, target.playerId, {
      kind: 'suspend',
      reason: 'sohbette hakaret',
      durationHours: 24,
    }).expect(201);
    expect(created.body.data).toMatchObject({ kind: 'suspend', active: true, reason: 'sohbette hakaret' });

    const denied = await me(target).expect(403);
    expect(denied.body.error.code).toBe(ErrorCode.AccountSuspended);
    expect(denied.body.error.message).toMatch(/askıya alındı/);
    const login = await request(server())
      .post('/api/v1/auth/login/password')
      .send({ email, password: 'sifre-12345' })
      .expect(403);
    expect(login.body.error.code).toBe(ErrorCode.AccountSuspended);
    await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(403);

    const socket = io(`${baseUrl}/races`, { auth: { token: target.token }, transports: ['websocket'], forceNew: true });
    const outcome = await new Promise<string>((resolve) => {
      socket.on('connect_error', () => resolve('rejected'));
      socket.on('connect', () => resolve('connected'));
      setTimeout(() => resolve('timeout'), 2000);
    });
    socket.disconnect();
    expect(outcome).toBe('rejected');

    await lift(moderator, created.body.data.id as string).expect(200);
    await me(target).expect(200);
    expect(await auditActions(target.playerId)).toEqual(['player.sanctioned', 'player.sanction_lifted']);
  });

  it('süresi dolan askı kendiliğinden biter', async () => {
    const moderator = await staff('moderator', 'Moderatör 2');
    const target = await registerTestPlayer(app, 'Kısa Askı');
    const created = await sanction(moderator, target.playerId, { kind: 'suspend', reason: 'spam yapıyor', durationHours: 1 }).expect(201);
    await me(target).expect(403);
    await pool.query("UPDATE player_sanctions SET expires_at = now() - interval '1 second', created_at = now() - interval '2 hours' WHERE id = $1", [
      created.body.data.id,
    ]);
    await me(target).expect(200);
  });

  it('moderatör: sınır üstü askı 400, yasak 403; yönetici yasaklar ve oturumlar kapanır', async () => {
    const moderator = await staff('moderator', 'Moderatör 3');
    const admin = await staff('admin', 'Yönetici');
    const target = await registerTestPlayer(app, 'Yasaklanan');

    const tooLong = await sanction(moderator, target.playerId, {
      kind: 'suspend',
      reason: 'uzun askı denemesi',
      durationHours: config.sanctions.moderatorMaxSuspendHours + 1,
    }).expect(400);
    expect(tooLong.body.error.code).toBe(ErrorCode.InvalidSanction);
    await sanction(moderator, target.playerId, { kind: 'ban', reason: 'hile kullanımı' }).expect(403);

    const ban = await sanction(admin, target.playerId, { kind: 'ban', reason: 'hile kullanımı' }).expect(201);
    expect(ban.body.data.expiresAt).toBeNull();
    const open = await pool.query('SELECT 1 FROM auth_sessions WHERE player_id = $1 AND revoked_at IS NULL', [target.playerId]);
    expect(open.rows).toHaveLength(0);
    // Yasağı moderatör kaldıramaz.
    await lift(moderator, ban.body.data.id as string).expect(403);
    const history = await request(server())
      .get(`/api/v1/admin/players/${target.playerId}/sanctions`)
      .set('Authorization', moderator.authHeader)
      .expect(200);
    expect(history.body.data.map((s: { kind: string; active: boolean }) => [s.kind, s.active])).toEqual([['ban', true]]);
  });

  it('kendine/personele yaptırım yok; oyuncu 403; var olmayan hedefte önce 403', async () => {
    const admin = await staff('admin', 'Yönetici 2');
    const moderator = await staff('moderator', 'Moderatör 4');
    const player = await registerTestPlayer(app, 'Sıradan');

    const self = await sanction(admin, admin.playerId, { kind: 'suspend', reason: 'kendime deneme', durationHours: 1 }).expect(409);
    expect(self.body.error.code).toBe(ErrorCode.SanctionTargetNotAllowed);
    await sanction(admin, moderator.playerId, { kind: 'suspend', reason: 'personel denemesi', durationHours: 1 }).expect(409);

    const forbidden = await sanction(player, randomUUID(), { kind: 'suspend', reason: 'yetkisiz deneme', durationHours: 1 }).expect(403);
    expect(forbidden.body.error.code).toBe(ErrorCode.AdminRequired);
    await sanction(admin, randomUUID(), { kind: 'suspend', reason: 'hayalet oyuncu', durationHours: 1 }).expect(404);
  });

  it('rol ataması: yalnızca yönetici, kendi rolü değişmez, anında etkili, denetime yazılır', async () => {
    const admin = await staff('admin', 'Yönetici 3');
    const moderator = await staff('moderator', 'Moderatör 5');
    const target = await registerTestPlayer(app, 'Terfi Eden');
    const setRole = (actor: RegisteredTestPlayer, id: string, role: unknown) =>
      request(server()).put(`/api/v1/admin/players/${id}/role`).set('Authorization', actor.authHeader).send({ role });

    await setRole(moderator, target.playerId, 'moderator').expect(403);
    const own = await setRole(admin, admin.playerId, 'player').expect(400);
    expect(own.body.error.code).toBe(ErrorCode.InvalidRoleChange);
    await setRole(admin, target.playerId, 'superuser').expect(400);

    // Önce yetkisiz → terfi → aynı token'la şikâyet kuyruğu açılır.
    await request(server()).get('/api/v1/admin/reports').set('Authorization', target.authHeader).expect(403);
    const changed = await setRole(admin, target.playerId, 'moderator').expect(200);
    expect(changed.body.data).toEqual({ from: 'player', to: 'moderator' });
    await request(server()).get('/api/v1/admin/reports').set('Authorization', target.authHeader).expect(200);
    // Moderatör yönetici uçlarına giremez.
    await request(server()).get('/api/v1/admin/transactions').set('Authorization', target.authHeader).expect(403);
    expect((await me(target).expect(200)).body.data).toMatchObject({ isModerator: true, isAdmin: false });

    await setRole(admin, target.playerId, 'player').expect(200);
    await request(server()).get('/api/v1/admin/reports').set('Authorization', target.authHeader).expect(403);
    const details = await pool.query<{ details: { from: string; to: string } }>(
      "SELECT details FROM admin_audit_log WHERE target_id = $1 AND action = 'player.role_changed' ORDER BY created_at, id",
      [target.playerId],
    );
    expect(details.rows.map((row) => row.details)).toEqual([
      { from: 'player', to: 'moderator' },
      { from: 'moderator', to: 'player' },
    ]);
  });

  it('oyuncu listesi rol ve etkin yaptırımı gösterir (moderatör de görür)', async () => {
    const moderator = await staff('moderator', 'Moderatör 6');
    const target = await registerTestPlayer(app, 'Listede Askılı');
    await sanction(moderator, target.playerId, { kind: 'suspend', reason: 'kural ihlali', durationHours: 2 }).expect(201);
    const list = await request(server()).get('/api/v1/admin/players').set('Authorization', moderator.authHeader).expect(200);
    const row = (list.body.data.players as Array<{ playerId: string; activeSanction: unknown; isModerator: boolean }>).find(
      (p) => p.playerId === target.playerId,
    );
    expect(row?.activeSanction).toMatchObject({ kind: 'suspend' });
    expect(row?.isModerator).toBe(false);
  });

  describe('duyurular', () => {
    it('yönetici açar → oturumsuz oyuncu görür → arşivlenince kaybolur; moderatör açamaz', async () => {
      const admin = await staff('admin', 'Duyurucu');
      const moderator = await staff('moderator', 'Moderatör 7');
      const body = { title: 'Bakım', body: 'Gece 03:00-04:00 bakım var.', level: 'maintenance' };

      await request(server()).post('/api/v1/admin/announcements').set('Authorization', moderator.authHeader).send(body).expect(403);
      const bad = await request(server())
        .post('/api/v1/admin/announcements')
        .set('Authorization', admin.authHeader)
        .send({ ...body, level: 'acil' })
        .expect(400);
      expect(bad.body.error.code).toBe(ErrorCode.InvalidAnnouncement);

      const created = await request(server())
        .post('/api/v1/admin/announcements')
        .set('Authorization', admin.authHeader)
        .send(body)
        .expect(201);
      expect(created.body.data).toMatchObject({ title: 'Bakım', live: true, archivedAt: null });

      const live = (await request(server()).get('/api/v1/announcements').expect(200)).body.data as AnnouncementView[];
      expect(live.map((a) => a.id)).toContain(created.body.data.id);
      expect(Object.keys(live[0]!).sort()).toEqual(['body', 'endsAt', 'id', 'level', 'startsAt', 'title']);

      await request(server())
        .post(`/api/v1/admin/announcements/${created.body.data.id}/archive`)
        .set('Authorization', admin.authHeader)
        .expect(200);
      const after = (await request(server()).get('/api/v1/announcements').expect(200)).body.data as AnnouncementView[];
      expect(after.map((a) => a.id)).not.toContain(created.body.data.id);
      await request(server())
        .post(`/api/v1/admin/announcements/${created.body.data.id}/archive`)
        .set('Authorization', admin.authHeader)
        .expect(404);
      expect(await auditActions(created.body.data.id as string)).toEqual(['announcement.created', 'announcement.archived']);
    });

    it('ileri tarihli duyuru henüz görünmez; yayın sınırı aşılamaz', async () => {
      const admin = await staff('admin', 'Duyurucu 2');
      // Temiz sayım: önceki testlerden kalan yayındaki duyuruları arşivle.
      await pool.query('UPDATE announcements SET archived_at = now(), archived_by = $1 WHERE archived_at IS NULL', [
        admin.playerId,
      ]);
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const scheduled = await request(server())
        .post('/api/v1/admin/announcements')
        .set('Authorization', admin.authHeader)
        .send({ title: 'Yarın etkinlik', body: 'Hazır olun.', level: 'info', startsAt: future })
        .expect(201);
      expect(scheduled.body.data.live).toBe(false);
      const live = (await request(server()).get('/api/v1/announcements').expect(200)).body.data as AnnouncementView[];
      expect(live.map((a) => a.id)).not.toContain(scheduled.body.data.id);

      for (let index = 1; index < config.announcements.maxLive; index += 1) {
        await request(server())
          .post('/api/v1/admin/announcements')
          .set('Authorization', admin.authHeader)
          .send({ title: `Duyuru ${index}`, body: 'metin', level: 'info' })
          .expect(201);
      }
      const full = await request(server())
        .post('/api/v1/admin/announcements')
        .set('Authorization', admin.authHeader)
        .send({ title: 'Fazla', body: 'metin', level: 'info', startsAt: future })
        .expect(409);
      expect(full.body.error.code).toBe(ErrorCode.AnnouncementLimitReached);
    });
  });
});
