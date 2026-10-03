import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_EXPORT_SECTIONS, type AccountDataExport } from '@at-sevdalisi/shared-types';
import {
  ACCOUNT_EXPORT_REPOSITORY,
  type AccountExportRepository,
} from '../../src/application/ports/account-export.repository';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * KİŞİSEL VERİ DIŞA AKTARMA (02.10.2026, Faz 1 — KVKK md. 11 / GDPR md. 15, 20).
 * Kanıtlananlar: (1) oyuncu KENDİ verisini alır, başkasınınkini değil;
 * (2) parola/token ÖZETLERİ, diğer oyuncuların iç kimlikleri, hakkındaki
 * şikâyetin sahibi ve yaptırımı veren yönetici YANITA GİRMEZ; (3) bölüm
 * sınırı aşılınca `truncated` doğru söyler.
 */
describe('Kişisel veri dışa aktarma (e2e)', () => {
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

  it('oturumsuz 401', async () => {
    await http().get('/api/v1/account/export').expect(401);
  });

  it('kendi verisi gelir; özetler, başkalarının iç kimlikleri ve şikâyetçi/yönetici kimliği sızmaz', async () => {
    const me = await registerTestPlayerWithStarterHorse(app, 'Dışa Aktaran');
    const friend = await registerTestPlayer(app, 'Mesajlaşan');
    const stranger = await registerTestPlayer(app, 'Yabancı');
    const admin = await registerTestPlayer(app, 'Yaptırımcı');
    const email = `aktar-${Date.now()}@ornek.com`;
    await http()
      .post('/api/v1/auth/credentials')
      .set('Authorization', me.authHeader)
      .send({ email, password: 'sifre-12345' })
      .expect(201);

    await pool.query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1, $2, 'Selam!'), ($2, $1, 'Merhaba'), ($2, $3, 'Başkasına')`,
      [me.playerId, friend.playerId, stranger.playerId],
    );
    await pool.query(
      `INSERT INTO player_reports (reporter_id, reported_id, category, reason) VALUES ($1, $2, 'spam', 'benim şikâyetim'), ($2, $1, 'spam', 'hakkımdaki şikâyet')`,
      [me.playerId, stranger.playerId],
    );
    await pool.query(
      `INSERT INTO player_sanctions (player_id, kind, reason, created_by, expires_at, lifted_at, lifted_by, lift_reason)
       VALUES ($1, 'suspend', 'eski uyarı', $2, now() + interval '1 hour', now(), $2, 'kaldırıldı')`,
      [me.playerId, admin.playerId],
    );

    const response = await http().get('/api/v1/account/export').set('Authorization', me.authHeader).expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    const data = response.body.data as AccountDataExport;
    expect(Object.keys(data.sections).sort()).toEqual([...ACCOUNT_EXPORT_SECTIONS].sort());
    expect(data.playerId).toBe(me.playerId);

    const account = data.sections.account.rows[0]!;
    expect(account.username).toBe(me.username);
    expect(account.email).toBe(email);
    expect(typeof account.money).toBe('number');
    expect(data.sections.horses.rows.map((h) => h.id)).toContain(me.horseId);
    expect(data.sections.sessions.rows.length).toBeGreaterThan(0);

    const messages = data.sections.messages.rows;
    expect(messages.map((m) => [m.direction, m.otherPlayer, m.body]).sort()).toEqual(
      [
        ['received', friend.username, 'Merhaba'],
        ['sent', friend.username, 'Selam!'],
      ].sort(),
    );
    expect(data.sections.reportsFiled.rows).toEqual([
      expect.objectContaining({ reportedPlayer: stranger.username, reason: 'benim şikâyetim' }),
    ]);
    expect(data.sections.sanctions.rows).toEqual([expect.objectContaining({ kind: 'suspend', reason: 'eski uyarı' })]);

    const raw = JSON.stringify(response.body);
    const secrets = await pool.query(
      `SELECT c.password_hash AS secret FROM player_credentials c WHERE c.player_id = $1
       UNION ALL SELECT refresh_token_hash FROM auth_sessions WHERE player_id = $1`,
      [me.playerId],
    );
    expect(secrets.rows.length).toBeGreaterThan(1);
    for (const { secret } of secrets.rows) expect(raw).not.toContain(secret);
    expect(raw).not.toMatch(/password|refresh_token|token_hash/i);
    // Diğer oyuncuların İÇ kimlikleri ve şikâyetçinin/yöneticinin kimliği yok.
    for (const other of [friend, stranger, admin]) expect(raw).not.toContain(other.playerId);
    expect(raw).not.toContain('hakkımdaki şikâyet');
    expect(raw).not.toContain('Başkasına');
    expect(raw).not.toContain(admin.username);
  });

  it('bölüm sınırı aşılınca en yeni satırlar + truncated', async () => {
    const me = await registerTestPlayer(app, 'Çok Bildirim');
    await pool.query(
      `INSERT INTO notifications (player_id, type, payload, created_at)
       SELECT $1, 'friend_request', '{}'::jsonb, now() - (g || ' minutes')::interval FROM generate_series(1, 3) g`,
      [me.playerId],
    );
    const repository = app.get<AccountExportRepository>(ACCOUNT_EXPORT_REPOSITORY);
    const limited = (await repository.exportSections(me.playerId, 2))!;
    expect(limited.notifications.rows).toHaveLength(2);
    expect(limited.notifications.truncated).toBe(true);
    const full = (await repository.exportSections(me.playerId, 3))!;
    expect(full.notifications.truncated).toBe(false);
    expect(full.notifications.rows).toHaveLength(3);
    expect(new Date(String(limited.notifications.rows[0]!.createdAt)).getTime()).toBeGreaterThan(
      new Date(String(limited.notifications.rows[1]!.createdAt)).getTime(),
    );
  });

  it('silinmiş hesabın verisi dışa aktarılmaz', async () => {
    const me = await registerTestPlayer(app, 'Silinecek');
    await pool.query('UPDATE players SET deleted_at = now() WHERE id = $1', [me.playerId]);
    const repository = app.get<AccountExportRepository>(ACCOUNT_EXPORT_REPOSITORY);
    expect(await repository.exportSections(me.playerId, 10)).toBeNull();
  });
});
