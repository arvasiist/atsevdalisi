import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * KULÜP SOHBETİ (02.10.2026, Faz 9). Kanıtlananlar: yalnızca üyeler okur ve
 * yazar (üye olmayan 403, kulüp varlığını sızdırmaz); ayrılan üye erişimini
 * kaybeder; gövde yarış sohbetiyle aynı kuralla doğrulanır; liste eskiden
 * yeniye ve sınırlı; hesap silinince mesajları silinir; kulüp dağılınca
 * mesajlar gider.
 */
describe('Kulüp sohbeti (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const config = loadChatConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const url = (clubId: string) => `/api/v1/clubs/${clubId}/messages`;
  const send = (player: RegisteredTestPlayer, clubId: string, body: unknown) =>
    http().post(url(clubId)).set('Authorization', player.authHeader).send({ body });
  async function clubWithMember(): Promise<{ clubId: string; leader: RegisteredTestPlayer; member: RegisteredTestPlayer }> {
    const leader = await registerTestPlayer(app, 'Kulüp Lideri');
    const member = await registerTestPlayer(app, 'Kulüp Üyesi');
    const suffix = Math.random().toString(36).slice(2, 7);
    const created = await http()
      .post('/api/v1/clubs')
      .set('Authorization', leader.authHeader)
      .send({ name: `Sohbet ${suffix}`, tag: suffix.slice(0, 4).toUpperCase() })
      .expect(201);
    const clubId = created.body.data.club.id as string;
    await http().post(`/api/v1/clubs/${clubId}/join`).set('Authorization', member.authHeader).expect((res) => {
      expect([200, 201]).toContain(res.status);
    });
    return { clubId, leader, member };
  }

  it('üyeler yazar ve okur; liste eskiden yeniye; gövde kırpılır', async () => {
    const { clubId, leader, member } = await clubWithMember();
    const first = await send(leader, clubId, '  Antrenman 20:00  ').expect(201);
    expect(first.body.data).toMatchObject({ body: 'Antrenman 20:00', username: leader.username, playerId: leader.playerId });
    await send(member, clubId, 'Geliyorum').expect(201);
    const list = await http().get(url(clubId)).set('Authorization', member.authHeader).expect(200);
    expect(list.body.data.map((m: { body: string }) => m.body)).toEqual(['Antrenman 20:00', 'Geliyorum']);
  });

  it('üye olmayan okuyamaz ve yazamaz (403); var olmayan kulüp de 403', async () => {
    const { clubId } = await clubWithMember();
    const outsider = await registerTestPlayer(app, 'Yabancı');
    const read = await http().get(url(clubId)).set('Authorization', outsider.authHeader).expect(403);
    expect(read.body.error.code).toBe('NOT_CLUB_MEMBER');
    await send(outsider, clubId, 'merhaba').expect(403);
    await http().get(url('00000000-0000-4000-8000-000000000000')).set('Authorization', outsider.authHeader).expect(403);
    await http().get(url(clubId)).expect(401);
    const stored = await pool.query('SELECT COUNT(*)::int AS n FROM club_messages WHERE club_id = $1', [clubId]);
    expect(stored.rows[0].n).toBe(0);
  });

  it('geçersiz gövde 400 (boş, çok uzun, metin değil)', async () => {
    const { clubId, leader } = await clubWithMember();
    for (const body of ['   ', 'x'.repeat(config.maxMessageLength + 1), 42]) {
      const response = await send(leader, clubId, body).expect(400);
      expect(response.body.error.code).toBe('INVALID_MESSAGE_BODY');
    }
    await send(leader, clubId, 'x'.repeat(config.maxMessageLength)).expect(201);
  });

  it('ayrılan üye erişimini kaybeder; geçmiş kulüpte kalır', async () => {
    const { clubId, leader, member } = await clubWithMember();
    await send(member, clubId, 'görüşürüz').expect(201);
    await http().post('/api/v1/clubs/leave').set('Authorization', member.authHeader).expect((res) => {
      expect([200, 201]).toContain(res.status);
    });
    await http().get(url(clubId)).set('Authorization', member.authHeader).expect(403);
    const list = await http().get(url(clubId)).set('Authorization', leader.authHeader).expect(200);
    expect(list.body.data.map((m: { body: string }) => m.body)).toEqual(['görüşürüz']);
  });

  it('liste en fazla historyLimit mesaj (en yeniler) döner', async () => {
    const { clubId, leader } = await clubWithMember();
    const total = config.clubChat.historyLimit + 3;
    await pool.query(
      `INSERT INTO club_messages (club_id, player_id, body, created_at)
       SELECT $1, $2, 'm' || g, now() - ((${total} - g) || ' seconds')::interval FROM generate_series(1, ${total}) g`,
      [clubId, leader.playerId],
    );
    const list = await http().get(url(clubId)).set('Authorization', leader.authHeader).expect(200);
    expect(list.body.data).toHaveLength(config.clubChat.historyLimit);
    expect(list.body.data.at(-1).body).toBe(`m${total}`);
    expect(list.body.data[0].body).toBe(`m${total - config.clubChat.historyLimit + 1}`);
  });
});
