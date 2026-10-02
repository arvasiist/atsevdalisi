import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import {
  calculateJockeySkillComposite,
  effectiveJockeySkill,
} from '../../src/domain/jockey/jockey';
import { NEUTRAL_UNMODELED_TRAIT_SCORE } from '../../src/domain/race/entrant-snapshot';
import { DEFAULT_RACE_TACTIC } from '../../src/domain/race/validation';
import { JockeyController } from '../../src/api/jockey/jockey.controller';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../../src/api/rate-limit/rate-limit.decorator';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * JOKEY — brief §13, §42 PHASE 6.2 (29.09.2026).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **JOKEY GERÇEKTEN MOTORA GİRİYOR.** Bu dilimin asıl iddiası budur ve
 *     dosyanın geri kalanı ona hizmet eder. "Uç nokta var" demek
 *     yetmez: kiralama yapıldıktan SONRA gerçek bir pratik yarış
 *     koşturulur ve `race_entries` satırından İKİ şey okunur —
 *     `jockey_id` DOLU ve `horse_snapshot->>'jockeySkillComposite'`
 *     config'ten hesaplanan kompozite EŞİT. KONTROL GRUBU da vardır:
 *     jokeyi olmayan oyuncunun satırında `jockey_id` NULL ve kompozit
 *     nötr 50'dir — yani "jokey var" ile "jokey yok" arasındaki fark
 *     VERİTABANINDA görünür, yalnızca kodda değil.
 *  2. **PARA YOLU TAM KURALA UYAR.** Kiralama bakiyeyi düşürür VE aynı
 *     transaction'da `economy_transactions` satırı yazar; test üçünü de
 *     karşılaştırır (bakiye farkı = defterin `amount`u =
 *     `balance_after - balance_before`). CLAUDE.md kural 7'nin en küçük
 *     örneği budur ve küçük olduğu için gevşetilmesi en cazip olanıdır.
 *  3. **BAKİYE YETMEZSE HİÇBİR ŞEY OLMAZ.** Yalnızca 409 dönmez:
 *     `jockeys.owner_id` NULL kalır ve deftere HİÇ satır yazılmaz.
 *     "Hata döndü ama satır oluştu" en sinsi hata sınıfıdır.
 *  4. **İKİ FARKLI 409.** `JOCKEY_ALREADY_OWNED` (jokey başkasında) ile
 *     `JOCKEY_ALREADY_HIRED` (senin zaten jokeyin var) AYRI kodlardır;
 *     istemcinin önereceği eylem farklıdır. Test ikisini de ayrı ayrı
 *     kurar ve kodların gerçekten farklı olduğunu iddia eder.
 *  5. **ÜCRETSİZ JOKEY DEFTERE YAZILMAZ.** `salary = 0` iken kiralama
 *     gerçekleşir ama `amount <> 0` CHECK'i (migration 0019) gereği
 *     defter satırı doğmaz — bu, "para nerede" sorusunun cevabının
 *     sıfır olduğu tek durumdur ve sessizce atlanmamalıdır.
 *  6. **KİMLİK TOKEN'DAN GELİR.** Başka bir oyuncunun jokeyini okumak
 *     403'tür; `hire` gövdesi/path'i ödeyen tarafı BELİRLEMEZ (test
 *     gövdeye `playerId` koymayı denemez çünkü DTO yoktur — asıl kapı
 *     `currentPlayer.id`nin hiçbir istemci girdisinden gelmemesidir).
 *
 *  7. **SERBEST BIRAKMA İADE ETMEZ** (29.09.2026, FINAL_PROJECT_AUDIT #18).
 *     `POST /jockeys/:jockeyId/release` jokeyi ayırır ama kiralama bedelini
 *     GERİ ÖDEMEZ: bedel bir kiralama ücretidir, depozito değil. Test bunu
 *     "bakiye değişmedi" demekle bırakmaz — `hire → release → hire`
 *     döngüsünü kurar ve İKİNCİ kiralamanın YİNE para düşürdüğünü
 *     iddia eder. Aksi hâlde iade sessizce eklenebilirdi.
 *  8. **SERBEST BIRAKMA MOTORA YANSIR.** Bıraktıktan sonra koşulan pratik
 *     yarışta `jockey_id` NULL ve kompozit nötr 50'dir — yani bu uç
 *     yalnızca bir ekran değil, motorun girdisini değiştirir.
 *  9. **YÖN SIZMAZ.** Sahipsiz bir jokeyi bırakmak ile BAŞKASININ jokeyini
 *     bırakmak AYNI kodu (409 `JOCKEY_NOT_OWNED`) ve aynı mesajı alır;
 *     mesajda "başkası/ait/senin" ayrımı geçmez. Ayrılsaydı kimlik deneyen
 *     bir oyuncu "bu jokey birinin mi" sorusunu yanıtlardı.
 *
 * Gerçek PostgreSQL + Redis gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Jokey (e2e) — brief §13, PHASE 6.2', () => {
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

  const JOCKEYS_URL = '/api/v1/jockeys';

  /**
   * Test jokeyi yaratır. `ownerId` verilirse doğrudan o oyuncuya ait
   * yazılır (başkasının jokeyi senaryosu için) — üretim kodunda böyle bir
   * yol YOKTUR, bu yalnızca testin kurulumudur.
   */
  async function createJockey(options: {
    salary: number;
    ownerId?: string;
    skill?: number;
  }): Promise<string> {
    const skill = options.skill ?? 50;
    const result = await pool.query<{ id: string }>(
      `INSERT INTO jockeys (name, experience, start_skill, tactical_skill, sprint_skill,
                            horse_control, risk_management, track_knowledge, salary, owner_id)
       VALUES ($1, 0, $2, $2, $2, $2, $2, $2, $3, $4)
       RETURNING id`,
      [`Test Jokeyi ${randomUUID().slice(0, 8)}`, skill, options.salary, options.ownerId ?? null],
    );
    return result.rows[0].id;
  }

  /** Oyuncunun bakiyesini test için AÇIKÇA ayarlar (üretim yolu DEĞİL). */
  async function setMoney(playerId: string, money: number): Promise<void> {
    await pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, money]);
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0].money);
  }

  async function ownerOfJockey(jockeyId: string): Promise<string | null> {
    const result = await pool.query<{ owner_id: string | null }>('SELECT owner_id FROM jockeys WHERE id = $1', [
      jockeyId,
    ]);
    return result.rows[0].owner_id;
  }

  interface LedgerRow {
    amount: string;
    balance_before: string;
    balance_after: string;
    currency: string;
    reference_type: string | null;
    reference_id: string | null;
  }

  async function hireLedgerRows(playerId: string): Promise<LedgerRow[]> {
    const result = await pool.query<LedgerRow>(
      `SELECT amount, balance_before, balance_after, currency, reference_type, reference_id
       FROM economy_transactions WHERE player_id = $1 AND type = 'jockey_hire'
       ORDER BY created_at ASC`,
      [playerId],
    );
    return result.rows;
  }

  async function hire(player: RegisteredTestPlayer, jockeyId: string, expectedStatus: number) {
    return request(app.getHttpServer())
      .post(`${JOCKEYS_URL}/${jockeyId}/hire`)
      .set('Authorization', player.authHeader)
      .expect(expectedStatus);
  }

  describe('vitrin — GET /jockeys', () => {
    it('yalnızca SAHİPSİZ jokeyleri döner ve maaşa göre ARTAN sıralar', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Vitrin Oyuncusu');
      const cheap = await createJockey({ salary: 111 });
      const pricey = await createJockey({ salary: 222 });
      // Sahipli bir jokey vitrinde GÖRÜNMEMELİDİR.
      const taken = await createJockey({ salary: 50, ownerId: player.playerId });

      const response = await request(app.getHttpServer())
        .get(JOCKEYS_URL)
        .set('Authorization', player.authHeader)
        .expect(200);

      const ids = (response.body.data as { id: string }[]).map((jockey) => jockey.id);
      expect(ids).toContain(cheap);
      expect(ids).toContain(pricey);
      expect(ids).not.toContain(taken);

      // Ucuz olan, pahalıdan ÖNCE gelmelidir (vitrin fiyat hakkında kör
      // bırakmamalıdır).
      expect(ids.indexOf(cheap)).toBeLessThan(ids.indexOf(pricey));
    });

    it('token olmadan 401 döner (uç, herkese açık DEĞİLDİR)', async () => {
      await request(app.getHttpServer()).get(JOCKEYS_URL).expect(401);
    });
  });

  describe('kiralama — PARA YOLU', () => {
    it('mutlu yol: bakiye düşer, defter satırı AYNI transaction\'da yazılır, sahiplik devrolur', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kiraliyor');
      const salary = 1_000;
      const jockeyId = await createJockey({ salary });
      await setMoney(player.playerId, 5_000);

      const response = await hire(player, jockeyId, 201);
      expect(response.body.data.paid).toBe(salary);
      expect(response.body.data.balanceAfter).toBe(4_000);
      // ⚠️ `pg` BIGINT'i METİN döner — sunucu yanıtı SAYI olmalıdır.
      expect(typeof response.body.data.paid).toBe('number');
      expect(typeof response.body.data.balanceAfter).toBe('number');

      expect(await moneyOf(player.playerId)).toBe(4_000);
      expect(await ownerOfJockey(jockeyId)).toBe(player.playerId);

      const ledger = await hireLedgerRows(player.playerId);
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].amount)).toBe(-salary);
      expect(Number(ledger[0].balance_before)).toBe(5_000);
      expect(Number(ledger[0].balance_after)).toBe(4_000);
      expect(ledger[0].currency).toBe('money');
      expect(ledger[0].reference_type).toBe('jockeys');
      expect(ledger[0].reference_id).toBe(jockeyId);
    });

    it('bakiye yetmezse 409 döner ve HİÇBİR ŞEY yazılmaz (ne sahiplik ne defter)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Yoksul');
      const jockeyId = await createJockey({ salary: 10_000 });
      await setMoney(player.playerId, 500);

      const response = await hire(player, jockeyId, 409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      expect(await moneyOf(player.playerId)).toBe(500);
      expect(await ownerOfJockey(jockeyId)).toBeNull();
      expect(await hireLedgerRows(player.playerId)).toHaveLength(0);
    });

    it('ücretsiz jokey (salary = 0) kiralanır ama deftere satır YAZILMAZ (amount <> 0 CHECK)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Bedava');
      const jockeyId = await createJockey({ salary: 0 });
      await setMoney(player.playerId, 1_000);

      const response = await hire(player, jockeyId, 201);
      expect(response.body.data.paid).toBe(0);
      expect(response.body.data.balanceAfter).toBe(1_000);

      expect(await ownerOfJockey(jockeyId)).toBe(player.playerId);
      expect(await moneyOf(player.playerId)).toBe(1_000);
      // Kiralama GERÇEKLEŞTİ ama muhasebe anlamında hiçbir hareket olmadı.
      expect(await hireLedgerRows(player.playerId)).toHaveLength(0);
    });

    it('var olmayan jokey 404 JOCKEY_NOT_FOUND döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Hayalet');
      await setMoney(player.playerId, 5_000);

      const response = await hire(player, randomUUID(), 404);
      expect(response.body.error.code).toBe('JOCKEY_NOT_FOUND');
      expect(await hireLedgerRows(player.playerId)).toHaveLength(0);
    });

    it('kimlik doğrulaması olmadan 401 döner ve sahiplik DEĞİŞMEZ', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kimliksiz');
      const jockeyId = await createJockey({ salary: 100 });

      await request(app.getHttpServer()).post(`${JOCKEYS_URL}/${jockeyId}/hire`).expect(401);
      expect(await ownerOfJockey(jockeyId)).toBeNull();
      // `player` yalnızca kurulum içindir; burada kullanılmadığını
      // derleyiciye açıkça söylemek yerine kurulumun kendisi iddia olur:
      expect(player.playerId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('iki farklı 409 — kodlar GERÇEKTEN ayrı', () => {
    it('BAŞKASININ jokeyi → JOCKEY_ALREADY_OWNED', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Sahip');
      const other = await registerTestPlayerWithStarterHorse(app, 'Diger');
      const jockeyId = await createJockey({ salary: 100, ownerId: owner.playerId });
      await setMoney(other.playerId, 5_000);

      const response = await hire(other, jockeyId, 409);
      expect(response.body.error.code).toBe('JOCKEY_ALREADY_OWNED');
      expect(await ownerOfJockey(jockeyId)).toBe(owner.playerId);
      expect(await moneyOf(other.playerId)).toBe(5_000);
      expect(await hireLedgerRows(other.playerId)).toHaveLength(0);
    });

    it('oyuncunun ZATEN jokeyi varsa → JOCKEY_ALREADY_HIRED (ve ikinci maaş ALINMAZ)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'IkiJokey');
      const first = await createJockey({ salary: 300 });
      const second = await createJockey({ salary: 400 });
      await setMoney(player.playerId, 5_000);

      await hire(player, first, 201);
      expect(await moneyOf(player.playerId)).toBe(4_700);

      const response = await hire(player, second, 409);
      expect(response.body.error.code).toBe('JOCKEY_ALREADY_HIRED');
      // ⚠️ İkinci deneme para HARCAMAMALIDIR — "hata döndü ama para gitti"
      // bu dilimin en pahalı sessiz hatası olurdu.
      expect(await moneyOf(player.playerId)).toBe(4_700);
      expect(await ownerOfJockey(second)).toBeNull();
      expect(await hireLedgerRows(player.playerId)).toHaveLength(1);
    });
  });

  describe('okuma — GET /players/:id/jockey', () => {
    it('jokeyi olmayan oyuncu için `null` döner (404 DEĞİL)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Jokeysiz');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${player.playerId}/jockey`)
        .set('Authorization', player.authHeader)
        .expect(200);

      expect(response.body.data).toBeNull();
    });

    it('kompozit, config ağırlıklarıyla SUNUCUDA hesaplanır ve uçtan döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kompozit');
      const skill = 80;
      const jockeyId = await createJockey({ salary: 0, skill });
      await hire(player, jockeyId, 201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${player.playerId}/jockey`)
        .set('Authorization', player.authHeader)
        .expect(200);

      // Tüm beceriler eşit olduğundan kompozit, ağırlıklar 1.0 topladığı
      // sürece becerinin KENDİSİDİR — bu, config'in motora gerçekten
      // uygulandığının en yalın kanıtıdır.
      const expected = calculateJockeySkillComposite(
        {
          startSkill: skill,
          tacticalSkill: skill,
          sprintSkill: skill,
          horseControl: skill,
          riskManagement: skill,
          trackKnowledge: skill,
        },
        config.jockey,
      );
      expect(response.body.data.composite).toBeCloseTo(expected, 6);
      expect(response.body.data.jockey.id).toBe(jockeyId);
      // ⚠️ `salary` BIGINT — METİN değil SAYI dönmelidir.
      expect(typeof response.body.data.jockey.salary).toBe('number');
    });

    it('BAŞKA bir oyuncunun jokeyi 403 döner (assertSelf)', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Gizli');
      const nosy = await registerTestPlayerWithStarterHorse(app, 'Merakli');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${owner.playerId}/jockey`)
        .set('Authorization', nosy.authHeader)
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('MOTOR KANITI — jokey `race_entries`e gerçekten giriyor', () => {
    /** Son pratik yarışın oyuncuya ait satırı. */
    async function lastEntryOf(horseId: string): Promise<{ jockey_id: string | null; snapshot: string }> {
      const result = await pool.query<{ jockey_id: string | null; horse_snapshot: string }>(
        `SELECT jockey_id, horse_snapshot FROM race_entries
         WHERE horse_id = $1 AND bot_label IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [horseId],
      );
      expect(result.rows.length, 'pratik yarış satırı yazılmamış').toBe(1);
      return {
        jockey_id: result.rows[0].jockey_id,
        snapshot: JSON.stringify(result.rows[0].horse_snapshot),
      };
    }

    async function runPracticeRace(player: RegisteredTestPlayer, horseId: string): Promise<void> {
      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/practice-race`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);
    }

    it('jokeyi OLAN oyuncunun satırında `jockey_id` DOLU ve kompozit motora giren değerdir', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Motorlu');
      await setMoney(player.playerId, 50_000);
      const skill = 90;
      const jockeyId = await createJockey({ salary: 0, skill });
      await hire(player, jockeyId, 201);
      // Mizaç SABİTLENİR: rastgele bir mizaç tam 70 çıksaydı uyum 50 olur ve
      // aşağıdaki "uyum işliyor" iddiası boşa düşerdi.
      await pool.query('UPDATE horse_stats SET temperament = 10 WHERE horse_id = $1', [
        player.horseId,
      ]);

      await runPracticeRace(player, player.horseId);

      const entry = await lastEntryOf(player.horseId);
      expect(entry.jockey_id).toBe(jockeyId);

      const snapshot = JSON.parse(entry.snapshot) as { jockeySkillComposite: number };
      const skills = {
        startSkill: skill,
        tacticalSkill: skill,
        sprintSkill: skill,
        horseControl: skill,
        riskManagement: skill,
        trackKnowledge: skill,
        experience: 0,
      };
      // 02.10.2026 — motora giren değer jokey-at UYUMUNU da içerir
      // (`effectiveJockeySkill`): atın gizli mizacı + taktik stili + jokey
      // deneyimi + ortak geçmiş (ilk yarış → nötr). Girdiler burada bağımsız
      // olarak okunur; ekranın gösterdiği salt puanla AYNI DEĞİLDİR.
      const temperament = 10;
      const expected = effectiveJockeySkill(
        {
          jockey: skills,
          horse: { temperament, racingStyle: DEFAULT_RACE_TACTIC.racingStyle },
          previousPairAveragePerformance: null,
        },
        config.jockey,
      );
      expect(snapshot.jockeySkillComposite).toBeCloseTo(expected, 6);
      // Uyum gerçekten işliyor: salt beceri puanından farklı (mizaç 50 ve
      // deneyim 0 iken uyum 50 olamaz).
      expect(snapshot.jockeySkillComposite).not.toBeCloseTo(
        calculateJockeySkillComposite(skills, config.jockey),
        6,
      );
      // Nötr 50 DEĞİL — yani bu alan "varsayılan" değil, GERÇEKTEN jokeyden
      // geliyor. Bu iddia olmadan yukarıdaki eşitlik, beceri 50 seçilseydi
      // hiçbir şey kanıtlamazdı.
      expect(snapshot.jockeySkillComposite).not.toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    });

    it('KONTROL: jokeyi OLMAYAN oyuncunun satırında `jockey_id` NULL ve kompozit nötr 50', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Motorsuz');
      await setMoney(player.playerId, 50_000);

      await runPracticeRace(player, player.horseId);

      const entry = await lastEntryOf(player.horseId);
      expect(entry.jockey_id).toBeNull();
      const snapshot = JSON.parse(entry.snapshot) as { jockeySkillComposite: number };
      // Botlarla AYNI değer: jokeyi olmayan oyuncuya gizli bir ceza da
      // bonus da verilmez.
      expect(snapshot.jockeySkillComposite).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    });
  });

  describe('serbest bırakma — POST /jockeys/:jockeyId/release (audit #18)', () => {
    async function release(player: RegisteredTestPlayer, jockeyId: string, expectedStatus: number) {
      return request(app.getHttpServer())
        .post(`${JOCKEYS_URL}/${jockeyId}/release`)
        .set('Authorization', player.authHeader)
        .expect(expectedStatus);
    }

    it('mutlu yol: sahiplik düşer, jokey vitrine DÖNER ve PARA DEĞİŞMEZ', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Birakan');
      const jockeyId = await createJockey({ salary: 700 });
      await setMoney(player.playerId, 5_000);

      await hire(player, jockeyId, 201);
      expect(await moneyOf(player.playerId)).toBe(4_300);

      const response = await release(player, jockeyId, 200);
      expect(response.body.data.jockey.id).toBe(jockeyId);
      // ⚠️ Bırakılan jokeyin `ownerId`si `null` dönmelidir — yanıt
      // "sahiplik devam ediyor" diyen bir satır taşırsa istemci yanlış
      // ekran kurar.
      expect(response.body.data.jockey.ownerId).toBeNull();
      // ⚠️ `salary` BIGINT — METİN değil SAYI dönmelidir.
      expect(typeof response.body.data.jockey.salary).toBe('number');

      expect(await ownerOfJockey(jockeyId)).toBeNull();
      // İADE YOK — bakiye 4.300'de KALIR.
      expect(await moneyOf(player.playerId)).toBe(4_300);
      // Defterde YALNIZCA kiralama satırı vardır; bırakma satır ÜRETMEZ.
      expect(await hireLedgerRows(player.playerId)).toHaveLength(1);

      // Jokey vitrine geri döndü — yani "serbest" gerçekten serbest.
      const showcase = await request(app.getHttpServer())
        .get(JOCKEYS_URL)
        .set('Authorization', player.authHeader)
        .expect(200);
      expect((showcase.body.data as { id: string }[]).map((row) => row.id)).toContain(jockeyId);
    });

    it('İADE YOK — `hire → release → hire` döngüsü ikinci kez de para düşer', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Dongu');
      const salary = 500;
      const first = await createJockey({ salary });
      const second = await createJockey({ salary });
      await setMoney(player.playerId, 5_000);

      await hire(player, first, 201);
      await release(player, first, 200);
      // İade edilmiş olsaydı bakiye 5.000'e dönerdi.
      expect(await moneyOf(player.playerId)).toBe(4_500);

      await hire(player, second, 201);
      // İkinci kiralama YİNE düşer — kiralama bedeli bir KİRALAMA
      // ücretidir, depozito değil. Bu iddia olmadan bir iade sessizce
      // eklenebilirdi ve "jokey kiralamak bedava" olurdu.
      expect(await moneyOf(player.playerId)).toBe(4_000);
      expect(await hireLedgerRows(player.playerId)).toHaveLength(2);
      expect(await ownerOfJockey(second)).toBe(player.playerId);
    });

    it('SERBEST BIRAKMA MOTORA YANSIR: sonraki yarışta `jockey_id` NULL, kompozit nötr', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'BiraktiKostu');
      await setMoney(player.playerId, 50_000);
      const jockeyId = await createJockey({ salary: 0, skill: 95 });
      await hire(player, jockeyId, 201);
      await release(player, jockeyId, 200);

      await request(app.getHttpServer())
        .post(`/api/v1/horses/${player.horseId}/practice-race`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);

      const entry = await pool.query<{ jockey_id: string | null; horse_snapshot: string }>(
        `SELECT jockey_id, horse_snapshot FROM race_entries
         WHERE horse_id = $1 AND bot_label IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [player.horseId],
      );
      expect(entry.rows).toHaveLength(1);
      expect(entry.rows[0].jockey_id).toBeNull();
      const snapshot = JSON.parse(JSON.stringify(entry.rows[0].horse_snapshot)) as {
        jockeySkillComposite: number;
      };
      expect(snapshot.jockeySkillComposite).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    });

    it('İKİNCİ bırakma 409 JOCKEY_NOT_OWNED — koruma anahtar değil DURUM GEÇİŞİ', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'CiftBirakan');
      const jockeyId = await createJockey({ salary: 100 });
      await setMoney(player.playerId, 5_000);
      await hire(player, jockeyId, 201);
      await release(player, jockeyId, 200);

      const response = await release(player, jockeyId, 409);
      expect(response.body.error.code).toBe('JOCKEY_NOT_OWNED');
      expect(await ownerOfJockey(jockeyId)).toBeNull();
      expect(await moneyOf(player.playerId)).toBe(4_900);
    });

    it('BAŞKASININ jokeyi 409 JOCKEY_NOT_OWNED — ve yön SIZMAZ', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Sahip2');
      const other = await registerTestPlayerWithStarterHorse(app, 'Diger2');
      const jockeyId = await createJockey({ salary: 100, ownerId: owner.playerId });
      await setMoney(other.playerId, 5_000);

      const foreign = await release(other, jockeyId, 409);
      expect(foreign.body.error.code).toBe('JOCKEY_NOT_OWNED');
      // Sahiplik DEĞİŞMEZ.
      expect(await ownerOfJockey(jockeyId)).toBe(owner.playerId);
      expect(await moneyOf(other.playerId)).toBe(5_000);

      // YÖN SIZMAZ: sahipsiz bir jokeyi bırakmaya çalışan oyuncunun
      // aldığı yanıt, BAŞKASININ jokeyini bırakmaya çalışanınkinden
      // AYIRT EDİLEMEZ olmalıdır. İkisi ayrılsaydı kimlik deneyen bir
      // oyuncu "bu jokey birinin mi" sorusunu yanıtlardı.
      const free = await createJockey({ salary: 100 });
      const ownerless = await release(other, free, 409);
      expect(ownerless.body.error.code).toBe(foreign.body.error.code);
      // Mesaj jokeyin KİMLİĞİNİ taşır (kod tabanının genel üslubu) —
      // kimliği nötrleştirip geri kalanı karşılaştırırız.
      const stripId = (message: unknown): string => String(message).replace(/[0-9a-f-]{36}/g, '<id>');
      expect(stripId(ownerless.body.error.message)).toBe(stripId(foreign.body.error.message));
      // Mesajda "başkası / başka birinin / ait" gibi bir YÖN kelimesi
      // GEÇMEZ.
      expect(String(foreign.body.error.message)).not.toMatch(/başkası|başka bir|ait/i);
    });

    it('var olmayan jokey 404 JOCKEY_NOT_FOUND (409 DEĞİL)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Hayalet2');
      const response = await release(player, randomUUID(), 404);
      expect(response.body.error.code).toBe('JOCKEY_NOT_FOUND');
    });

    it('kimlik doğrulaması olmadan 401 döner ve sahiplik DEĞİŞMEZ', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Kimliksiz2');
      const jockeyId = await createJockey({ salary: 0 });
      await hire(player, jockeyId, 201);

      await request(app.getHttpServer()).post(`${JOCKEYS_URL}/${jockeyId}/release`).expect(401);
      expect(await ownerOfJockey(jockeyId)).toBe(player.playerId);
    });

    it('hız sınırı: `release` SINIRLIDIR ve `hire`ın bütçesini BÖLMEZ', async () => {
      const hireOptions = Reflect.getMetadata(RATE_LIMIT_KEY, JockeyController.prototype.hire) as
        | RateLimitOptions
        | undefined;
      const releaseOptions = Reflect.getMetadata(RATE_LIMIT_KEY, JockeyController.prototype.release) as
        | RateLimitOptions
        | undefined;
      // `@RateLimit` opt-in'dir: işaretlenmeyen yazma rotası SINIRSIZDIR ve
      // bunu ne derleyici ne başka bir test fark eder.
      expect(hireOptions).toBeDefined();
      expect(releaseOptions).toBeDefined();
      // ⚠️ Aynı `name` tek bütçeyi böler (kopyala-yapıştır tuzağı) —
      // PHASE 16 kuralı.
      expect(releaseOptions?.name).not.toBe(hireOptions?.name);
      expect(releaseOptions?.name).toBe('jockey-release');
      expect(releaseOptions?.keyBy).toBe('player');
    });
  });
});
