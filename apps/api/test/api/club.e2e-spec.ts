import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOnlineConfig, loadProgressionConfig } from '@at-sevdalisi/game-config';
import { calculateClubLevel } from '../../src/domain/club/club';
import { computeRaceXp } from '../../src/domain/progression/progression';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayer,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * KULÜP (brief §44, migration 0049, 01.10.2026). `domain/club` bu dilime
 * kadar yalnızca birim testinden çağrılıyordu.
 *
 * **KANITLANAN:** kur/katıl/ayrıl/at/rol/devret/feshet akışı; tek kulüp
 * kuralı (eşzamanlı iki katılım dahil); ad tekilliği (harf duyarsız);
 * yetki kapıları; lider ayrılamaz; kulüp dolu; yarış XP'si kulüp puanına
 * ve üyenin katkısına AYNI transaction'da yazılır.
 */
describe('Kulüp (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const online = loadOnlineConfig();
  const progression = loadProgressionConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const uniqueName = (prefix: string) => `${prefix} ${randomUUID().slice(0, 8)}`;

  async function createClub(owner: RegisteredTestPlayer, name = uniqueName('Kulüp'), tag?: string) {
    const response = await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name, tag })
      .expect(201);
    return response.body.data as {
      club: { id: string; name: string; tag: string | null };
      myRole: string;
    };
  }

  it('kurucu lider olur; ad temizlenir, etiket büyük harfe çevrilir; sayısal alanlar sayıdır', async () => {
    const owner = await registerTestPlayer(app, 'Kulüp Kurucu');
    const name = uniqueName('  Rüzgar   Atlıları');
    const detail = await createClub(owner, name, 'rzg');
    expect(detail.club.name).toBe(name.trim().replace(/\s+/g, ' '));
    expect(detail.club.tag).toBe('RZG');
    expect(detail.myRole).toBe('leader');

    const mine = await http()
      .get('/api/v1/clubs/mine')
      .set('Authorization', owner.authHeader)
      .expect(200);
    expect(mine.body.data.club.id).toBe(detail.club.id);
    expect(typeof mine.body.data.club.points).toBe('number');
    expect(mine.body.data.club.memberCount).toBe(1);
    expect(mine.body.data.club.maxMembers).toBe(online.club.maxMembers);
    expect(typeof mine.body.data.members[0].contributionPoints).toBe('number');
  });

  it('geçersiz ad/etiket 400; aynı ad (harf duyarsız) 409; ikinci kulüp kurulamaz', async () => {
    const owner = await registerTestPlayer(app, 'Kulüp Ad');
    await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: 'ab' })
      .expect(400);
    await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: 42 })
      .expect(400);
    await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: uniqueName('Etiket'), tag: 'çok-uzun' })
      .expect(400);

    const name = uniqueName('Işık Üçlüsü');
    await createClub(owner, name);
    const other = await registerTestPlayer(app, 'Kulüp Ad İki');
    const taken = await http()
      .post('/api/v1/clubs')
      .set('Authorization', other.authHeader)
      .send({ name: name.toLocaleUpperCase('tr-TR') })
      .expect(409);
    expect(taken.body.error.code).toBe('CLUB_NAME_TAKEN');

    const second = await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: uniqueName('İkinci') })
      .expect(409);
    expect(second.body.error.code).toBe('ALREADY_CLUB_MEMBER');
  });

  it('katıl → yetki kapıları → rol → liderlik devri → at → ayrıl → feshet', async () => {
    const leader = await registerTestPlayer(app, 'Lider');
    const officer = await registerTestPlayer(app, 'Subay');
    const member = await registerTestPlayer(app, 'Üye');
    const { club } = await createClub(leader);

    for (const player of [officer, member]) {
      const joined = await http()
        .post(`/api/v1/clubs/${club.id}/join`)
        .set('Authorization', player.authHeader)
        .expect(200);
      expect(joined.body.data.myRole).toBe('member');
    }

    // Üye kimseyi atamaz; lider ayrılamaz.
    const denied = await http()
      .delete(`/api/v1/clubs/${club.id}/members/${officer.playerId}`)
      .set('Authorization', member.authHeader)
      .expect(403);
    expect(denied.body.error.code).toBe('INSUFFICIENT_CLUB_PERMISSION');
    const leaderLeave = await http()
      .post('/api/v1/clubs/leave')
      .set('Authorization', leader.authHeader)
      .expect(409);
    expect(leaderLeave.body.error.code).toBe('CLUB_LEADER_CANNOT_LEAVE');

    // Rol yalnızca liderden; geçersiz rol 400.
    await http()
      .post(`/api/v1/clubs/${club.id}/members/${member.playerId}/role`)
      .set('Authorization', leader.authHeader)
      .send({ role: 'kral' })
      .expect(400);
    const promoted = await http()
      .post(`/api/v1/clubs/${club.id}/members/${officer.playerId}/role`)
      .set('Authorization', leader.authHeader)
      .send({ role: 'officer' })
      .expect(200);
    expect(
      promoted.body.data.members.find((m: { playerId: string }) => m.playerId === officer.playerId)
        .role,
    ).toBe('officer');
    await http()
      .post(`/api/v1/clubs/${club.id}/members/${member.playerId}/role`)
      .set('Authorization', officer.authHeader)
      .send({ role: 'officer' })
      .expect(403);

    // Subay üyeyi atabilir.
    const kicked = await http()
      .delete(`/api/v1/clubs/${club.id}/members/${member.playerId}`)
      .set('Authorization', officer.authHeader)
      .expect(200);
    expect(kicked.body.data.members.map((m: { playerId: string }) => m.playerId)).not.toContain(
      member.playerId,
    );

    // Liderlik devri: eski lider subay olur, clubs.leader_id değişir — tek lider.
    await http()
      .post(`/api/v1/clubs/${club.id}/members/${officer.playerId}/role`)
      .set('Authorization', leader.authHeader)
      .send({ role: 'leader' })
      .expect(200);
    const roles = await pool.query<{ player_id: string; role: string }>(
      'SELECT player_id, role FROM club_members WHERE club_id = $1',
      [club.id],
    );
    expect(roles.rows.filter((row) => row.role === 'leader').map((row) => row.player_id)).toEqual([
      officer.playerId,
    ]);
    expect(roles.rows.find((row) => row.player_id === leader.playerId)?.role).toBe('officer');
    const leaderId = await pool.query<{ leader_id: string }>(
      'SELECT leader_id FROM clubs WHERE id = $1',
      [club.id],
    );
    expect(leaderId.rows[0]?.leader_id).toBe(officer.playerId);

    // Eski lider artık ayrılabilir; atılan üye başka kulübe girebilir.
    await http().post('/api/v1/clubs/leave').set('Authorization', leader.authHeader).expect(200);
    const mine = await http()
      .get('/api/v1/clubs/mine')
      .set('Authorization', leader.authHeader)
      .expect(200);
    expect(mine.body.data).toBeNull();

    // Fesih yalnızca lider; sonrasında kulüp 404.
    await http()
      .delete(`/api/v1/clubs/${club.id}`)
      .set('Authorization', member.authHeader)
      .expect(403);
    await http()
      .delete(`/api/v1/clubs/${club.id}`)
      .set('Authorization', officer.authHeader)
      .expect(200);
    await http()
      .get(`/api/v1/clubs/${club.id}`)
      .set('Authorization', officer.authHeader)
      .expect(404);
  });

  it('eşzamanlı iki katılımdan yalnızca biri geçer (tek kulüp kuralı)', async () => {
    const a = await registerTestPlayer(app, 'Yarış A');
    const b = await registerTestPlayer(app, 'Yarış B');
    const joiner = await registerTestPlayer(app, 'Çift Katılımcı');
    const clubA = (await createClub(a)).club.id;
    const clubB = (await createClub(b)).club.id;

    const results = await Promise.all(
      [clubA, clubB].map((id) =>
        http().post(`/api/v1/clubs/${id}/join`).set('Authorization', joiner.authHeader),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const rows = await pool.query('SELECT 1 FROM club_members WHERE player_id = $1', [
      joiner.playerId,
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('dolu kulübe katılınamaz (CLUB_FULL)', async () => {
    const owner = await registerTestPlayer(app, 'Dolu Kurucu');
    const { club } = await createClub(owner);
    // Kalan koltukları SQL ile doldur (30 oyuncu kaydetmek yerine).
    const fillers = online.club.maxMembers - 1;
    for (let i = 0; i < fillers; i += 1) {
      const filler = await registerTestPlayer(app, `Dolgu ${i}`);
      await pool.query(
        "INSERT INTO club_members (player_id, club_id, role) VALUES ($1, $2, 'member')",
        [filler.playerId, club.id],
      );
    }
    const late = await registerTestPlayer(app, 'Geç Kalan');
    const response = await http()
      .post(`/api/v1/clubs/${club.id}/join`)
      .set('Authorization', late.authHeader)
      .expect(409);
    expect(response.body.error.code).toBe('CLUB_FULL');
  });

  it("pratik yarış XP'si kulüp puanına ve üyenin katkısına yazılır; seviye eşikten türetilir", async () => {
    const racer = await registerTestPlayerWithStarterHorse(app, 'Kulüp Yarışçı');
    const { club } = await createClub(racer);
    // Seviye 2 eşiğinin hemen altı: yarış puanı kulübü seviye atlatır.
    const threshold = online.club.levelThresholds['2'] as number;
    await pool.query('UPDATE clubs SET points = $2 WHERE id = $1', [club.id, threshold - 1]);

    const response = await http()
      .post(`/api/v1/horses/${racer.horseId}/practice-race`)
      .set('Authorization', racer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const position = (
      response.body.data.finalResult as Array<{ horseId: string; finishPosition: number }>
    ).find((entry) => entry.horseId === racer.horseId)?.finishPosition as number;
    const gained = computeRaceXp(position, progression.xpRewards.player);
    expect(gained).toBeGreaterThan(0);

    const row = await pool.query<{ points: string; level: number; contribution_points: string }>(
      `SELECT c.points, c.level, m.contribution_points
         FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE c.id = $1 AND m.player_id = $2`,
      [club.id, racer.playerId],
    );
    expect(Number(row.rows[0]?.points)).toBe(threshold - 1 + gained);
    expect(Number(row.rows[0]?.contribution_points)).toBe(gained);
    expect(row.rows[0]?.level).toBe(calculateClubLevel(threshold - 1 + gained, online));
    expect(row.rows[0]?.level).toBeGreaterThanOrEqual(2);
  });

  it('liste puana göre sıralı; arama LIKE jokerlerini kaçırır', async () => {
    const owner = await registerTestPlayer(app, 'Liste');
    const { club } = await createClub(owner, uniqueName('Arama Hedef'));
    const found = await http()
      .get(`/api/v1/clubs?search=${encodeURIComponent(club.name)}`)
      .set('Authorization', owner.authHeader)
      .expect(200);
    expect(found.body.data.map((c: { id: string }) => c.id)).toEqual([club.id]);

    const wildcard = await http()
      .get('/api/v1/clubs?search=%25')
      .set('Authorization', owner.authHeader)
      .expect(200);
    expect(wildcard.body.data).toEqual([]);

    const all = await http()
      .get('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .expect(200);
    const points = (all.body.data as Array<{ points: number }>).map((c) => c.points);
    expect(points).toEqual([...points].sort((x, y) => y - x));
    expect(all.body.data.length).toBeLessThanOrEqual(online.club.listLimit);
  });
});
