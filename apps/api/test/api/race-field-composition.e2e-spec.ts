import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateBotEntrants } from '../../src/domain/race/bot-generator';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * SAHA KOMPOZİSYONU — UÇTAN UCA (§42 PHASE 2, 28.09.2026).
 *
 * **BU DOSYA ÜÇ AYRI ŞEYİ KANITLAR VE ÜÇÜ DE DAHA ÖNCE KANITLANMIYORDU:**
 *
 * 1. **`fieldSize` ≠ gerçek oyuncu sayısı.** 8 atlık sahada 2 gerçek oyuncu
 *    koşar, kalan 6 koltuk bottur ve sonuç listesi **8 satır** döner. Saf
 *    kural matrisi `test/domain/race/field-composition.spec.ts`tedir; burada
 *    kanıtlanan şey o kuralın **gerçekten uca bağlı olduğudur** — brief'in
 *    asıl kuralı: "bir özellik sadece dosyası veya endpoint'i bulunduğu için
 *    IMPLEMENTED kabul edilmeyecek."
 *
 * 2. **Sonuç AYRIŞTIRILABİLİR.** Her satır `participantType` + `jockeyId` +
 *    `startingStats` + `finishPosition` + `finalTimeMs` taşır. Öncesinde
 *    yalnızca `isBot` vardı; "at neden kazandı" sorusunu cevaplayan hiçbir
 *    sayı yanıtta yoktu.
 *
 * 3. **AI'YE GİZLİ BONUS YOK.** Botların `startingStats`'ı, aynı seed ile
 *    ÜRETİLEN (`generateBotEntrants`) değerlerle **birebir** karşılaştırılır.
 *    Motorun girdisi ile yanıtın gösterdiği sayı ayrışırsa bu iddia kırılır
 *    — yani "oyuncunun göremediği bir +%50" eklenmesi burada ELE VERİR.
 *
 * ⚠️ **GERÇEK OYUNCU STATLARI DA DONDURULMUŞ SNAPSHOT'TAN OKUNUR.** Bu da
 * iddia edilir: yanıttaki `startingStats`, `race_entries.horse_snapshot`
 * sütunundaki değerle aynı olmalıdır. Canlı `horse_stats` tablosundan
 * okunsaydı, sonucu AÇIKLAYAN sayılar ile sonucu ÜRETEN sayılar ayrışırdı.
 *
 * ⚠️ **BRIEF'İN "8/0/8" SENARYOSU KURULMAZ** — sunucuda imkânsızdır
 * (`NO_HUMAN_PLAYERS`, bkz. saf spec + `lobby.ts`). Uydurmak yerine
 * reddedilir.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Saha kompozisyonu (e2e) — fieldSize ≠ gerçek oyuncu sayısı', () => {
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
  /** `config/race-lobby.config.json` → `paidEntryFeeOptions` içinden seçilir. */
  const ENTRY_FEE = 100;

  async function createRace(
    creator: RegisteredTestPlayer,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Kompozisyon Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: ENTRY_FEE,
        raceType: 'paid',
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

  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  /**
   * `POST /races` her zaman en az `startDelaySeconds.min` (60 sn) ileri bir
   * başlangıç yazar — bu bilinçli bir ürün kuralıdır ve testin onu bekleyerek
   * aşması her koşuya bir dakika eklerdi. Bunun yerine YALNIZCA bu testin
   * kurduğu satırın `start_time`ı geriye alınır (kural test EDİLMEZ, ön
   * koşul kurulur — `race-settlement.e2e-spec.ts` ile AYNI desen).
   */
  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  interface SettlementPlace {
    finishPosition: number;
    horseId: string;
    playerId: string | null;
    participantType: 'human' | 'ai';
    jockeyId: string | null;
    startingStats: Record<string, number>;
    finalTimeMs: number | null;
    prizeAmount: number;
  }

  interface SettleResponseBody {
    success: boolean;
    data: { raceId: string; status: string; prizePool: number; places: SettlementPlace[] };
  }

  async function simulationSeedOf(raceId: string): Promise<string> {
    const result = await pool.query<{ simulation_seed: string | null }>(
      'SELECT simulation_seed FROM races WHERE id = $1',
      [raceId],
    );
    const seed = result.rows[0]?.simulation_seed ?? null;
    expect(seed, 'kesinleşmeden sonra `races.simulation_seed` dolu olmalıdır').not.toBeNull();
    return seed as string;
  }

  it('2 gerçek oyuncu + 6 bot: 8 satır döner, her satır ayrıştırılabilir ve botlarda GİZLİ BONUS yoktur', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Kompozisyon Kuran');
    const second = await registerTestPlayerWithStarterHorse(app, 'Kompozisyon İkinci');

    const raceId = await createRace(creator, { fieldSize: 8, maxPlayers: 8 });
    await join(creator, raceId);
    await join(second, raceId);
    await makeRaceStarted(raceId);

    // ÇAĞIRAN KATILIMCI DEĞİL — yarışı koşturmak için oyuncu olmak gerekmez
    // (crank deseni, `SettleRaceUseCase` doc yorumu).
    const crank = await registerTestPlayerWithStarterHorse(app, 'Kompozisyon Krank');
    const body = (
      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/settle`)
        .set('Authorization', crank.authHeader)
        .expect(200)
    ).body as SettleResponseBody;

    // ---- 1) SAHA `fieldSize`A TAMAMLANIR ----
    expect(body.data.status).toBe('finished');
    expect(body.data.places).toHaveLength(8);

    const humans = body.data.places.filter((place) => place.participantType === 'human');
    const bots = body.data.places.filter((place) => place.participantType === 'ai');
    expect(humans).toHaveLength(2);
    expect(bots).toHaveLength(6);

    // Gerçek/AI ayrımı `playerId` ile TUTARLI olmalı — `participantType`
    // ikinci bir doğruluk kaynağı olarak sürüklenirse burada yakalanır.
    for (const place of humans) {
      expect(place.playerId).not.toBeNull();
    }
    for (const place of bots) {
      expect(place.playerId).toBeNull();
      expect(place.prizeAmount).toBe(0);
    }

    // ---- 2) SIRALAMA TAM VE TEKİL ----
    expect(body.data.places.map((place) => place.finishPosition)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const place of body.data.places) {
      expect(place.finalTimeMs, `${place.horseId} bitiş süresi olmalı`).not.toBeNull();
      expect(Number.isFinite(place.finalTimeMs)).toBe(true);
      expect(place.jockeyId).toBeNull();
    }

    // ---- 3) AI'YE GİZLİ BONUS YOK ----
    // Bot statları AYNI seed ile YENİDEN üretilir ve yanıttaki sayılarla
    // BİREBİR karşılaştırılır. `generateBotEntrants`ın çıktısı motora giden
    // girdinin TA KENDİSİDİR (`settle-race.use-case`), yani burada bir fark
    // çıkması = motora giren ile oyuncuya gösterilen sayının ayrışması.
    const seed = await simulationSeedOf(raceId);
    const expectedBots = generateBotEntrants(6, seed);
    for (const expected of expectedBots) {
      const place = bots.find((bot) => bot.horseId === expected.horseId);
      expect(place, `${expected.horseId} sonuç listesinde olmalı`).toBeDefined();
      expect(place?.startingStats).toEqual({
        speed: expected.speed,
        stamina: expected.stamina,
        acceleration: expected.acceleration,
        fitness: expected.fitness,
        form: expected.form,
        morale: expected.morale,
        fatigue: expected.fatigue,
        health: expected.health,
      });
    }

    // ---- 4) GERÇEK OYUNCU STATLARI DONDURULMUŞ SNAPSHOT'TAN GELİR ----
    const snapshotRows = await pool.query<{ horse_id: string; horse_snapshot: Record<string, number> }>(
      'SELECT horse_id, horse_snapshot FROM race_entries WHERE race_id = $1 AND player_id IS NOT NULL',
      [raceId],
    );
    expect(snapshotRows.rows).toHaveLength(2);
    const snapshotByHorseId = new Map(snapshotRows.rows.map((row) => [row.horse_id, row.horse_snapshot]));
    for (const place of humans) {
      const snapshot = snapshotByHorseId.get(place.horseId);
      expect(snapshot, `${place.horseId} için dondurulmuş snapshot olmalı`).toBeDefined();
      expect(place.startingStats).toEqual({
        speed: snapshot?.speed,
        stamina: snapshot?.stamina,
        acceleration: snapshot?.acceleration,
        fitness: snapshot?.fitness,
        form: snapshot?.form,
        morale: snapshot?.morale,
        fatigue: snapshot?.fatigue,
        health: snapshot?.health,
      });
    }
  });

  it('`aiFillEnabled = false` iken saha EKSİK koşar ve sonuç listesi kısalır', async () => {
    // ⚠️ BU TEST `aiFillEnabled`I GEÇİCİ OLARAK KAPATIR. Config dosyasını
    // DEĞİŞTİRMEZ (dosya paylaşılan bir kaynaktır ve paralel koşan diğer e2e
    // dosyalarını etkilerdi); yalnızca bu uygulama örneğinin bellekteki
    // değerini değiştirir ve `finally` ile GERİ ALIR.
    //
    // Bu, `aiFillEnabled`ın gerçekten OKUNDUĞUNUN uçtan uca kanıtıdır: bu
    // dilimden önce `false` yapmak sahada tek bir botu bile eksiltmiyordu.
    const original = config.raceLobby.aiFillEnabled;
    const mutable = config.raceLobby as { aiFillEnabled: boolean };

    try {
      mutable.aiFillEnabled = false;

      const creator = await registerTestPlayerWithStarterHorse(app, 'Eksik Saha Kuran');
      const raceId = await createRace(creator, { fieldSize: 8, maxPlayers: 8 });
      await join(creator, raceId);
      await makeRaceStarted(raceId);

      const crank = await registerTestPlayerWithStarterHorse(app, 'Eksik Saha Krank');
      const body = (
        await request(app.getHttpServer())
          .post(`${racesUrl}/${raceId}/settle`)
          .set('Authorization', crank.authHeader)
          .expect(200)
      ).body as SettleResponseBody;

      // Tek gerçek oyuncu → tek satır. Boş koltuklar SESSİZCE BOTLA
      // DOLDURULMAZ; yarış gerçekten daha az atla koşar.
      expect(body.data.places).toHaveLength(1);
      expect(body.data.places[0]?.participantType).toBe('human');
      expect(body.data.places[0]?.finishPosition).toBe(1);
    } finally {
      mutable.aiFillEnabled = original;
    }
  });
});
