import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * YARIŞ LOBİSİ — `POST /races` (brief §1-§7, §9-§11, §42 PHASE 1).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **SUNUCU OTORİTESİ.** `created_by` **TOKEN'dan** gelir, gövdeden
 *     ASLA: gövdeye `createdBy` konulsa bile satıra YAZILMAZ. İki farklı
 *     oyuncunun yarışları FARKLI `created_by` taşır (yani bu bir sabit
 *     değil, gerçekten çağıranın kimliğidir).
 *  2. **DOĞRULAMA GERÇEKTEN ÇALIŞIYOR.** Geçersiz her alan 400 +
 *     `INVALID_RACE_DEFINITION` döner ve **HİÇBİR SATIR YAZILMAZ** —
 *     "hata döndü ama satır oluştu" en sinsi hata sınıfıdır.
 *  3. **YANLIŞ TİP 500 DEĞİL 400 VERİR.** `name: 42` gibi bir gövde
 *     (esbuild altında DTO doğrulaması atlandığında gerçekten ulaşabilir)
 *     `TypeError` fırlatıp 500 dönmemelidir. Bu, dilimin en önemli
 *     regresyon kapısıdır.
 *  4. **TAVAN ÇALIŞIYOR.** `maxOpenRacesPerPlayer` dolduğunda 409 +
 *     `RACE_LIMIT_REACHED`; yarış İPTAL edilince (ya da koşunca) hak geri
 *     gelir. Tavan OYUNCU BAŞINADIR, global değil.
 *  5. **SEED SIZMAZ.** Yeni yarışta `simulation_seed IS NULL`dır — seed
 *     yarış KOŞARKEN üretilir, çünkü erken üretilseydi yarışı açan kişi
 *     sonucu önceden hesaplayabilirdi (`CreateLobbyRaceInput.simulationSeed`
 *     doc yorumu). Yanıt gövdesi de seed ALANINI İÇERMEZ.
 *  6. **`prizePool = 0` ve `joinedPlayers = 0`** — yarışı açmak para
 *     TAŞIMAZ ve kişiyi otomatik KATILIMCI yapmaz (giriş ücreti PHASE
 *     1b'de, katılırken alınır).
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Yarış lobisi (e2e) — POST /races', () => {
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

  /** Geçerli bir gövde — testler yalnızca ilgilendikleri alanı bozar. */
  function validBody(): Record<string, unknown> {
    return {
      name: 'Boğaziçi Kupası',
      fieldSize: 12,
      maxPlayers: 8,
      entryFee: 500,
      raceType: 'paid',
      // `startDelaySeconds` [60, 604800] — 1 saat güvenli aralıkta.
      startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      surface: 'grass',
      weather: 'sunny',
      distanceMeters: 1_600,
      tribuneFee: 25,
      spectatorCapacity: 1_000,
    };
  }

  async function createRace(player: RegisteredTestPlayer, body: Record<string, unknown>, expectedStatus: number) {
    return request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', player.authHeader)
      .send(body)
      .expect(expectedStatus);
  }

  /** Oyuncunun yazılmış yarış SAYISI — "hata döndü ama satır oluştu" kontrolünün ölçüsü. */
  async function countRacesOf(playerId: string): Promise<number> {
    const result = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM races WHERE created_by = $1', [playerId]);
    return Number(result.rows[0].count);
  }

  describe('mutlu yol', () => {
    it('geçerli gövde 201 döner ve yarış GERÇEKTEN yazılır', async () => {
      const player = await registerTestPlayer(app, 'Lobi Kuran');

      const response = await createRace(player, validBody(), 201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.body.data.status).toBe('scheduled');
      expect(response.body.data.raceType).toBe('paid');

      const rows = await pool.query('SELECT * FROM races WHERE id = $1', [response.body.data.id]);
      expect(rows.rows.length).toBe(1);
    });

    it('yanıt gövdesi lobi alanlarını EKSİKSİZ taşır', async () => {
      const player = await registerTestPlayer(app, 'Lobi Alanları');
      const body = validBody();

      const response = await createRace(player, body, 201);
      const race = response.body.data;

      expect(race.name).toBe('Boğaziçi Kupası');
      expect(race.fieldSize).toBe(12);
      expect(race.maxPlayers).toBe(8);
      expect(race.entryFee).toBe(500);
      expect(race.tribuneFee).toBe(25);
      expect(race.spectatorCapacity).toBe(1_000);
      expect(race.distanceMeters).toBe(1_600);
      expect(race.surface).toBe('grass');
      expect(race.weather).toBe('sunny');
      expect(race.createdBy).toBe(player.playerId);
      expect(race.startTime).toBe(body.startTime);
    });

    it('yarışı açmak PARA TAŞIMAZ: `prizePool` 0, bakiyeye DOKUNULMAZ', async () => {
      const player = await registerTestPlayer(app, 'Lobi Parasız');
      const before = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [player.playerId]);

      const response = await createRace(player, validBody(), 201);

      expect(response.body.data.prizePool).toBe(0);
      const after = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [player.playerId]);
      expect(after.rows[0].money).toBe(before.rows[0].money);
    });

    it('yarışı açan kişi OTOMATİK KATILIMCI DEĞİLDİR (`joinedPlayers` 0)', async () => {
      // Giriş ücreti katılırken alınır (PHASE 1b); açan kişiyi otomatik
      // katılımcı saymak "önce katıl, ödemeyi sonra düşün" yolu açardı.
      const player = await registerTestPlayer(app, 'Lobi Katılmadı');

      const response = await createRace(player, validBody(), 201);

      expect(response.body.data.joinedPlayers).toBe(0);
    });

    it('ad `trim()` edilerek yazılır', async () => {
      const player = await registerTestPlayer(app, 'Lobi Boşluk');

      const response = await createRace(player, { ...validBody(), name: '   Kırkpınar   ' }, 201);

      expect(response.body.data.name).toBe('Kırkpınar');
      const rows = await pool.query<{ name: string }>('SELECT name FROM races WHERE id = $1', [response.body.data.id]);
      expect(rows.rows[0].name).toBe('Kırkpınar');
    });

    it('ücretsiz yarış (raceType free, entryFee 0) oluşturulabilir', async () => {
      const player = await registerTestPlayer(app, 'Lobi Ücretsiz');

      const response = await createRace(player, { ...validBody(), raceType: 'free', entryFee: 0 }, 201);

      expect(response.body.data.raceType).toBe('free');
      expect(response.body.data.entryFee).toBe(0);
    });

    it('DB satırı sürüm alanlarını ve varsayılanları DOLDURUR', async () => {
      const player = await registerTestPlayer(app, 'Lobi Sürüm');
      const response = await createRace(player, validBody(), 201);

      const rows = await pool.query<{
        engine_version: string;
        ruleset_version: string;
        config_version: string;
        weather_config_version: string;
        created_by: string;
        status: string;
      }>('SELECT engine_version, ruleset_version, config_version, weather_config_version, created_by, status FROM races WHERE id = $1', [
        response.body.data.id,
      ]);
      const row = rows.rows[0];

      // Bu dört sütun `NOT NULL`dır ve migration 0021/0024 bilerek
      // `DEFAULT`'u kaldırmıştır — INSERT bunları doldurmasaydı sorgu
      // hiç çalışmazdı. Yine de açıkça iddia edilir: "çalıştı" demek
      // yerine "doğru değerle çalıştı" demek.
      expect(row.engine_version.length).toBeGreaterThan(0);
      expect(row.ruleset_version.length).toBeGreaterThan(0);
      expect(row.config_version.length).toBeGreaterThan(0);
      expect(row.weather_config_version.length).toBeGreaterThan(0);
      expect(row.created_by).toBe(player.playerId);
      expect(row.status).toBe('scheduled');
    });

    it('yeni yarışta `simulation_seed` NULL\'dır (seed yarış koşarken üretilir)', async () => {
      const player = await registerTestPlayer(app, 'Lobi Seed');
      const response = await createRace(player, validBody(), 201);

      const rows = await pool.query<{ simulation_seed: string | null }>('SELECT simulation_seed FROM races WHERE id = $1', [
        response.body.data.id,
      ]);
      expect(rows.rows[0].simulation_seed).toBeNull();
    });

    it('yanıt gövdesi seed/motor sürümü SIZDIRMAZ', async () => {
      // `RaceLobbyView` bilinçli olarak DAR bir tiptir (bkz. o tipin doc
      // yorumu). Seed sızarsa yarışı açan kişi sonucu önceden hesaplar.
      const player = await registerTestPlayer(app, 'Lobi Sızıntı');
      const response = await createRace(player, validBody(), 201);

      expect(response.body.data).not.toHaveProperty('simulationSeed');
      expect(response.body.data).not.toHaveProperty('engineVersion');
      expect(response.body.data).not.toHaveProperty('configVersion');
    });
  });

  describe('SUNUCU OTORİTESİ — created_by', () => {
    it('gövdedeki `createdBy` YOK SAYILIR; satıra TOKEN\'daki oyuncu yazılır', async () => {
      const caller = await registerTestPlayer(app, 'Gerçek Kuran');
      const victim = await registerTestPlayer(app, 'Kandırılmak İstenen');

      const response = await createRace(caller, { ...validBody(), createdBy: victim.playerId }, 201);

      expect(response.body.data.createdBy).toBe(caller.playerId);
      const rows = await pool.query<{ created_by: string }>('SELECT created_by FROM races WHERE id = $1', [response.body.data.id]);
      expect(rows.rows[0].created_by).toBe(caller.playerId);
    });

    it('iki farklı oyuncunun yarışları FARKLI `created_by` taşır', async () => {
      // Yukarıdaki test tek başına yetmez: `created_by` sabit bir değer
      // olsaydı (ör. her zaman ilk oyuncu) o test yine geçerdi. Bu test
      // alanın GERÇEKTEN çağırana bağlı olduğunu kanıtlar.
      const first = await registerTestPlayer(app, 'Birinci Kuran');
      const second = await registerTestPlayer(app, 'İkinci Kuran');

      const raceA = await createRace(first, validBody(), 201);
      const raceB = await createRace(second, validBody(), 201);

      expect(raceA.body.data.createdBy).toBe(first.playerId);
      expect(raceB.body.data.createdBy).toBe(second.playerId);
      expect(raceA.body.data.createdBy).not.toBe(raceB.body.data.createdBy);
    });
  });

  describe('kimlik doğrulama', () => {
    it('token olmadan 401 döner ve satır yazılmaz', async () => {
      const player = await registerTestPlayer(app, 'Tokensiz');
      await request(app.getHttpServer()).post(racesUrl).send(validBody()).expect(401);
      expect(await countRacesOf(player.playerId)).toBe(0);
    });
  });

  describe('girdi doğrulama — 400 ve HİÇBİR SATIR YAZILMAZ', () => {
    it.each([
      ['kısa ad', { name: 'ab' }],
      ['uzun ad', { name: 'a'.repeat(61) }],
      ['boşluk ad', { name: '     ' }],
      ['geçersiz at sayısı', { fieldSize: 9 }],
      ['oyuncu tavanı at sayısını aşıyor', { fieldSize: 8, maxPlayers: 10 }],
      ['oyuncu tavanı minPlayers altında', { maxPlayers: 5 }],
      ['ücretsiz yarışta giriş ücreti', { raceType: 'free', entryFee: 500 }],
      ['ücretli yarışta 0 giriş ücreti', { raceType: 'paid', entryFee: 0 }],
      ['seçenek dışı giriş ücreti', { raceType: 'paid', entryFee: 75 }],
      ['seçenek dışı tribün ücreti', { tribuneFee: 15 }],
      ['seçenek dışı kapasite', { spectatorCapacity: 999 }],
      ['aralık dışı mesafe', { distanceMeters: 10 }],
      ['bilinmeyen pist', { surface: 'sand' }],
      ['bilinmeyen hava', { weather: 'snowy' }],
      ['geçmiş başlangıç', { startTime: '2020-01-01T00:00:00.000Z' }],
      ['ayrıştırılamayan başlangıç', { startTime: 'gelecek hafta' }],
    ])('%s → 400 INVALID_RACE_DEFINITION ve 0 satır', async (_label, override) => {
      const player = await registerTestPlayer(app, 'Geçersiz Tanım');

      const response = await createRace(player, { ...validBody(), ...override }, 400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_RACE_DEFINITION');
      // ASIL İDDİA: doğrulama hata verdiğinde yarım bir satır KALMAZ.
      expect(await countRacesOf(player.playerId)).toBe(0);
    });

    it('birden fazla hatalı alan TEK yanıtta birlikte bildirilir', async () => {
      const player = await registerTestPlayer(app, 'Çok Hatalı');

      const response = await createRace(
        player,
        { ...validBody(), name: 'ab', surface: 'sand', weather: 'snowy', tribuneFee: 15 },
        400,
      );

      const message = response.body.error.message as string;
      expect(message).toContain('Yarış adı');
      expect(message).toContain('Pist yüzeyi');
      expect(message).toContain('Hava durumu');
      expect(message).toContain('Tribün ücreti');
      expect(await countRacesOf(player.playerId)).toBe(0);
    });

    it.each([
      ['ad sayı', { name: 42 }],
      ['ad null', { name: null }],
      ['ad dizi', { name: ['Kupa'] }],
      ['at sayısı metin', { fieldSize: '12' }],
      ['başlangıç sayı', { startTime: 1_790_000_000_000 }],
      ['pist sayı', { surface: 1 }],
    ])('yanlış TİPTE girdi (%s) 500 DEĞİL 400 döner', async (_label, override) => {
      // BU TESTİN VARLIK SEBEBİ: `name.trim()` çağrısı `typeof` kontrolü
      // olmadan `TypeError` fırlatır ve istemci **500** görürdü. Yanlış
      // tipte bir gövde teorik değildir — `ValidationPipe` esbuild altında
      // gövdeyi hiç doğrulamaz (CLAUDE.md kural 5).
      const player = await registerTestPlayer(app, 'Yanlış Tip');

      const response = await createRace(player, { ...validBody(), ...override }, 400);

      expect(response.body.error.code).toBe('INVALID_RACE_DEFINITION');
      expect(await countRacesOf(player.playerId)).toBe(0);
    });
  });

  describe('açık yarış tavanı — maxOpenRacesPerPlayer', () => {
    it('tavan dolduğunda 409 RACE_LIMIT_REACHED ve FAZLA SATIR YAZILMAZ', async () => {
      const player = await registerTestPlayer(app, 'Tavan Dolduran');
      const limit = config.raceLobby.maxOpenRacesPerPlayer;

      for (let i = 0; i < limit; i += 1) {
        await createRace(player, validBody(), 201);
      }
      expect(await countRacesOf(player.playerId)).toBe(limit);

      const response = await createRace(player, validBody(), 409);

      expect(response.body.error.code).toBe('RACE_LIMIT_REACHED');
      expect(await countRacesOf(player.playerId)).toBe(limit);
    });

    it('tavan OYUNCU BAŞINADIR — bir oyuncunun dolması diğerini etkilemez', async () => {
      const full = await registerTestPlayer(app, 'Tavan Dolu');
      const other = await registerTestPlayer(app, 'Tavan Boş');
      const limit = config.raceLobby.maxOpenRacesPerPlayer;

      for (let i = 0; i < limit; i += 1) {
        await createRace(full, validBody(), 201);
      }
      await createRace(full, validBody(), 409);

      await createRace(other, validBody(), 201);
      expect(await countRacesOf(other.playerId)).toBe(1);
    });

    it('yarış İPTAL edilince hak geri gelir (tavan çıkmaz sokak değildir)', async () => {
      // Tavan yalnızca `status = 'scheduled'` satırları sayar — bu test o
      // filtrenin gerçekten çalıştığını kanıtlar. Filtre olmasaydı (tüm
      // satırlar sayılsaydı) oyuncu bir kez tavana takıldıktan sonra
      // HİÇBİR ZAMAN yeni yarış açamazdı.
      const player = await registerTestPlayer(app, 'İptal Eden');
      const limit = config.raceLobby.maxOpenRacesPerPlayer;

      const created: string[] = [];
      for (let i = 0; i < limit; i += 1) {
        const response = await createRace(player, validBody(), 201);
        created.push(response.body.data.id as string);
      }
      await createRace(player, validBody(), 409);

      await pool.query("UPDATE races SET status = 'cancelled' WHERE id = $1", [created[0]]);

      await createRace(player, validBody(), 201);
      expect(await countRacesOf(player.playerId)).toBe(limit + 1);
    });
  });
});
