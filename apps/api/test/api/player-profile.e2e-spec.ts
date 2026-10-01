import { loadProgressionConfig } from '@at-sevdalisi/game-config';
import { applyXpGain, computeRaceXp } from '../../src/domain/progression/progression';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * brief §24 "SOCIAL PROFILE" (PHASE 14) — `GET /players/profile/:username`.
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEY İKİ TANEDİR:**
 *
 * 1. **PROFİL GERÇEKTEN HERKESE AÇIKTIR.** İstek Authorization header'ı
 *    GÖNDERMEZ ve 200 alır. Bu, `@Public()` kararının ölçümüdür; başlığı
 *    "unutup" eklemek testi yeşil tutar ama kararı doğrulamaz, bu yüzden
 *    hiçbir istekte token kullanılmaz.
 * 2. **PROFİL PARA SIZDIRMAZ.** `money`/`gems` yanıtta YOKTUR. Bu bir
 *    eksiklik değil gizlilik kuralıdır (AUDIT_REPORT.md Bulgu S4) ve
 *    burada `toHaveProperty` ile DEĞİL, alanın YOKLUĞU ile sınanır: bir
 *    gün `PlayerSummary`'den türetilmiş bir alan eklenirse bu test kırmızı
 *    olur.
 *
 * ## Neden yarış sayıları GERÇEK bir kesinleşmeyle üretilir
 *
 * `raceCount`/`winCount`/`podiumCount` "yarış koşmuş olma"ya bağlıdır ve
 * `races.status = 'finished'` süzgecinden geçer. Bu satırları elle INSERT
 * etmek testi hızlı yapardı ama ASIL RİSKİ (süzgecin yanlış yazılması)
 * görünmez kılardı. Bu yüzden yarış, üretimdeki yolun AYNISIYLA kurulur:
 * `POST /races` → `POST /races/:id/join` → `POST /races/:id/settle`.
 *
 * Kazanan ise SABİTLENMEZ (sıra simülasyonun sonucudur) — bunun yerine
 * kesinleşmeden sonra oyuncunun `finish_position`'ı VERİTABANINDAN okunur
 * ve profildeki sayılar ona göre doğrulanır. Yani test "kazandı" varsaymaz,
 * "kazandıysa 1, kaybettiyse 0" der.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Oyuncu profili (e2e) — GET /players/profile/:username', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const STARTING_MONEY = 5_000;
  const ENTRY_FEE = 100;

  async function usernameOf(playerId: string): Promise<string> {
    const result = await pool.query<{ username: string }>('SELECT username FROM players WHERE id = $1', [playerId]);
    return result.rows[0]!.username;
  }

  /**
   * Profili TOKEN'SIZ okur — `@Public()` kararının ölçümü budur.
   *
   * Dönüş tipi AÇIKÇA yazılmaz (`supertest.Test`): `request` varsayılan
   * importtur ve tip ad alanı her derleyici ayarında görünür olmayabilir;
   * çıkarım zaten aynı tipi verir.
   */
  function getProfile(username: string) {
    return request(app.getHttpServer()).get(`/api/v1/players/profile/${username}`);
  }

  /** Arkadaşlığı GERÇEK uçlarla kurar (istek → kabul). */
  async function befriend(requester: RegisteredTestPlayer, addressee: RegisteredTestPlayer): Promise<void> {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/players/${requester.playerId}/friend-requests`)
      .set('Authorization', requester.authHeader)
      .send({ addresseeId: addressee.playerId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/players/${addressee.playerId}/friend-requests/${created.body.data.requestId}/respond`)
      .set('Authorization', addressee.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  /**
   * Yarışı gerçek uçlarla koşar ve KESİNLEŞTİRİR. Dönen değer, katılımcının
   * `race_entries` satırındaki bitiş sırasıdır (simülasyonun sonucu).
   */
  async function runOneRace(
    participant: RegisteredTestPlayer & { horseId: string },
    crank: RegisteredTestPlayer,
  ): Promise<number> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', participant.authHeader)
      .send({
        name: 'Profil Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: ENTRY_FEE,
        raceType: 'paid',
        startTime: new Date(Date.now() + 3_600_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    const raceId = created.body.data.id as string;

    // ⚠️ `horseId` ZORUNLUDUR (`validateRaceJoin`, `domain/race/lobby.ts`) —
    // gövdesiz bir join 400 VALIDATION_ERROR döner (yaşandı, 28.09.2026).
    // Taktik/risk isteğe bağlıdır, varsayılanları domain yazar.
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', participant.authHeader)
      .set('Idempotency-Key', `profil-${raceId}`)
      .send({ horseId: participant.horseId })
      .expect(200);
    // READY ŞARTI (30.09.2026): hazır demeyen katılım kesinleşmede iade edilip düşülür.
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', participant.authHeader)
      .send({ status: 'ready' })
      .expect(200);

    // `startDelaySeconds.min` 60'tır — yarışı "başlamış" duruma getirmenin
    // başka yolu yoktur (üretimde bunu bir zamanlayıcı yapar).
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/settle`)
      .set('Authorization', crank.authHeader)
      .expect(200);

    const entry = await pool.query<{ finish_position: number | null }>(
      'SELECT finish_position FROM race_entries WHERE race_id = $1 AND player_id = $2',
      [raceId, participant.playerId],
    );
    return entry.rows[0]!.finish_position!;
  }

  it('TOKEN OLMADAN 200 döner ve sayılar gerçek veriden hesaplanır', async () => {
    const target = await registerTestPlayerWithStarterHorse(app, 'Profil Sahibi');
    const friend = await registerTestPlayerWithStarterHorse(app, 'Profil Arkadaşı');
    const crank = await registerTestPlayerWithStarterHorse(app, 'Profil Krank');

    await befriend(friend, target);
    await request(app.getHttpServer())
      .post(`/api/v1/players/${friend.playerId}/gifts`)
      .set('Authorization', friend.authHeader)
      .set('Idempotency-Key', `profil-hediye-${target.playerId}`)
      .send({ recipientId: target.playerId, amount: 25, currency: 'money' })
      .expect(201);

    const finishPosition = await runOneRace(target, crank);
    const username = await usernameOf(target.playerId);

    const response = await getProfile(username).expect(200);
    const profile = response.body.data;

    expect(profile.playerId).toBe(target.playerId);
    expect(profile.username).toBe(username);
    expect(profile.displayName).toBe('Profil Sahibi');
    // 01.10.2026 — yarış XP kazandırır; beklenen değer kuraldan hesaplanır.
    const progress = applyXpGain(
      1,
      0,
      computeRaceXp(finishPosition, loadProgressionConfig().xpRewards.player),
      loadProgressionConfig(),
    );
    expect(profile.level).toBe(progress.level);
    expect(profile.xp).toBe(progress.xp);
    expect(profile.memberSince).toEqual(expect.any(String));

    // YARIŞ SAYILARI: sıra simülasyonun sonucudur, bu yüzden iddia
    // varsayım değil GÖZLEM üzerine kurulur (bkz. dosya başı).
    expect(profile.stats.raceCount).toBe(1);
    expect(profile.stats.winCount).toBe(finishPosition === 1 ? 1 : 0);
    expect(profile.stats.podiumCount).toBe(finishPosition <= 3 ? 1 : 0);
    expect(profile.stats.winCount).toBeLessThanOrEqual(profile.stats.podiumCount);
    expect(profile.stats.podiumCount).toBeLessThanOrEqual(profile.stats.raceCount);

    expect(profile.friendCount).toBe(1);
    expect(profile.giftCount).toBe(1);
    // brief §24 "Achievements" — bilinçli olarak henüz yok (bkz.
    // `PlayerProfileView` doc yorumu).
    expect(profile.achievements).toBeNull();
  });

  it('BAKİYE SIZDIRMAZ — `money`/`gems` yanıtta HİÇ yoktur', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sızıntı Testi');
    const username = await usernameOf(player.playerId);

    const response = await getProfile(username).expect(200);

    // Alanın VARLIĞI değil YOKLUĞU sınanır: `undefined` bir değer
    // `toBeUndefined()` ile geçerdi ama alan yine de JSON'da görünürdü.
    expect(response.body.data).not.toHaveProperty('money');
    expect(response.body.data).not.toHaveProperty('gems');
    // Gövdenin TAMAMI da sınanır: yeni bir gizli alan eklenirse bu liste
    // kırmızı olur ve gözden geçirilmesi gerekir.
    expect(Object.keys(response.body.data).sort()).toEqual(
      [
        'achievements',
        'avatarId',
        'displayName',
        'friendCount',
        'giftCount',
        'level',
        'memberSince',
        'playerId',
        'stats',
        'username',
        'xp',
      ].sort(),
    );
  });

  it('yeni oyuncunun profili SIFIR istatistiklidir (boş durum uydurulmaz)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Yepyeni Profil');
    const username = await usernameOf(player.playerId);

    const profile = (await getProfile(username).expect(200)).body.data;

    expect(profile.stats).toEqual({ raceCount: 0, winCount: 0, podiumCount: 0 });
    expect(profile.friendCount).toBe(0);
    expect(profile.giftCount).toBe(0);
    expect(profile.avatarId).toBeNull();
  });

  it('olmayan kullanıcı adı 404 PLAYER_NOT_FOUND döner', async () => {
    const response = await getProfile('boyle_bir_oyuncu_yok').expect(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('ŞEKLİ BOZUK kullanıcı adı 400 VALIDATION_ERROR döner — 404 DEĞİL', async () => {
    // Ayrım önemlidir: "bu ad hiçbir zaman var olamaz" (400) ile "bu ad
    // henüz alınmamış" (404) istemci için farklı cevaplardır.
    for (const invalid of ['AB', 'Buyuk_Harf', 'a', 'bosluk var']) {
      const response = await getProfile(encodeURIComponent(invalid)).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('YENİ uç nokta `GET /players/:id`in kendi-profil kuralını GEVŞETMEZ', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Kendi Profili');
    const stranger = await registerTestPlayerWithStarterHorse(app, 'Yabanci Gozlemci');

    // Eskiden olduğu gibi: başkasının id'siyle `GET /players/:id` 403.
    await request(app.getHttpServer())
      .get(`/api/v1/players/${owner.playerId}`)
      .set('Authorization', stranger.authHeader)
      .expect(403);

    // Ama genel profil ucu herkese açıktır — ikisi ÇELİŞMEZ, farklı
    // sözleşmelerdir (biri `PlayerSummary` + bakiye, diğeri
    // `PlayerProfileView`).
    await getProfile(await usernameOf(owner.playerId)).expect(200);

    // Kontrol: `money` yalnızca SAHİBİNE döner ve başlangıç bakiyesidir.
    const own = await request(app.getHttpServer())
      .get(`/api/v1/players/${owner.playerId}`)
      .set('Authorization', owner.authHeader)
      .expect(200);
    expect(own.body.data.money).toBe(STARTING_MONEY);
  });
});
