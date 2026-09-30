import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * `GET /leaderboard` — brief §43 "Sıralamalar" (uç nokta 27.09.2026'da
 * yazılmıştı; **bu dosya 29.09.2026'da eklendi**).
 *
 * ## Neden bu dosya var
 *
 * Uç nokta ve ekranı (`apps/web/src/app/leaderboard/page.tsx`) aylardır
 * ÇALIŞIYORDU ama **hiçbir e2e testi yoktu** — yalnızca
 * `test/domain/ranking/leaderboard.spec.ts`teki saf sıralama mantığı
 * sınanıyordu. Yani "repository → use-case → controller → HTTP" zincirinin
 * gerçekten satır ürettiğini iddia eden hiçbir şey yoktu; bu, CLAUDE.md'nin
 * "bir özelliğin sadece endpoint'i var diye tamam sayma" kuralının tam
 * olarak yasakladığı durumdur.
 *
 * ## Bu testin ASIL konusu: `username`
 *
 * 29.09.2026'da sıralama satırındaki ad `/profile/:username`e BAĞLANDI
 * (`LeaderboardRowView.username`). İstemci bir slug ÜRETMEZ — sunucudan
 * gelen `username`i olduğu gibi kullanır. Yani `username` yanlış/eksik
 * olursa ekran **ölü bir bağlantı** kurar ve bu **hiçbir yerde hata
 * üretmez** (boş bir `<a href="/profile/undefined">` de geçerli bir
 * bağlantıdır).
 *
 * ## Neden "benim oyuncum listede" DENMİYOR
 *
 * Sıralama GLOBAL'dir ve `LEADERBOARD_TOP_N = 50` ile kırpılır; test
 * dosyaları aynı veritabanını paylaştığı için bu dosyanın oyuncularının
 * ilk 50'ye gireceğini varsaymak KARARSIZ bir iddia olurdu (sıra, yarış
 * simülasyonunun sonucudur — CLAUDE.md "ÖDÜL SIRASI SİMÜLASYON SONUCUDUR").
 *
 * Bunun yerine iki KARARLI iddia kurulur:
 *   1. Dönen HER satırın `username`i, `players` tablosundaki gerçek değere
 *      EŞİTtir — yani JOIN doğru sütunu okuyor, alan uydurulmuyor.
 *   2. Dönen ilk satırın `username`i ile `GET /players/profile/:username`
 *      çağrıldığında 200 + AYNI `playerId` döner — yani ekranın kurduğu
 *      bağlantı GERÇEKTEN var olan bir rotaya gider.
 *
 * (1) için `rows.length > 0` ön koşulu bu dosyanın KENDİ kurduğu
 * kesinleşmiş yarışla sağlanır — yani test "hiç satır yokken geçen" boş bir
 * iddia DEĞİLDİR.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Sıralama (e2e) — GET /leaderboard', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';

  async function createRace(creator: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Sıralama Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    return response.body.data.id as string;
  }

  async function join(player: RegisteredTestPlayer & { horseId: string }, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
    // READY ŞARTI (30.09.2026): hazır demeyen katılım kilit/kesinleşme
    // anında iptal edilip iade edilir. Bu dosya koşan bir kadro ölçtüğü için
    // her katılım hazır işaretlenir (READY'nin kendisi `race-ready-gate`te).
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  /**
   * `start_time`ı geçmişe çeker — `POST /races` en az 60 saniye ileri bir
   * an zorunlu kılar (`race-lobby.config.json → startDelaySeconds.min`) ve
   * bu bir ÜRÜN kuralıdır; testin onu bekleyerek aşması paketin her koşusuna
   * bir dakika eklerdi. Gerekçenin tamamı `race-settlement.e2e-spec.ts`te.
   */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  /** Bu dosyanın `rows.length > 0` ön koşulunu kuran tek kurulum. */
  async function settleOneRace(): Promise<{ a: RegisteredTestPlayer; b: RegisteredTestPlayer }> {
    const a = await registerTestPlayerWithStarterHorse(app, 'Sıralamada Birinci Aday');
    const b = await registerTestPlayerWithStarterHorse(app, 'Sıralamada İkinci Aday');
    const raceId = await createRace(a);
    await join(a, raceId);
    await join(b, raceId);
    await makeRaceStarted(raceId);
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', a.authHeader)
      .expect(200);
    return { a, b };
  }

  it('her satırın `username`i `players` tablosundaki GERÇEK değerdir', async () => {
    await settleOneRace();

    // Uç nokta `@Public()`tir — bu istek BİLİNÇLİ olarak Authorization
    // header'ı GÖNDERMEZ. Gönderilseydi `@Public()` kaldırıldığında test
    // yine geçerdi ve "ziyaretçi de panoyu görebilir" özelliği sessizce
    // kaybolurdu.
    const response = await request(app.getHttpServer()).get('/api/v1/leaderboard').expect(200);
    const rows = response.body.data as { rank: number; playerId: string; username: string; displayName: string }[];

    // Bu dosyanın kurduğu yarış kesinleştiği için bu iddia boş DEĞİLDİR.
    expect(rows.length).toBeGreaterThan(0);

    const players = await pool.query<{ id: string; username: string }>('SELECT id, username FROM players');
    const usernameById = new Map(players.rows.map((row) => [row.id, row.username]));

    for (const row of rows) {
      // Boş metin de bir "string"tir; bu yüzden uzunluk da iddia edilir.
      expect(typeof row.username).toBe('string');
      expect(row.username.length).toBeGreaterThan(0);
      expect(row.username).toBe(usernameById.get(row.playerId));
    }
  });

  it('sıralamadaki ad `/profile/:username`e giden GERÇEK bir rotadır', async () => {
    await settleOneRace();

    const leaderboard = await request(app.getHttpServer()).get('/api/v1/leaderboard').expect(200);
    const first = (leaderboard.body.data as { playerId: string; username: string }[])[0]!;

    // İstemcinin ürettiği adresin AYNISI: `/profile/<sunucudan gelen username>`.
    const profile = await request(app.getHttpServer())
      .get(`/api/v1/players/profile/${first.username}`)
      .expect(200);

    expect(profile.body.data.playerId).toBe(first.playerId);
    // Profil ucu bakiyeyi SIZDIRMAZ (`@Public()`) — bu dosyanın konusu
    // değildir ama sıralamadan profile geçişin bu kuralı bozmadığını
    // burada hatırlatmak bedava.
    expect(profile.body.data.money).toBeUndefined();
    expect(profile.body.data.gems).toBeUndefined();
  });
});
