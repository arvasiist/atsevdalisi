import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { STARTER_HORSE_POTENTIAL, STARTER_HORSE_QUALITY } from '../../src/domain/horse/horse';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * ÇİFTLEŞTİRME — `POST /players/:id/breeding`. Soy ağacı veri zincirinin
 * YAZMA parçası (okuma parçası `pedigree.e2e-spec.ts`).
 *
 * **BU BİR PARA YOLUDUR** ve bu dosyanın ASIL KANITLADIĞI ŞEYLER:
 *   (1) DAMIZLIK ÜCRETİ BİR TRANSFERDİR: aygır BAŞKASININSA ödeyenin
 *       bakiyesi DÜŞER, aygır sahibininki AYNI miktarda ARTAR; iki defter
 *       satırı (`breeding_stud_fee_debit`/`_credit`) AYNI `reference_id`
 *       ile yazılır — biri eksik olsaydı para ya yoktan var olur ya da
 *       kaybolurdu,
 *   (2) AYNI SAHİP ÜCRET ÖDEMEZ: `fee` 0 ve HİÇ defter satırı yok (sıfır
 *       tutarlı bir satır yazmak migration 0019'un `CHECK (amount <> 0)`
 *       kısıtına takılırdı),
 *   (3) ZİNCİR KAPANIR: doğan tay `GET /horses/:id/pedigree`'de GERÇEKTEN
 *       görünür (sire/dam doğru) — bu dilimin varlık sebebi budur,
 *   (4) ROLLBACK BÜTÜNDÜR: yetersiz bakiyede TAY DOĞMAZ (ne `horses`, ne
 *       `breeding_pairs`, ne defter satırı) — para yolu olmayan bir hata
 *       yarım bir tay bırakırsa oyuncu bedava at kazanırdı,
 *   (5) İDEMPOTENCY: AYNI anahtarla iki istek → TEK tay, TEK çift kaydı,
 *       TEK tahsilat,
 *   (6) UYGUNLUK KAPILARI: cooldown, cinsiyet, pazarda ilan, ahır
 *       kapasitesi ve sahiplik REDDEDİLİR ve hiçbiri yarım satır bırakmaz,
 *   (7) SIZINTI YOK: yanıt aygır sahibinin bakiyesini TAŞIMAZ ve `seed`
 *       döndürmez (seed = `pairId`'dir, ayrıca sızdırılmaz).
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Çiftleştirme (e2e) — PARA YOLU', () => {
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

  const breedingUrl = (playerId: string) => `/api/v1/players/${playerId}/breeding`;
  const pedigreeUrl = (horseId: string) => `/api/v1/horses/${horseId}/pedigree`;

  /**
   * Başlangıç atının damızlık ücreti — `calculateStudFee`'nin AYNISI:
   * `((quality + potential) / 2) × studFeeMultiplier`. Sihirli sayı
   * YAZILMAZ (CLAUDE.md), hem kalite/potansiyel hem çarpan
   * config'ten/domain sabitinden okunur.
   *
   * Bu bir SABİT DEĞİL, FONKSİYONDUR: `describe` gövdesi (toplama
   * aşaması) `beforeAll`'dan ÖNCE çalışır, `config` ise orada atanır —
   * modül seviyesinde hesaplanan bir sabit `undefined` okurdu.
   */
  function starterStudFee(): number {
    return Math.round(((STARTER_HORSE_QUALITY + STARTER_HORSE_POTENTIAL) / 2) * config.genetics.studFeeMultiplier);
  }

  /**
   * Başlangıç atının cinsiyeti RASTGELEdir (`STARTER_HORSE_GENDERS`:
   * mare/stallion/gelding — bkz. `pickStarterHorseGender`). Çiftleştirme
   * testinin konusu cinsiyet dağılımı DEĞİL, akışın kendisi olduğundan
   * cinsiyet doğrudan yazılır. **Bu bir test kısayoludur, üretim yolu
   * DEĞİLDİR** (`pedigree.e2e-spec.ts`'in `insertAncestorHorse`'u ile AYNI
   * gerekçe).
   */
  async function forceGender(horseId: string, gender: 'mare' | 'stallion' | 'gelding'): Promise<void> {
    await pool.query('UPDATE horses SET gender = $2 WHERE id = $1', [horseId, gender]);
  }

  /** Test için bakiyeyi doğrudan yazar (kayıt akışı 0 Çip verir). */
  async function setBalance(playerId: string, money: number, gems = 0): Promise<void> {
    await pool.query('UPDATE players SET money = $2, gems = $3 WHERE id = $1', [playerId, money, gems]);
  }

  async function fetchBalance(playerId: string, authHeader: string): Promise<{ money: number; gems: number }> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return { money: response.body.data.money as number, gems: response.body.data.gems as number };
  }

  /**
   * Test için YETİŞKİN (60 ay — `[minBreedingAgeMonths, maxBreedingAgeMonths]`
   * aralığının İÇİNDE) bir at yazar; `horse_stats` satırı da eklenir
   * (repository o satırı okur). **Bu bir test kısayoludur, üretim yolu
   * DEĞİLDİR** — üretimde at yalnızca kayıt (başlangıç atı) veya
   * çiftleştirme ile doğar.
   */
  async function insertAdultHorse(
    ownerId: string,
    name: string,
    gender: 'mare' | 'stallion' | 'gelding',
    quality = 70,
    potential = 80,
  ): Promise<string> {
    const horseId = randomUUID();
    const birthDate = new Date();
    birthDate.setMonth(birthDate.getMonth() - 60);
    await pool.query(
      `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, quality, potential)
       VALUES ($1, $2, $3, $4, 'Arap', $5, $6, $7)`,
      [horseId, ownerId, name, gender, birthDate.toISOString().slice(0, 10), quality, potential],
    );
    await pool.query('INSERT INTO horse_stats (horse_id) VALUES ($1)', [horseId]);
    return horseId;
  }

  /**
   * Çiftleştirme isteği gönderir. Beklenen durum kodu ZORUNLUDUR: testin
   * asıl iddiası çoğu zaman "hangi kodla reddedildi"dir ve onu çağrı
   * yerinde görmek, yardımcı fonksiyonun içine gizlemekten daha okunur
   * (`gift.e2e-spec.ts`'in `sendGift`'i ile AYNI desen).
   */
  async function breed(
    player: RegisteredTestPlayer,
    mareId: string,
    stallionId: string,
    foalName: unknown,
    expectedStatus: number,
    idempotencyKey: string = randomUUID(),
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(breedingUrl(player.playerId))
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', idempotencyKey)
      .send({ mareId, stallionId, foalName })
      .expect(expectedStatus);
  }

  /** Bu çiftleştirme kaydına ait defter satırları — tutara göre artan (borç ilk). */
  async function ledgerFor(pairId: string): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      "SELECT * FROM economy_transactions WHERE reference_id = $1 AND reference_type = 'breeding_pair' ORDER BY amount",
      [pairId],
    );
    return result.rows;
  }

  /**
   * Oyuncunun sahip olduğu TOPLAM at sayısı (kısrak + aygır + tay).
   * "Yeni at doğdu mu / doğmadı mı" sorusu ÖNCE/SONRA farkıyla sorulur —
   * sabit bir sayı yazmak, testin kendi kurduğu yardımcı atları
   * (`insertAdultHorse`) hesaba katmayı unutturur.
   */
  async function countHorses(ownerId: string): Promise<number> {
    const result = await pool.query('SELECT COUNT(*) FROM horses WHERE owner_id = $1', [ownerId]);
    return Number(result.rows[0].count);
  }

  async function countPairs(mareId: string): Promise<number> {
    const result = await pool.query('SELECT COUNT(*) FROM breeding_pairs WHERE mare_id = $1', [mareId]);
    return Number(result.rows[0].count);
  }

  describe('mutlu yol — AYNI SAHİP (damızlık ücreti YOK)', () => {
    it('tay doğar, `fee` 0 olur ve HİÇ defter satırı yazılmaz', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Kendi Atını Çiftleştiren');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Kendi Aygırı', 'stallion');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, stallionId, 'Kendi Tayı', 201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.mareId).toBe(payer.horseId);
      expect(response.body.data.stallionId).toBe(stallionId);
      // Tay ANINDA doğar (gebelik modellenmez) ve `gelding` ASLA bir doğum
      // sonucu değildir (bkz. `FOAL_GENDERS`).
      expect(['mare', 'stallion']).toContain(response.body.data.foalGender);
      expect(response.body.data.fee).toBe(0);
      // Ödeme yapılmadı → gösterilecek bakiye de yok.
      expect(response.body.data.payerBalance).toBeNull();
      // SEED SIZMAZ: seed = `pairId`'dir, ayrıca döndürülmez.
      expect(response.body.data.seed).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('"seed"');

      // PARA HAREKET ETMEDİ — ne bakiye ne defter.
      expect((await fetchBalance(payer.playerId, payer.authHeader)).money).toBe(5_000);
      expect(await ledgerFor(response.body.data.pairId)).toHaveLength(0);

      // TAY GERÇEKTEN DOĞDU (yalnızca yanıt değil, satır da var).
      const foalRow = await pool.query('SELECT * FROM horses WHERE id = $1', [response.body.data.foalId]);
      expect(foalRow.rows).toHaveLength(1);
      expect(foalRow.rows[0].owner_id).toBe(payer.playerId);
      expect(foalRow.rows[0].name).toBe('Kendi Tayı');
      expect(foalRow.rows[0].sire_id).toBe(stallionId);
      expect(foalRow.rows[0].dam_id).toBe(payer.horseId);
      expect(Number(foalRow.rows[0].level)).toBe(1);
      expect(Number(foalRow.rows[0].xp)).toBe(0);

      // ÇİFT KAYDI — `foal_id` DOLU olmalı (cooldown bu sütuna bakar).
      const pairRow = await pool.query('SELECT * FROM breeding_pairs WHERE id = $1', [response.body.data.pairId]);
      expect(pairRow.rows).toHaveLength(1);
      expect(pairRow.rows[0].mare_id).toBe(payer.horseId);
      expect(pairRow.rows[0].stallion_id).toBe(stallionId);
      expect(Number(pairRow.rows[0].fee)).toBe(0);
      expect(pairRow.rows[0].foal_id).toBe(response.body.data.foalId);
    });

    it('tayın istatistik/sağlık/zemin/mesafe satırları da yazılır ve DOĞUM SAĞLIK RİSKİ gerçek bir sütuna iner', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Tay Satırları');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Satır Aygırı', 'stallion');

      const response = await breed(payer, payer.horseId, stallionId, 'Satırlı Tay', 201);
      const foalId = response.body.data.foalId as string;

      // Dört yardımcı tablo — biri eksik olsaydı tay "yarım" olurdu
      // (yarışma/antrenman yolları bu satırları okur).
      for (const table of ['horse_stats', 'horse_health', 'horse_surface_stats', 'horse_distance_stats']) {
        const row = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE horse_id = $1`, [foalId]);
        expect(Number(row.rows[0].count), `${table} satırı yazılmamış`).toBe(1);
      }

      // `birthHealthRisk` [0,1] → `horse_health.injury_risk` [0,100].
      // Bu iddia olmasaydı domain'in hesapladığı değer hiçbir yere
      // yazılmayan ölü bir çıktı olurdu.
      const healthRow = await pool.query('SELECT injury_risk FROM horse_health WHERE horse_id = $1', [foalId]);
      expect(Number(healthRow.rows[0].injury_risk)).toBe(Math.round(response.body.data.birthHealthRisk * 100 * 100) / 100);
    });

    it('tayın potansiyeli ebeveyn ortalamasının `maxPotentialGainOverParents` katını AŞMAZ (domain gerçekten koştu)', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Potansiyel Tavanı');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Tavan Aygırı', 'stallion', 70, 80);

      const response = await breed(payer, payer.horseId, stallionId, 'Tavan Tayı', 201);

      const parents = await pool.query('SELECT id, potential FROM horses WHERE id = ANY($1)', [
        [payer.horseId, stallionId],
      ]);
      const averagePotential = parents.rows.reduce((sum, row) => sum + Number(row.potential), 0) / parents.rows.length;
      const cap = averagePotential * config.genetics.maxPotentialGainOverParents;

      const foalRow = await pool.query('SELECT quality, potential FROM horses WHERE id = $1', [
        response.body.data.foalId,
      ]);
      expect(Number(foalRow.rows[0].potential)).toBeLessThanOrEqual(cap);
      // Kalite de 0-100 ölçeğinde kalmalı (clamp çalıştı).
      expect(Number(foalRow.rows[0].quality)).toBeGreaterThanOrEqual(0);
      expect(Number(foalRow.rows[0].quality)).toBeLessThanOrEqual(100);
    });
  });

  describe('mutlu yol — ÇAPRAZ SAHİP (damızlık ücreti TRANSFERİ)', () => {
    it('ödeyenin Çipi düşer, aygır sahibininki AYNI miktarda artar ve İKİ defter satırı yazılır', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Kısrak Sahibi');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Aygır Sahibi');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      await setBalance(payer.playerId, 5_000);
      await setBalance(stallionOwner.playerId, 100);

      const response = await breed(payer, payer.horseId, stallionOwner.horseId, 'Ücretli Tay', 201);

      expect(response.body.data.fee).toBe(starterStudFee());
      // Ödeyen KENDİ bakiyesini görür — istemci yeniden hesaplamasın diye.
      expect(response.body.data.payerBalance.money).toBe(5_000 - starterStudFee());
      // **SIZINTI YOK:** aygır sahibinin bakiyesi yanıtta HİÇ geçmez.
      expect(response.body.data.stallionOwnerBalance).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('stallionOwnerBalance');

      // (1) İki oyuncu satırı GERÇEKTEN güncellendi mi?
      const payerRow = await pool.query('SELECT money FROM players WHERE id = $1', [payer.playerId]);
      const ownerRow = await pool.query('SELECT money FROM players WHERE id = $1', [stallionOwner.playerId]);
      expect(Number(payerRow.rows[0].money)).toBe(5_000 - starterStudFee());
      expect(Number(ownerRow.rows[0].money)).toBe(100 + starterStudFee());

      // (2) Çift kaydı ücreti TAŞIR (0 değil).
      const pairRow = await pool.query('SELECT fee FROM breeding_pairs WHERE id = $1', [response.body.data.pairId]);
      expect(Number(pairRow.rows[0].fee)).toBe(starterStudFee());

      // (3) DEFTER — İKİ satır, AYNI `reference_id`, zıt işaretli. Bu
      // iddialar OLMASAYDI "para buharlaştı" ya da "yoktan var oldu" gibi
      // bir hata sessizce geçerdi.
      const ledger = await ledgerFor(response.body.data.pairId);
      expect(ledger).toHaveLength(2);
      const [debit, credit] = ledger;
      expect(debit.player_id).toBe(payer.playerId);
      expect(debit.type).toBe('breeding_stud_fee_debit');
      expect(Number(debit.amount)).toBe(-starterStudFee());
      expect(Number(debit.balance_before)).toBe(5_000);
      expect(Number(debit.balance_after)).toBe(5_000 - starterStudFee());
      expect(credit.player_id).toBe(stallionOwner.playerId);
      expect(credit.type).toBe('breeding_stud_fee_credit');
      expect(Number(credit.amount)).toBe(starterStudFee());
      expect(Number(credit.balance_before)).toBe(100);
      expect(Number(credit.balance_after)).toBe(100 + starterStudFee());
    });

    it('tay AY GİBİ KISRAK SAHİBİNİN ahırına doğar (ücreti ödeyen tayı alır)', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Tayı Alan');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Tayı Vermeyen');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      await setBalance(payer.playerId, 5_000);

      const payerBefore = await countHorses(payer.playerId);
      const ownerBefore = await countHorses(stallionOwner.playerId);

      const response = await breed(payer, payer.horseId, stallionOwner.horseId, 'Sahipli Tay', 201);

      expect(await countHorses(payer.playerId)).toBe(payerBefore + 1);
      expect(await countHorses(stallionOwner.playerId)).toBe(ownerBefore);
      const foalRow = await pool.query('SELECT owner_id FROM horses WHERE id = $1', [response.body.data.foalId]);
      expect(foalRow.rows[0].owner_id).toBe(payer.playerId);
    });
  });

  describe('YAZMA → OKUMA zinciri (bu dilimin varlık sebebi)', () => {
    it('doğan tay `GET /horses/:id/pedigree` çıktısında GERÇEKTEN görünür', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Zincir Kısrak');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Zincir Aygır');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, stallionOwner.horseId, 'Zincir Tayı', 201);
      const foalId = response.body.data.foalId as string;

      // `@Public()` — kimlik doğrulama GEREKMEZ (pazar akışı başkasının
      // atına bakabilmeli, bkz. pedigree.e2e-spec.ts).
      const pedigreeResponse = await request(app.getHttpServer()).get(pedigreeUrl(foalId)).expect(200);
      const pedigree = pedigreeResponse.body.data.pedigree;

      expect(pedigree.horseId).toBe(foalId);
      expect(pedigree.sireId).toBe(stallionOwner.horseId);
      expect(pedigree.damId).toBe(payer.horseId);
      // Ebeveynlerin kendi `pedigrees` satırı yok → büyükebeveynler `null`
      // kalır (UYDURULMAZ).
      expect(pedigree.grandSireId).toBeNull();
      expect(pedigree.grandDamId).toBeNull();

      // Adlar GERÇEKTEN çözülür — ham ID gösterilmez.
      expect(pedigreeResponse.body.data.horseNamesById[stallionOwner.horseId]).toBeTruthy();
      expect(pedigreeResponse.body.data.horseNamesById[payer.horseId]).toBeTruthy();
    });

    it('`horses.sire_id`/`dam_id` sütunları da yazılır (pedigrisi olmayan atlar için YEDEK kaynak)', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Yedek Kaynak Kısrak');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Yedek Kaynak Aygır');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, stallionOwner.horseId, 'Yedek Tayı', 201);

      // `pedigrees` satırı SİLİNİR: okuma yolu bu kez sütunlara düşmeli.
      await pool.query('DELETE FROM pedigrees WHERE horse_id = $1', [response.body.data.foalId]);

      const fallback = await request(app.getHttpServer()).get(pedigreeUrl(response.body.data.foalId)).expect(200);
      expect(fallback.body.data.pedigree.sireId).toBe(stallionOwner.horseId);
      expect(fallback.body.data.pedigree.damId).toBe(payer.horseId);
    });
  });

  describe('idempotency', () => {
    it('AYNI Idempotency-Key ile iki istek → TEK tay, TEK çift kaydı, TEK tahsilat', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Tekrar Çiftleştiren');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Tekrar Aygır');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      await setBalance(payer.playerId, 10_000);

      const key = randomUUID();
      const first = await breed(payer, payer.horseId, stallionOwner.horseId, 'Tek Tay', 201, key);
      const second = await breed(payer, payer.horseId, stallionOwner.horseId, 'Tek Tay', 201, key);

      // AYNI yanıt (yeniden işlenmedi).
      expect(second.body.data.pairId).toBe(first.body.data.pairId);
      expect(second.body.data.foalId).toBe(first.body.data.foalId);

      // TEK tahsilat — çift ücretlendirme YAPISAL olarak imkânsız.
      expect((await fetchBalance(payer.playerId, payer.authHeader)).money).toBe(10_000 - starterStudFee());
      expect(await countPairs(payer.horseId)).toBe(1);
      const foals = await pool.query('SELECT COUNT(*) FROM horses WHERE owner_id = $1', [payer.playerId]);
      expect(Number(foals.rows[0].count)).toBe(2); // kısrağın kendisi + 1 tay
      expect(await ledgerFor(first.body.data.pairId)).toHaveLength(2);
    });

    it('Idempotency-Key başlığı OLMADAN 400 döner ve hiçbir satır yazılmaz', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Anahtarsız Çiftleştiren');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Anahtarsız Aygır', 'stallion');
      await setBalance(payer.playerId, 5_000);

      const horsesBefore = await countHorses(payer.playerId);

      const response = await request(app.getHttpServer())
        .post(breedingUrl(payer.playerId))
        .set('Authorization', payer.authHeader)
        .send({ mareId: payer.horseId, stallionId, foalName: 'Anahtarsız Tay' })
        .expect(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      expect(await countHorses(payer.playerId)).toBe(horsesBefore);
      expect(await countPairs(payer.horseId)).toBe(0);
      expect((await fetchBalance(payer.playerId, payer.authHeader)).money).toBe(5_000);
    });
  });

  describe('reddedilen istek HİÇBİR şey yazmaz', () => {
    it('YETERSİZ BAKİYE 409 INSUFFICIENT_FUNDS döner ve **TAY DOĞMAZ**', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Yoksul Kısrak');
      const stallionOwner = await registerTestPlayerWithStarterHorse(app, 'Yoksul Aygır');
      await forceGender(payer.horseId, 'mare');
      await forceGender(stallionOwner.horseId, 'stallion');
      // Ücretin TAM BİR EKSİĞİ — sınırın hemen altı.
      await setBalance(payer.playerId, starterStudFee() - 1);
      await setBalance(stallionOwner.playerId, 0);

      const response = await breed(payer, payer.horseId, stallionOwner.horseId, 'Doğmayan Tay', 409);

      // **409, 400 DEĞİL** — `InsufficientFundsError` projede ZATEN
      // `HttpStatus.CONFLICT`'e eşlenmiştir ("yetersiz bakiye GEÇİCİDİR"
      // gerekçesi, bkz. `http-exception.filter.ts`); çiftleştirme yolu bu
      // sınıfı YENİDEN KULLANIR (brief §29 "duplicate economy
      // implementation oluşturma"), yani durum kodu da AYNIDIR.
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // ROLLBACK GERÇEKTEN BÜTÜN: bedava at kazanılmadı.
      expect(await countHorses(payer.playerId)).toBe(1);
      expect(await countPairs(payer.horseId)).toBe(0);
      expect((await fetchBalance(payer.playerId, payer.authHeader)).money).toBe(starterStudFee() - 1);
      expect((await fetchBalance(stallionOwner.playerId, stallionOwner.authHeader)).money).toBe(0);
    });

    it('KISRAK BAŞKASININSA 403 FORBIDDEN döner ve hiçbir satır yazılmaz', async () => {
      const attacker = await registerTestPlayerWithStarterHorse(app, 'Saldırgan Kısrak');
      const victim = await registerTestPlayerWithStarterHorse(app, 'Kurban Kısrak');
      await forceGender(victim.horseId, 'mare');
      const stallionId = await insertAdultHorse(attacker.playerId, 'Saldırgan Aygır', 'stallion');
      await setBalance(attacker.playerId, 10_000);

      // Saldırgan KENDİ adına istek atar ama KURBANIN kısrağını kullanır —
      // `assertSelf` bunu yakalayamaz (yol kendi id'si), kapı repository
      // içinde KİLİTLİ satır üzerinden kapanır (`MareNotOwnedError`).
      const response = await breed(attacker, victim.horseId, stallionId, 'Çalınan Tay', 403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(await countPairs(victim.horseId)).toBe(0);
      expect(await countHorses(victim.playerId)).toBe(1);
      expect((await fetchBalance(attacker.playerId, attacker.authHeader)).money).toBe(10_000);
    });
  });

  describe('uygunluk kapıları', () => {
    it('KISRAK COOLDOWN\'I: aynı kısrak ikinci kez 409 NOT_ELIGIBLE_FOR_BREEDING ile reddedilir', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Cooldown Kısrak');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Cooldown Aygır', 'stallion');

      const horsesBefore = await countHorses(payer.playerId);
      await breed(payer, payer.horseId, stallionId, 'İlk Tay', 201);
      expect(await countHorses(payer.playerId)).toBe(horsesBefore + 1);

      const response = await breed(payer, payer.horseId, stallionId, 'İkinci Tay', 409);

      expect(response.body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');
      // İkinci tay DOĞMADI: tek çift kaydı, tek tay.
      expect(await countPairs(payer.horseId)).toBe(1);
      expect(await countHorses(payer.playerId)).toBe(horsesBefore + 1);
    });

    it('AYNI AT hem kısrak hem aygır olamaz: 409 NOT_ELIGIBLE_FOR_BREEDING', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Kendisiyle');
      await forceGender(payer.horseId, 'mare');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, payer.horseId, 'İmkansız Tay', 409);
      expect(response.body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');
      expect(await countPairs(payer.horseId)).toBe(0);
    });

    it('CİNSİYET YANLIŞSA (kısrak yerine aygır) 409 NOT_ELIGIBLE_FOR_BREEDING', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Yanlış Cinsiyet');
      await forceGender(payer.horseId, 'stallion');
      const otherStallionId = await insertAdultHorse(payer.playerId, 'İkinci Aygır', 'stallion');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, otherStallionId, 'Olmaz Tay', 409);
      expect(response.body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');
      expect(await countPairs(payer.horseId)).toBe(0);
    });

    it('PAZARDA AKTİF İLANI olan at çiftleştirilemez: 409 HORSE_LISTED_IN_MARKET', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Pazarlık Kısrak');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Pazarlık Aygır', 'stallion');
      await setBalance(payer.playerId, 5_000);

      await pool.query(
        `INSERT INTO market_listings (seller_id, horse_id, price, listing_type, status)
         VALUES ($1, $2, 1000, 'fixed_price', 'active')`,
        [payer.playerId, payer.horseId],
      );

      const response = await breed(payer, payer.horseId, stallionId, 'Satılık Tay', 409);
      expect(response.body.error.code).toBe('HORSE_LISTED_IN_MARKET');
      expect(await countPairs(payer.horseId)).toBe(0);
    });

    it('AHIR KAPASİTESİ dolduysa 409 STABLE_CAPACITY_EXCEEDED döner', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Dolu Ahır');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'Dolu Ahır Aygırı', 'stallion');
      await setBalance(payer.playerId, 5_000);

      const capacity = config.stable.capacityByLevel['1'] as number;
      // Kapasiteye KADAR doldur (mevcut 2 at + eksik kalanlar).
      const existing = await countHorses(payer.playerId);
      for (let i = existing; i < capacity; i++) {
        await insertAdultHorse(payer.playerId, `Dolgu Atı ${i}`, 'gelding');
      }
      expect(await countHorses(payer.playerId)).toBe(capacity);

      const response = await breed(payer, payer.horseId, stallionId, 'Sığmayan Tay', 409);
      expect(response.body.error.code).toBe('STABLE_CAPACITY_EXCEEDED');
      expect(await countPairs(payer.horseId)).toBe(0);
    });
  });

  describe('girdi doğrulama', () => {
    it('var olmayan at 404 HORSE_NOT_FOUND döner', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Olmayan At');
      await forceGender(payer.horseId, 'mare');
      await setBalance(payer.playerId, 5_000);

      const response = await breed(payer, payer.horseId, randomUUID(), 'Hayalet Tay', 404);
      expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
    });

    it('UUID olmayan id 400 döner (ParseUUIDPipe — veritabanına hiç gidilmez)', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Geçersiz UUID');
      await forceGender(payer.horseId, 'mare');

      await breed(payer, 'gecerli-degil', payer.horseId, 'Geçersiz Tay', 400);
    });

    /**
     * CLAUDE.md "Kardeş tuzak": Vitest/esbuild altında DTO dekoratörleri
     * ATLANIR (`@IsString` hiç çalışmaz), ham gövde değeri use-case'e
     * olduğu gibi ulaşır. `validateHorseName` bu yüzden `unknown` kabul
     * eder — aksi halde `name.trim()` bir `TypeError` atar ve istemci
     * anlaşılmaz bir **500** görürdü (400 yerine). Bu iddialar o korumanın
     * GERÇEKTEN çalıştığının kanıtıdır.
     */
    it.each([
      ['çok kısa', 'A'],
      ['sayı', 123],
      ['nesne', { ad: 'Tay' }],
      ['boş', ''],
    ])('geçersiz tay ismi (%s) 400 VALIDATION_ERROR döner (500 DEĞİL)', async (_name, foalName) => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Geçersiz İsim');
      await forceGender(payer.horseId, 'mare');
      const stallionId = await insertAdultHorse(payer.playerId, 'İsim Aygırı', 'stallion');
      await setBalance(payer.playerId, 5_000);

      const horsesBefore = await countHorses(payer.playerId);

      const response = await breed(payer, payer.horseId, stallionId, foalName, 400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      // Geçersiz isimle hiçbir tay doğmadı.
      expect(await countHorses(payer.playerId)).toBe(horsesBefore);
      expect(await countPairs(payer.horseId)).toBe(0);
    });
  });

  describe('yetki', () => {
    it('BAŞKASI adına çiftleştirme 403 FORBIDDEN döner (assertSelf)', async () => {
      const attacker = await registerTestPlayerWithStarterHorse(app, 'Vekil Saldırgan');
      const victim = await registerTestPlayerWithStarterHorse(app, 'Vekil Kurban');
      await forceGender(victim.horseId, 'mare');
      const stallionId = await insertAdultHorse(victim.playerId, 'Vekil Aygır', 'stallion');
      await setBalance(victim.playerId, 5_000);

      const response = await request(app.getHttpServer())
        .post(breedingUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ mareId: victim.horseId, stallionId, foalName: 'Vekil Tay' })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      // Kurbanın ahırı ve parası YERİNDE.
      expect(await countHorses(victim.playerId)).toBe(2); // kısrak + aygır
      expect(await countPairs(victim.horseId)).toBe(0);
      expect((await fetchBalance(victim.playerId, victim.authHeader)).money).toBe(5_000);
    });

    it('kimlik doğrulanmadan 401 döner', async () => {
      const payer = await registerTestPlayerWithStarterHorse(app, 'Kimliksiz Çiftleştiren');
      await request(app.getHttpServer())
        .post(breedingUrl(payer.playerId))
        .set('Idempotency-Key', randomUUID())
        .send({ mareId: payer.horseId, stallionId: payer.horseId, foalName: 'Kimliksiz Tay' })
        .expect(401);
    });
  });
});
