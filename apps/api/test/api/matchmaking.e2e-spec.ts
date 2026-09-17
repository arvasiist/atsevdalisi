import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — `POST`/`DELETE
 * /matchmaking/queue` (brief §41 ONLINE MİMARİ, docs/API.md §9).
 * `race.e2e-spec.ts`/`market.e2e-spec.ts` ile AYNI bootstrap deseni ve
 * AYNI kısıt (GERÇEK PostgreSQL + Redis gerektirir, bu ortamda
 * ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — `POST /matchmaking/
 * queue` artık `HorseOwnerGuardByBodyField`, `DELETE /matchmaking/queue`
 * artık `HorseOwnerGuardByQueryField` ile korunur (bkz.
 * `matchmaking.controller.ts`) — istek sahibinin at'ın GERÇEK sahibi
 * olması gerekir.
 */
describe('Matchmaking — PvP Eşleştirme (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  // DÜZELTME (bu oturum, on dördüncü dilimin CI denemesi) — bu dosya,
  // projedeki DİĞER TÜM e2e dosyalarından (`market.e2e-spec.ts` vb.)
  // FARKLI bir izolasyon riski taşıyan İLK dosyadır: diğer tüm senaryolar
  // her testte YENİ/BENZERSİZ bir oyuncu+at (`uniqueUsername()`) yaratıp
  // yalnızca O KAYDIN id'sini sorguladığından, testler arasında hiçbir
  // paylaşılan tabloyu TEMİZLEMEYE gerek yoktu. Ama `findBestMatch`
  // (`domain/online/matchmaking.ts`) KASITLI olarak GLOBAL bir sorgu
  // yapar (`matchmaking_tickets`'teki TÜM biletler, brief §41'in gerçek
  // matchmaking tasarımı budur) — bu yüzden ÖNCEKİ bir testin (örn.
  // "kuyrukta hiç rakip yokken..." testinin KASITLI OLARAK kuyrukta
  // BIRAKTIĞI bilet) bir SONRAKİ testin "yeni oyuncu kuyruğa girsin"
  // varsayımını BOZMASI mümkündür — GERÇEK CI koşusunda tam olarak BU
  // OLDU (ikinci oyuncunun HEMEN eşleşmesi gereken test, ÖNCEKİ testin
  // bekleyen biletiyle eşleşip KENDİ beklenen rakibiyle DEĞİL o eski
  // biletle eşleşti; benzer şekilde "zaten kuyrukta" ve "DELETE" testleri
  // de kendi biletlerinin BEKLENMEDİK şekilde önceden tüketilmesinden
  // etkilendi). Bu, `matchmaking_tickets`'in KENDİSİNİN bir hatası DEĞİL
  // (production'da "havuzdaki ANY uygun rakiple eşleş" tam olarak istenen
  // davranıştır) — yalnızca bu TABLONUN, diğer tüm tablolardan farklı
  // olarak, test senaryoları arasında PAYLAŞILAN/GLOBAL bir kaynak
  // olmasının sonucu. Çözüm: her testten ÖNCE tabloyu boşalt, böylece her
  // test yalnızca KENDİ yarattığı biletleri görür (diğer tablolar —
  // `players`/`horses`/`races`/`pvp_matches` — hâlâ benzersiz id'lerle
  // izole kalmaya devam eder, onlara dokunulmaz).
  beforeEach(async () => {
    await pool.query('DELETE FROM matchmaking_tickets');
  });

  it('/api/v1/matchmaking/queue (POST) — kuyrukta hiç rakip yokken bileti kuyruğa ekler (matched: false)', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', authHeader)
      .send({ horseId })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.matched).toBe(false);
    expect(response.body.data.ticket.playerId).toBe(playerId);
    expect(response.body.data.ticket.horseId).toBe(horseId);

    const ticketRows = await pool.query('SELECT * FROM matchmaking_tickets WHERE player_id = $1', [playerId]);
    expect(ticketRows.rows).toHaveLength(1);
  });

  it('/api/v1/matchmaking/queue (POST) — ikinci bir oyuncu katılınca kuyruktaki oyuncuyla HEMEN eşleşir ve yarış simüle edilir', async () => {
    const playerA = await registerTestPlayerWithStarterHorse(app, 'Yarışçı A');
    const playerB = await registerTestPlayerWithStarterHorse(app, 'Yarışçı B');

    await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', playerA.authHeader)
      .send({ horseId: playerA.horseId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', playerB.authHeader)
      .send({ horseId: playerB.horseId })
      .expect(201);

    expect(response.body.data.matched).toBe(true);
    const match = response.body.data.match;
    expect(match.opponentPlayerId).toBe(playerA.playerId);
    expect(match.opponentHorseId).toBe(playerA.horseId);
    expect([playerA.playerId, playerB.playerId]).toContain(match.winnerId);
    expect(match.ownFinishPosition === 1 || match.ownFinishPosition === 2).toBe(true);
    expect(match.opponentFinishPosition).not.toBe(match.ownFinishPosition);

    // Eşleşme HEMEN olduğundan, iki tarafın da kuyrukta bileti KALMAMALI.
    const remainingTickets = await pool.query('SELECT * FROM matchmaking_tickets WHERE player_id = ANY($1)', [
      [playerA.playerId, playerB.playerId],
    ]);
    expect(remainingTickets.rows).toHaveLength(0);

    // Reyting GERÇEKTEN değişmiş olmalı (Elo, brief §43) — kazanan artar, kaybeden azalır.
    const ratingRows = await pool.query('SELECT id, rating FROM players WHERE id = ANY($1)', [
      [playerA.playerId, playerB.playerId],
    ]);
    const ratingById = new Map(ratingRows.rows.map((row: { id: string; rating: number }) => [row.id, row.rating]));
    expect(ratingById.get(match.winnerId)).toBeGreaterThan(1000);
    const loserId = match.winnerId === playerA.playerId ? playerB.playerId : playerA.playerId;
    expect(ratingById.get(loserId)).toBeLessThan(1000);

    // `races`/`race_entries`/`pvp_matches` GERÇEKTEN yazılmış olmalı.
    const raceRows = await pool.query('SELECT * FROM races WHERE id = $1', [match.raceId]);
    expect(raceRows.rows).toHaveLength(1);
    // AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — bkz. race.e2e-spec.ts'deki
    // AYNI assertion, migration 0021.
    expect(raceRows.rows[0].engine_version).toBe('1.0.0');
    expect(raceRows.rows[0].ruleset_version).toBe('1.1.0');
    expect(raceRows.rows[0].config_version).toBe('1.0.0');
    // AUDIT_REPORT.md R1 (bu oturum) — bkz. migration 0024.
    expect(raceRows.rows[0].weather_config_version).toBe('1.0.0');
    const entryRows = await pool.query('SELECT * FROM race_entries WHERE race_id = $1', [match.raceId]);
    expect(entryRows.rows).toHaveLength(2);
    const pvpMatchRows = await pool.query('SELECT * FROM pvp_matches WHERE id = $1', [match.matchId]);
    expect(pvpMatchRows.rows).toHaveLength(1);
    expect(pvpMatchRows.rows[0].winner_id).toBe(match.winnerId);
  });

  it('/api/v1/matchmaking/queue (POST) — zaten kuyrukta olan bir oyuncu tekrar katılmaya çalışırsa 409 ALREADY_IN_MATCHMAKING_QUEUE döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', authHeader)
      .send({ horseId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', authHeader)
      .send({ horseId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_IN_MATCHMAKING_QUEUE');
  });

  it('/api/v1/matchmaking/queue (POST) — sakatlanmış bir at için 409 HORSE_INJURED döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', authHeader)
      .send({ horseId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/matchmaking/queue (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer()).post('/api/v1/matchmaking/queue').send({ horseId });
    expect(response.status).toBe(401);
  });

  it('/api/v1/matchmaking/queue (POST) başkasının atıyla kuyruğa girmeye çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', attacker.authHeader)
      .send({ horseId: owner.horseId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/matchmaking/queue (POST) — var olmayan bir at için 404 HORSE_NOT_FOUND döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', someone.authHeader)
      .send({ horseId: randomUUID() });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/matchmaking/queue (POST) — geçersiz (UUID olmayan) bir horseId için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', someone.authHeader)
      .send({ horseId: 'not-a-uuid' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('/api/v1/matchmaking/queue (DELETE) — kuyruktaki bileti kaldırır', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', authHeader)
      .send({ horseId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/matchmaking/queue?horseId=${horseId}`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(response.body.data.playerId).toBe(playerId);

    const ticketRows = await pool.query('SELECT * FROM matchmaking_tickets WHERE player_id = $1', [playerId]);
    expect(ticketRows.rows).toHaveLength(0);
  });

  it('/api/v1/matchmaking/queue (DELETE) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer()).delete(`/api/v1/matchmaking/queue?horseId=${horseId}`);
    expect(response.status).toBe(401);
  });

  it('/api/v1/matchmaking/queue (DELETE) başkasının atının biletini kaldırmaya çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', owner.authHeader)
      .send({ horseId: owner.horseId })
      .expect(201);
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/matchmaking/queue?horseId=${owner.horseId}`)
      .set('Authorization', attacker.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/matchmaking/queue (DELETE) — kuyrukta olmayan bir oyuncu için 404 NOT_IN_MATCHMAKING_QUEUE döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/matchmaking/queue?horseId=${horseId}`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_IN_MATCHMAKING_QUEUE');
  });

  it('/api/v1/matchmaking/queue (DELETE) — var olmayan bir at için 404 HORSE_NOT_FOUND döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri Üç');
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/matchmaking/queue?horseId=${randomUUID()}`)
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/matchmaking/queue (DELETE) — geçersiz (UUID olmayan) bir horseId için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri Dört');
    const response = await request(app.getHttpServer())
      .delete('/api/v1/matchmaking/queue?horseId=not-a-uuid')
      .set('Authorization', someone.authHeader);
    expect(response.status).toBe(400);
  });
});
