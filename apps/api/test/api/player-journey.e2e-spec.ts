import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_EXPORT_SECTIONS,
  type AccountDataExport,
  type QuestBoardView,
  type SeasonView,
} from '@at-sevdalisi/shared-types';
import { loadEconomyConfig, loadOnlineConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import { TournamentScheduler } from '../../src/infrastructure/scheduler/tournament.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  uniqueUsername,
  type RegisteredTestPlayer,
} from './test-helpers';

type JourneyPlayer = RegisteredTestPlayer & { horseId: string };

/**
 * FAZ 14 — UÇTAN UCA OYUNCU YOLCULUĞU (02.10.2026).
 *
 * `final.e2e-spec.ts` TEK bir para akışını (lobi yarışı + tribün + iptal)
 * kanıtlar. Bu dosya İKİ oyuncunun oyunun BÜTÜN yüzeylerinden ardışık
 * geçtiğini ve geçişlerin birbirini bozmadığını kanıtlar:
 *
 *   hesap (kayıt → e-posta/şifre → şifreyle giriş) → turnuva (katıl, hazır,
 *   final, ödül) → pratik yarış (XP) → antrenman + bakım → görev ödülü →
 *   sosyal (arkadaşlık, mesaj, hediye, bildirim) → kulüp (kur, katıl,
 *   sohbet, yarışla kulüp puanı) → pazar (ilan + alım) → sezon sıralaması →
 *   veri dışa aktarma → DEFTER MUTABAKATI → hesap silme.
 *
 * **SONDAKİ MUTABAKAT DOSYANIN ASIL İDDİASIDIR:** yolculuk boyunca bakiyeye
 * dokunan HER işlem bir `economy_transactions` satırı bırakmalıdır;
 * `bakiye = başlangıç + defter toplamı` bunu bütün özellikler için TEK
 * seferde sınar. Defter satırı yazmayan bir para yolu eklenirse bu dosya
 * kırılır.
 *
 * `it` blokları SIRALIDIR ve durumu paylaşır (`final.e2e-spec.ts` ile aynı
 * gerekçe): bir adım düşerse akışın kendisi bozulmuştur.
 *
 * SQL yalnızca (1) saat ilerletmek (turnuva başlangıcı + canlı koşu bitişi;
 * zamanlayıcılar `NODE_ENV=test`te kapalı) ve (2) defteri okumak içindir.
 * Hiçbir bakiye SQL ile yazılmaz — yazılsaydı mutabakat anlamsız olurdu.
 */
describe('FAZ 14 — uçtan uca oyuncu yolculuğu', () => {
  const economy = loadEconomyConfig();
  const online = loadOnlineConfig();
  const quests = loadQuestsConfig();
  let app: INestApplication;
  let pool: Pool;
  let tournaments: TournamentScheduler;
  let raceLock: RaceLockScheduler;

  let ayse: JourneyPlayer;
  let berk: JourneyPlayer;
  const email = `${uniqueUsername('yol')}@ornek.com`;
  const password = 'yolculuk-sifre-1';
  let tournamentRaceId = '';
  let clubId = '';
  /** Oyuncunun KENDİ koşturduğu yarış sayısı — sezon iddiası buna dayanır. */
  const racesRun = new Map<string, number>();
  const countRace = (player: RegisteredTestPlayer) =>
    racesRun.set(player.playerId, (racesRun.get(player.playerId) ?? 0) + 1);

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    tournaments = app.get(TournamentScheduler);
    raceLock = app.get(RaceLockScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (player: RegisteredTestPlayer) => ({ Authorization: player.authHeader });

  async function playerView(player: RegisteredTestPlayer) {
    return (await http().get(`/api/v1/players/${player.playerId}`).set(as(player)).expect(200)).body
      .data as { money: number; gems: number; xp: number; level: number };
  }

  async function raceStatus(raceId: string): Promise<string> {
    const result = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
    return result.rows[0]!.status;
  }

  async function practiceRace(player: JourneyPlayer): Promise<void> {
    await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set(as(player))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    countRace(player);
  }

  it('1. hesap: misafir kaydı → e-posta + şifre → şifreyle giriş (yeni token çalışır)', async () => {
    ayse = await registerTestPlayerWithStarterHorse(app, 'Ayşe Yolcu');
    berk = await registerTestPlayerWithStarterHorse(app, 'Berk Yolcu');
    await http().post('/api/v1/auth/credentials').set(as(ayse)).send({ email, password }).expect(201);

    const login = await http().post('/api/v1/auth/login/password').send({ email, password }).expect(200);
    const token = login.body.data.token as string;
    expect(typeof token).toBe('string');
    ayse = { ...ayse, token, authHeader: `Bearer ${token}` };
    const credentials = await http().get('/api/v1/auth/credentials').set(as(ayse)).expect(200);
    expect(credentials.body.data.email).toBe(email);

    // Sezon yolculuktan ÖNCE açık olmalı: temiz şemada ilk sezon ilk istekte,
    // o anki saatle açılır; yolculuğun ortasında açılırsa önceki yarışlar
    // pencerenin dışında kalır ve 8. adımın sayımı yanlış olur.
    await http().get('/api/v1/seasons/current').set(as(ayse)).expect(200);

    const start = await playerView(ayse);
    expect(start.money).toBe(economy.newPlayerStartingBalance.money);
    expect(start.gems).toBe(economy.newPlayerStartingBalance.gems);
  });

  it('2. turnuva: iki oyuncu bronz finale katılır, hazır der; final BOTSUZ koşar ve ödül dağıtılır', async () => {
    // Kademe başına tek turnuva: önceki dosyaların bıraktığı KATILIMSIZ açık
    // turnuva iptal edilir (para hareketi yok), takvim yenisini açar.
    await pool.query(
      `UPDATE races SET status = 'cancelled'
       WHERE status = 'scheduled' AND id IN (SELECT race_id FROM tournaments)
         AND NOT EXISTS (SELECT 1 FROM race_entries e WHERE e.race_id = races.id)`,
    );
    await tournaments.tickNow();
    const open = await pool.query<{ race_id: string; entry_fee: string }>(
      `SELECT t.race_id, r.entry_fee FROM tournaments t JOIN races r ON r.id = t.race_id
       WHERE t.tier = 'bronze' AND r.status = 'scheduled'`,
    );
    expect(open.rows).toHaveLength(1);
    tournamentRaceId = open.rows[0]!.race_id;
    const entryFee = Number(open.rows[0]!.entry_fee);
    expect(entryFee).toBe(online.tournament.tiers.bronze!.entryFee);

    for (const player of [ayse, berk]) {
      await http()
        .post(`/api/v1/races/${tournamentRaceId}/join`)
        .set(as(player))
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: player.horseId })
        .expect(200);
      await http().post(`/api/v1/races/${tournamentRaceId}/ready`).set(as(player)).send({ status: 'ready' }).expect(200);
    }

    // `now()`: sezon (1. adımda açıldı) penceresinin içinde kalsın diye geriye ÇEKİLMEZ.
    await pool.query('UPDATE races SET start_time = now() WHERE id = $1', [tournamentRaceId]);
    for (let tick = 0; tick < 25 && !['finished', 'cancelled'].includes(await raceStatus(tournamentRaceId)); tick += 1) {
      await raceLock.tickNow();
      // Final oyuncu kontrollü CANLI koşar; kesinleşme koşu bitince olur.
      await pool.query(
        "UPDATE races SET live_starts_at = now() - interval '1 hour' WHERE id = $1 AND live_starts_at IS NOT NULL",
        [tournamentRaceId],
      );
    }
    expect(await raceStatus(tournamentRaceId)).toBe('finished');
    countRace(ayse);
    countRace(berk);

    const bots = await pool.query('SELECT 1 FROM race_entries WHERE race_id = $1 AND bot_label IS NOT NULL', [
      tournamentRaceId,
    ]);
    expect(bots.rows).toHaveLength(0);
    const prizes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM economy_transactions
       WHERE reference_id = $1::text AND amount > 0 AND type = 'lobby_race_prize'`,
      [tournamentRaceId],
    );
    const pool2 = entryFee * 2;
    const total = Number(prizes.rows[0]!.total);
    // İki finalist: ilk iki pay (rake yok). Para basılmaz → havuzu AŞAMAZ.
    const shares = online.tournament.prizeDistributionByPlacement;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(pool2);
    expect(total).toBeGreaterThanOrEqual(Math.floor(pool2 * ((shares['1'] ?? 0) + (shares['2'] ?? 0))) - 1);

    // Bitmiş yarış artık at kilidi DEĞİLDİR (sonraki adımlar atı kullanır).
    const live = await http().get('/api/v1/races/live/current').set(as(ayse));
    expect([200, 404]).toContain(live.status);
  });

  it('3. pratik yarış XP verir; antrenman + bakım ata işler', async () => {
    const before = await playerView(ayse);
    await practiceRace(ayse);
    const after = await playerView(ayse);
    expect(after.xp + after.level * 1_000_000).toBeGreaterThan(before.xp + before.level * 1_000_000);

    await http()
      .post(`/api/v1/horses/${ayse.horseId}/train`)
      .set(as(ayse))
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
      .expect(200);
    await http().post(`/api/v1/horses/${ayse.horseId}/care`).set(as(ayse)).send({ actionType: 'groom' }).expect(200);
  });

  it('4. görev: yarış görevi tamamlanır, ödül bir kez alınır', async () => {
    const board = (await http().get('/api/v1/quests').set(as(ayse)).expect(200)).body.data as QuestBoardView;
    const raceQuest = board.daily.quests.find((q) => q.metric === 'races_entered')!;
    expect(raceQuest).toBeDefined();
    // Turnuva + pratik = 2 yarış; hedef daha büyükse eksik kadar pratik koş.
    for (let i = raceQuest.progress; i < raceQuest.target; i += 1) {
      await practiceRace(ayse);
    }
    const claimed = await http().post(`/api/v1/quests/${raceQuest.key}/claim`).set(as(ayse)).expect(200);
    expect(claimed.body.data.rewardMoney).toBe(quests.daily.find((q) => q.key === raceQuest.key)!.rewardMoney);
    const again = await http().post(`/api/v1/quests/${raceQuest.key}/claim`).set(as(ayse)).expect(409);
    expect(again.body.error.code).toBe('QUEST_ALREADY_CLAIMED');
  });

  it('5. sosyal: arkadaşlık → mesaj → hediye; alıcı bildirimi görür', async () => {
    const created = await http()
      .post(`/api/v1/players/${ayse.playerId}/friend-requests`)
      .set(as(ayse))
      .send({ addresseeId: berk.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${berk.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set(as(berk))
      .send({ action: 'accept' })
      .expect(200);
    await http()
      .post(`/api/v1/players/${ayse.playerId}/messages`)
      .set(as(ayse))
      .send({ recipientId: berk.playerId, body: 'Yarışta görüşürüz' })
      .expect(201);
    await http()
      .post(`/api/v1/players/${ayse.playerId}/gifts`)
      .set(as(ayse))
      .set('Idempotency-Key', randomUUID())
      .send({ recipientId: berk.playerId, amount: 100, currency: 'money' })
      .expect(201);

    const notifications = await http().get(`/api/v1/players/${berk.playerId}/notifications`).set(as(berk)).expect(200);
    const types = (notifications.body.data.notifications as Array<{ type: string }>).map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['friend_request', 'message_received', 'gift_received']));
  });

  it('6. kulüp: kur → katıl → sohbet; üyenin yarışı kulüp puanı yazar', async () => {
    const created = await http()
      .post('/api/v1/clubs')
      .set(as(ayse))
      .send({ name: `Yolculuk ${randomUUID().slice(0, 8)}` })
      .expect(201);
    clubId = created.body.data.club.id as string;
    await http().post(`/api/v1/clubs/${clubId}/join`).set(as(berk)).expect(200);
    await http().post(`/api/v1/clubs/${clubId}/messages`).set(as(ayse)).send({ body: 'Hoş geldin' }).expect(201);
    const chat = await http().get(`/api/v1/clubs/${clubId}/messages`).set(as(berk)).expect(200);
    expect(chat.body.data.map((m: { body: string }) => m.body)).toContain('Hoş geldin');

    const pointsOf = async () =>
      (await http().get('/api/v1/clubs/mine').set(as(berk)).expect(200)).body.data.club.points as number;
    const before = await pointsOf();
    await practiceRace(berk);
    expect(await pointsOf()).toBeGreaterThan(before);
  });

  it('7. pazar: Berk atını satar, Ayşe alır; at el değiştirir', async () => {
    const price = quests.horsePurchaseMinPrice;
    const listing = await http()
      .post('/api/v1/market/listings')
      .set(as(berk))
      .send({ horseId: berk.horseId, price })
      .expect(201);
    await http()
      .post(`/api/v1/market/listings/${listing.body.data.id as string}/buy`)
      .set(as(ayse))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const horses = await http().get(`/api/v1/horses?ownerId=${ayse.playerId}`).set(as(ayse)).expect(200);
    expect(horses.body.data.map((h: { id: string }) => h.id)).toEqual(
      expect.arrayContaining([ayse.horseId, berk.horseId]),
    );
  });

  it('8. sezon: her oyuncu KENDİ koştuğu yarışlarla sıralanır — satılan at geçmişi taşımaz', async () => {
    // Regresyon (03.10.2026, migration 0063): pratik katılımı `player_id`
    // yazmıyordu ve sıralama atın ŞİMDİKİ sahibine bakıyordu; 7. adımda atını
    // satan Berk'in yarışları Ayşe'ye geçiyor, Berk sıralamadan düşüyordu.
    for (const player of [ayse, berk]) {
      const view = (await http().get('/api/v1/seasons/current').set(as(player)).expect(200)).body
        .data as SeasonView;
      // `season.e2e-spec.ts` sezon bitişini `tickNow(gelecek)` ile simüle eder ve
      // başlangıcı GELECEKTE olan bir sezon açabilir (paylaşılan DB). O durumda
      // bugünkü yarışlar pencerenin dışındadır → `me` null olmalıdır.
      if (Date.parse(view.season.startsAt) <= Date.now()) {
        expect(view.me?.playerId).toBe(player.playerId);
        expect(view.me?.raceCount).toBe(racesRun.get(player.playerId));
      } else {
        expect(view.me).toBeNull();
      }
    }
  });

  it('9. dışa aktarma bütün yolculuğu taşır (at, defter, mesaj, kulüp sohbeti)', async () => {
    const data = (await http().get('/api/v1/account/export').set(as(ayse)).expect(200)).body.data as AccountDataExport;
    expect(Object.keys(data.sections).sort()).toEqual([...ACCOUNT_EXPORT_SECTIONS].sort());
    expect(data.sections.horses.rows.length).toBe(2);
    expect(data.sections.transactions.rows.length).toBeGreaterThan(0);
    expect(data.sections.messages.rows.length).toBeGreaterThan(0);
    expect(data.sections.clubMessages.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain(password);
  });

  it('10. DEFTER MUTABAKATI: her iki oyuncu için bakiye = başlangıç + defter toplamı', async () => {
    for (const player of [ayse, berk]) {
      const view = await playerView(player);
      const ledger = await pool.query<{ currency: string; total: string; rows: string }>(
        `SELECT currency, SUM(amount)::text AS total, COUNT(*)::text AS rows
         FROM economy_transactions WHERE player_id = $1 GROUP BY currency`,
        [player.playerId],
      );
      const sum = (currency: string) => Number(ledger.rows.find((r) => r.currency === currency)?.total ?? 0);
      expect(view.money).toBe(economy.newPlayerStartingBalance.money + sum('money'));
      expect(view.gems).toBe(economy.newPlayerStartingBalance.gems + sum('gems'));
      // Yolculuk gerçekten parayı oynattı (boş mutabakat kanıt değildir).
      expect(Number(ledger.rows.find((r) => r.currency === 'money')?.rows ?? 0)).toBeGreaterThanOrEqual(3);
    }
  });

  it('11. hesap silme: kulüpten çıkan Berk hesabını siler; token ölür, defter kalır', async () => {
    await http().post('/api/v1/clubs/leave').set(as(berk)).expect(200);
    const ledgerBefore = await pool.query('SELECT 1 FROM economy_transactions WHERE player_id = $1', [berk.playerId]);
    await http().post('/api/v1/account/delete').set(as(berk)).send({ confirmUsername: berk.username }).expect(200);
    await http().get(`/api/v1/players/${berk.playerId}`).set(as(berk)).expect(401);
    const ledgerAfter = await pool.query('SELECT 1 FROM economy_transactions WHERE player_id = $1', [berk.playerId]);
    expect(ledgerAfter.rows.length).toBe(ledgerBefore.rows.length);
    // Arkadaşın gözünde silinen hesap profilsizdir.
    await http().get(`/api/v1/players/profile/${berk.username}`).expect(404);
  });
});
