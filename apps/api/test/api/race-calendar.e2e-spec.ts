import { randomInt, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScheduleRaceCalendarUseCase } from '../../src/application/use-cases/schedule-race-calendar.use-case';
import { computeCalendarSlotTimes } from '../../src/domain/race/race-calendar';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceCalendarScheduler } from '../../src/infrastructure/scheduler/race-calendar.scheduler';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * YARIŞ TAKVİMİ (01.10.2026, migration 0052).
 *
 * **KANITLANAN:**
 *  1. Bir tur, config programlarının penceredeki HER yuvasını lobi yarışı
 *     olarak açar; yarışlar `GET /races`ta `calendar.programId` ile görünür
 *     ve tanımları config'le birebir aynıdır.
 *  2. Aynı anla ikinci tur HİÇBİR şey açmaz; iki eşzamanlı tur yuvayı İKİ
 *     kez açmaz (yuva kilidi + birincil anahtar).
 *  3. Başlangıcı geçmiş katılımsız takvim yarışı iptal edilir; iptal edilen
 *     yuva yeniden açılmaz.
 *  4. Takvim yarışı sıradan bir lobi yarışıdır: oyuncu katılır (ücret
 *     defterden düşer, havuza girer) ve hazır olur — `created_by` NULL
 *     bunu bozmaz.
 *
 * Saat: tur `now` parametresiyle sürülür (zamanlayıcı testte kapalıdır).
 * Geçmişte rastgele bir `now` seçilir ki tekrar koşumlarda yuvalar
 * çakışmasın ve diğer dosyaların gerçek-zamanlı yarışlarına karışmasın;
 * dosya sonunda bu dosyanın açtığı açık yarışlar iptal edilir.
 */
describe('Yarış takvimi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: RaceCalendarScheduler;
  let useCase: ScheduleRaceCalendarUseCase;
  let config: AppConfigService;
  const openedHere: string[] = [];

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(RaceCalendarScheduler);
    useCase = app.get(ScheduleRaceCalendarUseCase);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    if (openedHere.length > 0) {
      await pool.query(
        `UPDATE races SET status = 'cancelled' WHERE status = 'scheduled' AND id = ANY($1::uuid[])`,
        [openedHere],
      );
    }
    await app.close();
  });

  function pastNow(): Date {
    return new Date(Date.UTC(2020, 0, 1) + randomInt(0, 50_000) * MS_PER_HOUR);
  }

  function expectedSlotCount(now: Date): number {
    const { calendar } = config.raceLobby;
    return calendar.programs.reduce(
      // Program kendi ufkunu verebilir (02.10.2026 — haftalık özel yarış).
      (sum, program) =>
        sum +
        computeCalendarSlotTimes(now, program, { ...calendar, horizonHours: program.horizonHours ?? calendar.horizonHours })
          .length,
      0,
    );
  }

  it('bir tur penceredeki her yuvayı açar; yarışlar lobide programıyla ve config tanımıyla görünür', async () => {
    const now = pastNow();
    const result = await scheduler.tickNow(now);
    expect(result).not.toBeNull();
    openedHere.push(...(result?.opened ?? []));
    expect(result?.rejected).toBe(0);
    expect(result?.opened).toHaveLength(expectedSlotCount(now));

    const player = await registerTestPlayerWithStarterHorse(app, 'Takvim İzleyici');
    const lobby = await request(app.getHttpServer())
      .get('/api/v1/races')
      .query({ limit: '100' })
      .set('Authorization', player.authHeader)
      .expect(200);
    const listed = (
      lobby.body.data as Array<{
        id: string;
        name: string;
        entryFee: number;
        distanceMeters: number;
        surface: string;
        calendar: { programId: string } | null;
        tournament: unknown;
      }>
    ).filter((race) => result?.opened.includes(race.id));
    expect(listed.length).toBeGreaterThan(0);
    for (const race of listed) {
      const program = config.raceLobby.calendar.programs.find(
        (p) => p.id === race.calendar?.programId,
      );
      expect(program, race.name).toBeDefined();
      expect(race.name).toBe(program?.name);
      expect(race.entryFee).toBe(program?.entryFee);
      expect(typeof race.entryFee).toBe('number');
      expect(race.distanceMeters).toBe(program?.distanceMeters);
      expect(race.surface).toBe(program?.surface);
      expect(race.tournament).toBeNull();
    }

    const created = await pool.query<{ created_by: string | null }>(
      'SELECT created_by FROM races WHERE id = ANY($1::uuid[])',
      [result?.opened ?? []],
    );
    expect(created.rows.every((row) => row.created_by === null)).toBe(true);
  });

  it('aynı anla ikinci tur hiçbir şey açmaz; eşzamanlı iki tur yuvayı iki kez açmaz', async () => {
    const now = pastNow();
    const [a, b] = await Promise.all([useCase.execute(now), useCase.execute(now)]);
    openedHere.push(...a.opened, ...b.opened);
    expect(a.opened.length + b.opened.length).toBe(expectedSlotCount(now));

    const again = await useCase.execute(now);
    expect(again.opened).toEqual([]);

    const slots = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM race_calendar_slots WHERE race_id = ANY($1::uuid[])',
      [[...a.opened, ...b.opened]],
    );
    expect(Number(slots.rows[0].count)).toBe(expectedSlotCount(now));
  });

  it('öne çıkan (özel) program yarışı lobi listesinin BAŞINDA — liste sınırına takılmaz', async () => {
    // GELECEKTE rastgele bir cumartesi 22:00 TR (19:00 UTC): derbi (pazar 20:00)
    // kendi 48 saatlik ufkunda açılır, kısa programlar önümüzdeki 3 saati doldurur.
    // Gelecek: çalışan başka bir zamanlayıcı "başlaması geçmiş boş yarış" diye
    // iptal etmesin; rastgele hafta: önceki koşuların yuvalarıyla çakışmasın.
    const base = new Date(Date.now() + randomInt(20, 2000) * 7 * 86_400_000);
    base.setUTCHours(19, 0, 0, 0);
    const saturday = new Date(base.getTime() + ((6 - base.getUTCDay() + 7) % 7) * 86_400_000);
    const result = await useCase.execute(saturday);
    openedHere.push(...result.opened);
    const player = await registerTestPlayer(app, 'Derbi Bakan');
    const list = await request(app.getHttpServer()).get('/api/v1/races').set('Authorization', player.authHeader).expect(200);
    const rows = list.body.data as Array<{ calendar: { programId: string; featured: boolean } | null }>;
    const firstNonFeatured = rows.findIndex((row) => row.calendar?.featured !== true);
    const lastFeatured = rows.map((row) => row.calendar?.featured === true).lastIndexOf(true);
    expect(lastFeatured).toBeGreaterThanOrEqual(0);
    expect(firstNonFeatured === -1 || lastFeatured < firstNonFeatured).toBe(true);
  });

  it('başlangıcı geçmiş katılımsız takvim yarışı iptal edilir ve o yuva yeniden açılmaz', async () => {
    const now = pastNow();
    const first = await useCase.execute(now);
    openedHere.push(...first.opened);
    const firstStart = await pool.query<{ id: string; start_time: Date }>(
      'SELECT id, start_time FROM races WHERE id = ANY($1::uuid[]) ORDER BY start_time ASC LIMIT 1',
      [first.opened],
    );
    const earliest = firstStart.rows[0];

    // Saat en erken yuvanın hemen sonrasına ilerler.
    const later = new Date(earliest.start_time.getTime() + 1000);
    const second = await useCase.execute(later);
    openedHere.push(...second.opened);
    expect(second.cancelledEmpty).toBeGreaterThanOrEqual(1);

    const status = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [
      earliest.id,
    ]);
    expect(status.rows[0].status).toBe('cancelled');
    const reopened = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM race_calendar_slots c JOIN races r ON r.id = c.race_id
       WHERE r.start_time = $1 AND r.id = ANY($2::uuid[])`,
      [earliest.start_time, second.opened],
    );
    expect(Number(reopened.rows[0].count)).toBe(0);
  });

  it('takvim yarışı sıradan lobi yarışıdır: katılım ücreti deftere düşer, oyuncu hazır olur', async () => {
    // Katılım başlangıcı geçmemiş yarış ister → gerçek saatin ilerisinde,
    // önceki koşumlarla çakışmasın diye rastgele bir gün.
    const now = new Date(Date.now() + randomInt(30, 3000) * 24 * MS_PER_HOUR);
    const result = await useCase.execute(now);
    openedHere.push(...result.opened);
    const paid = await pool.query<{ id: string; entry_fee: string }>(
      `SELECT r.id, r.entry_fee FROM races r
       WHERE r.id = ANY($1::uuid[]) AND r.entry_fee > 0
       ORDER BY r.start_time ASC LIMIT 1`,
      [result.opened],
    );
    expect(paid.rows).toHaveLength(1);
    const raceId = paid.rows[0].id;
    const entryFee = Number(paid.rows[0].entry_fee);

    const player = await registerTestPlayerWithStarterHorse(app, 'Takvim Koşucu');
    const before = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
      player.playerId,
    ]);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);

    const after = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [
      player.playerId,
    ]);
    expect(Number(before.rows[0].money) - Number(after.rows[0].money)).toBe(entryFee);
    const ledger = await pool.query<{ amount: string }>(
      `SELECT amount FROM economy_transactions
       WHERE player_id = $1 AND type = 'lobby_race_entry_fee' AND reference_id = $2`,
      [player.playerId, raceId],
    );
    expect(ledger.rows.map((row) => Number(row.amount))).toEqual([-entryFee]);
    const pool_ = await pool.query<{ prize_pool: string }>(
      'SELECT prize_pool FROM races WHERE id = $1',
      [raceId],
    );
    expect(Number(pool_.rows[0].prize_pool)).toBe(entryFee);
  });
});
