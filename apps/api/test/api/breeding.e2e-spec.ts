import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBreedsConfig, loadGeneticsConfig, loadHorseGrowthConfig } from '@at-sevdalisi/game-config';
import type { BreedingAttemptView } from '@at-sevdalisi/shared-types';
import { BreedingCenterUseCase } from '../../src/application/use-cases/breeding-center.use-case';
import { gestationDurationMs } from '../../src/domain/breeding/breeding-center';
import { getBreed } from '../../src/domain/horse/breeds';
import {
  api,
  bootstrapBreedingApp,
  insertBreedingHorse,
  moneyOf,
  setMoney,
  type BreedingKit,
} from './breeding-test-kit';
import { registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * ÇİFTLEŞTİRME (kendi çifti) + GEBELİK + DOĞUM — `POST /players/:id/breeding`
 * (16.10.2026, brief §5). Kanıtlanan şeyler:
 *   (1) tay ANINDA doğmaz: döllenme tutarsa gebelik (config süresi, sunucu
 *       saati), doğumu zamanlayıcı yapar; vakti gelmeden doğmaz, İKİ KEZ doğmaz,
 *   (2) döllenme olasılığı < 1; tutmayan deneme kısrağı dinlendirir,
 *   (3) tayın genetiği/cinsiyeti istemciye dönmez; doğumda soy, ırk, potansiyel
 *       tavanı, dört yardımcı tablo ve doğum riski gerçek sütunlara iner,
 *   (4) başkasının aygırı bu uçla KULLANILAMAZ (anlaşma şart),
 *   (5) gebe kısrak yeniden çiftleşemez, pazara çıkamaz; gebelik ahırda yer tutar,
 *   (6) uygunluk kapıları, idempotency, yetki ve girdi doğrulaması.
 */
const genetics = loadGeneticsConfig();
const growth = loadHorseGrowthConfig();
const breeds = loadBreedsConfig();
const GESTATION_MS = gestationDurationMs(genetics);
const MS_PER_HOUR = 3_600_000;

describe('Çiftleştirme + gebelik + doğum (e2e)', () => {
  let kit: BreedingKit;
  let pool: Pool;

  beforeAll(async () => {
    kit = await bootstrapBreedingApp();
    pool = kit.pool;
  });

  afterAll(async () => {
    await kit.app.close();
  });

  async function breeder(name: string): Promise<RegisteredTestPlayer> {
    const player = await registerTestPlayer(kit.app, name);
    await pool.query('UPDATE players SET stable_level = 3 WHERE id = $1', [player.playerId]);
    return player;
  }

  async function pair(player: RegisteredTestPlayer, options: Parameters<typeof insertBreedingHorse>[4] = {}) {
    const mareId = await insertBreedingHorse(pool, player.playerId, 'Kısrak', 'mare', options);
    const stallionId = await insertBreedingHorse(pool, player.playerId, 'Aygır', 'stallion', options);
    return { mareId, stallionId };
  }

  function breed(player: RegisteredTestPlayer, mareId: string, stallionId: string, foalName: unknown = 'Tay', key: string = randomUUID()) {
    return api(kit, player).post(`/players/${player.playerId}/breeding`, { mareId, stallionId, foalName }, key);
  }

  async function count(sql: string, params: unknown[]): Promise<number> {
    const result = await pool.query<{ count: string }>(sql, params);
    return Number(result.rows[0]!.count);
  }

  const horsesOf = (playerId: string) => count('SELECT COUNT(*) FROM horses WHERE owner_id = $1', [playerId]);

  describe('döllenme → gebelik → doğum', () => {
    it('tutan döllenme gebelik başlatır: tay YOK, süre config\'ten, genetik ve cinsiyet istemciye dönmez, para hareketi yok', async () => {
      const player = await breeder('Gebelik Başlatan');
      const { mareId, stallionId } = await pair(player);
      const moneyBefore = await moneyOf(pool, player.playerId);
      const horsesBefore = await horsesOf(player.playerId);

      kit.random.push(0); // zar < olasılık → tutar
      const response = await breed(player, mareId, stallionId, 'Gelecek Tay').expect(201);
      const attempt = response.body.data as BreedingAttemptView;

      expect(attempt.outcome).toBe('conceived');
      expect(attempt.conceptionChance).toBeGreaterThan(0);
      expect(attempt.conceptionChance).toBeLessThan(1);
      const pregnancy = attempt.pregnancy!;
      expect(pregnancy).toMatchObject({ mareId, stallionId, foalName: 'Gelecek Tay', status: 'gestating', foalId: null, fee: 0 });
      expect(new Date(pregnancy.expectedBirthAt).getTime() - new Date(pregnancy.conceivedAt).getTime()).toBe(GESTATION_MS);
      for (const secret of ['genetics', 'foalStats', 'gender', 'seed', 'potential']) {
        expect(JSON.stringify(response.body)).not.toContain(`"${secret}"`);
      }
      expect(await horsesOf(player.playerId)).toBe(horsesBefore);
      expect(await moneyOf(pool, player.playerId)).toBe(moneyBefore);
      expect(await count("SELECT COUNT(*) FROM economy_transactions WHERE reference_id = $1", [pregnancy.pregnancyId])).toBe(0);
      expect(await count('SELECT COUNT(*) FROM breeding_attempts WHERE pregnancy_id = $1 AND succeeded', [pregnancy.pregnancyId])).toBe(1);
    });

    it('doğum vakti gelmeden olmaz; vaktinde TEK tay doğar (eşzamanlı iki tur dahil); soy + çift kaydı + bildirim aynı tx', async () => {
      const player = await breeder('Doğum Bekleyen');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0);
      const attempt = (await breed(player, mareId, stallionId, 'Zamanında').expect(201)).body.data as BreedingAttemptView;
      const pregnancyId = attempt.pregnancy!.pregnancyId;
      const due = new Date(attempt.pregnancy!.expectedBirthAt);

      await kit.scheduler.tickNow(new Date(due.getTime() - 60_000));
      const stillGestating = await pool.query('SELECT status, foal_id FROM pregnancies WHERE id = $1', [pregnancyId]);
      expect(stillGestating.rows[0].status).toBe('gestating');
      const foalId = stillGestating.rows[0].foal_id as string;
      expect(await count('SELECT COUNT(*) FROM horses WHERE id = $1', [foalId])).toBe(0);

      // İki ayrı use-case turu aynı anda: satır kilidi + gestating→born geçişi tek doğum bırakır.
      const useCase = kit.app.get(BreedingCenterUseCase);
      const [a, b] = await Promise.all([useCase.runDue(due), useCase.runDue(due)]);
      expect(a.births + b.births).toBeGreaterThanOrEqual(1);
      expect(await count('SELECT COUNT(*) FROM horses WHERE id = $1', [foalId])).toBe(1);
      expect(await count('SELECT COUNT(*) FROM breeding_pairs WHERE foal_id = $1', [foalId])).toBe(1);
      expect((await kit.scheduler.tickNow(due))?.births ?? 0).toBe(0);

      const foal = await pool.query('SELECT owner_id, name, sire_id, dam_id, status FROM horses WHERE id = $1', [foalId]);
      expect(foal.rows[0]).toMatchObject({ owner_id: player.playerId, name: 'Zamanında', sire_id: stallionId, dam_id: mareId, status: 'active' });
      const pedigree = await api(kit, player).get(`/horses/${foalId}/pedigree`).expect(200);
      expect(pedigree.body.data.pedigree).toMatchObject({ sireId: stallionId, damId: mareId });
      const born = await pool.query('SELECT status, born_at FROM pregnancies WHERE id = $1', [pregnancyId]);
      expect(born.rows[0].status).toBe('born');
      expect(await count("SELECT COUNT(*) FROM notifications WHERE player_id = $1 AND type = 'foal_born' AND payload->>'foalId' = $2", [player.playerId, foalId])).toBe(1);

      for (const table of ['horse_stats', 'horse_health', 'horse_surface_stats', 'horse_distance_stats']) {
        expect(await count(`SELECT COUNT(*) FROM ${table} WHERE horse_id = $1`, [foalId]), `${table} satırı`).toBe(1);
      }
      // Doğum sağlık riski gerçek sütuna iner ve tay sağlığıyla tutarlıdır.
      const health = await pool.query('SELECT h.health, hh.injury_risk FROM horses h JOIN horse_health hh ON hh.horse_id = h.id WHERE h.id = $1', [foalId]);
      const risk = Number(health.rows[0].injury_risk) / 100;
      expect(Number(health.rows[0].health)).toBe(Math.round(100 - risk * genetics.pregnancyCare.healthPenaltyAtFullRisk));

      // Görünümde artık doğmuş + tay kimliği.
      const center = await api(kit, player).get('/breeding/center').expect(200);
      const view = center.body.data.pregnancies.find((p: { pregnancyId: string }) => p.pregnancyId === pregnancyId);
      expect(view).toMatchObject({ status: 'born', foalId });
    });

    it('sunucu yeniden başlasa da gebelik kaybolmaz: ikinci uygulama örneği vakti gelen tayı doğurur', async () => {
      const player = await breeder('Yeniden Başlatma');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0);
      const attempt = (await breed(player, mareId, stallionId, 'Kalıcı').expect(201)).body.data as BreedingAttemptView;
      const second = await bootstrapBreedingApp();
      try {
        const result = await second.scheduler.tickNow(new Date(attempt.pregnancy!.expectedBirthAt));
        expect(result?.births).toBeGreaterThanOrEqual(1);
        expect(await count("SELECT COUNT(*) FROM pregnancies WHERE id = $1 AND status = 'born'", [attempt.pregnancy!.pregnancyId])).toBe(1);
      } finally {
        await second.app.close();
      }
    });

    it('IRK + POTANSİYEL: Safkan Arap × Safkan İngiliz → Anglo-Arap; potansiyel tavanı aşılmaz', async () => {
      const player = await breeder('Melez Yetiştirici');
      const mareId = await insertBreedingHorse(pool, player.playerId, 'Çöl Kısrağı', 'mare', { breed: 'arabian' });
      const stallionId = await insertBreedingHorse(pool, player.playerId, 'Hipodrom Aygırı', 'stallion', { breed: 'thoroughbred' });
      kit.random.push(0);
      const attempt = (await breed(player, mareId, stallionId, 'Melez Tay').expect(201)).body.data as BreedingAttemptView;
      await kit.scheduler.tickNow(new Date(attempt.pregnancy!.expectedBirthAt));
      const foal = await pool.query<{ id: string; breed: string; potential: string; fertility: number }>(
        'SELECT h.id, h.breed, h.potential, h.fertility FROM pregnancies p JOIN horses h ON h.id = p.foal_id WHERE p.id = $1',
        [attempt.pregnancy!.pregnancyId],
      );
      expect(foal.rows[0]!.breed).toBe('anglo_arab');
      expect(Number(foal.rows[0]!.potential)).toBeLessThanOrEqual(80 * genetics.maxPotentialGainOverParents);
      const anglo = getBreed(breeds, 'anglo_arab');
      const distance = await pool.query('SELECT middle_distance FROM horse_distance_stats WHERE horse_id = $1', [foal.rows[0]!.id]);
      expect(Math.abs(Number(distance.rows[0].middle_distance) - anglo.distance.middle!)).toBeLessThanOrEqual(breeds.statJitter);
      // Doğurganlık ebeveyn ortalaması ± mutasyon (iki ebeveyn 70).
      expect(Math.abs(foal.rows[0]!.fertility - 70)).toBeLessThanOrEqual(genetics.fertility.inheritanceMutation);
    });
  });

  describe('döllenme olasılığı + dinlenme', () => {
    it('tutmayan deneme: gebelik yok, deneme kaydı var, kısrak dinlenir; dinlenme bitince yeniden denenir', async () => {
      const player = await breeder('Tutmayan');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0.999_999);
      const response = await breed(player, mareId, stallionId).expect(201);
      const attempt = response.body.data as BreedingAttemptView;
      expect(attempt).toMatchObject({ outcome: 'not_conceived', pregnancy: null });
      expect(attempt.mareRestEndsAt).not.toBeNull();
      expect(await count('SELECT COUNT(*) FROM pregnancies WHERE mare_id = $1', [mareId])).toBe(0);
      expect(await count('SELECT COUNT(*) FROM breeding_attempts WHERE mare_id = $1 AND NOT succeeded', [mareId])).toBe(1);

      const resting = await breed(player, mareId, stallionId).expect(409);
      expect(resting.body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');
      expect(resting.body.error.message).toMatch(/dinleniyor/);

      await pool.query('UPDATE breeding_attempts SET created_at = created_at - make_interval(hours => $2) WHERE mare_id = $1', [
        mareId,
        genetics.conception.failedAttemptCooldownHours + 1,
      ]);
      kit.random.push(0);
      expect((await breed(player, mareId, stallionId).expect(201)).body.data.outcome).toBe('conceived');
    });

    it('olasılık doğurganlık + sağlıkla değişir, asla 1 değildir (sunucu hesaplar, kayda yazar)', async () => {
      const player = await breeder('Olasılık');
      const fertile = await pair(player, { fertility: 100, health: 100 });
      kit.random.push(0.999_999);
      const high = (await breed(player, fertile.mareId, fertile.stallionId).expect(201)).body.data.conceptionChance as number;
      expect(high).toBe(genetics.conception.maxChance);

      const weak = await pair(player, { fertility: 20, health: 60 });
      kit.random.push(0.999_999);
      const low = (await breed(player, weak.mareId, weak.stallionId).expect(201)).body.data.conceptionChance as number;
      expect(low).toBeLessThan(high);
      expect(low).toBeGreaterThanOrEqual(genetics.conception.minChance);
      const stored = await pool.query('SELECT chance FROM breeding_attempts WHERE mare_id = $1', [weak.mareId]);
      expect(Number(stored.rows[0].chance)).toBe(low);
    });
  });

  describe('gebelik kuralları', () => {
    it('gebe kısrak yeniden çiftleşemez (MARE_PREGNANT) ve pazara çıkamaz (HORSE_BREEDING_COMMITMENT)', async () => {
      const player = await breeder('Gebe Kısrak');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0);
      await breed(player, mareId, stallionId).expect(201);
      const again = await breed(player, mareId, stallionId).expect(409);
      expect(again.body.error.message).toMatch(/gebe/);
      const listing = await api(kit, player).post('/market/listings', { horseId: mareId, price: 1000 }, null).expect(409);
      expect(listing.body.error.code).toBe('HORSE_BREEDING_COMMITMENT');
    });

    it('gebelik ahırda yer tutar: dolu ahır yeni gebelik ve yeni at almayı keser', async () => {
      const player = await registerTestPlayer(kit.app, 'Dolu Ahır');
      const capacity = 5; // stable.capacityByLevel["1"]
      const { mareId, stallionId } = await pair(player);
      // Başlangıç atı + kısrak + aygır + dolgu = kapasite − 1 → tek boş yer; gebelik onu alır.
      for (let index = 0; index < capacity - 4; index++) {
        await insertBreedingHorse(pool, player.playerId, `Dolgu ${index}`, 'stallion');
      }
      kit.random.push(0);
      await breed(player, mareId, stallionId).expect(201);
      // Test kısayolu: ikinci çift SQL ile eklenir (kapasite kapısını atlar).
      const second = await pair(player);
      const occupied = await count(
        `SELECT (SELECT COUNT(*) FROM horses WHERE owner_id = $1) + (SELECT COUNT(*) FROM pregnancies WHERE owner_id = $1 AND status = 'gestating') AS count`,
        [player.playerId],
      );
      expect(occupied).toBeGreaterThan(capacity);
      kit.random.push(0);
      const blocked = await breed(player, second.mareId, second.stallionId).expect(409);
      expect(blocked.body.error.code).toBe('STABLE_CAPACITY_EXCEEDED');
    });

    it('veteriner kontrolü: ücret + defter, aralık dolmadan 409, başkasının gebeliği 404; bakım puanı yükselir', async () => {
      const player = await breeder('Bakımlı Gebelik');
      const stranger = await breeder('Yabancı');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0);
      const pregnancyId = ((await breed(player, mareId, stallionId).expect(201)).body.data as BreedingAttemptView).pregnancy!.pregnancyId;
      await setMoney(pool, player.playerId, 5_000);

      const checkup = await api(kit, player).post(`/breeding/pregnancies/${pregnancyId}/checkups`).expect(201);
      expect(checkup.body.data.care.checkups).toBe(1);
      expect(checkup.body.data.care.careScore).toBeGreaterThan(0);
      expect(checkup.body.data.care.nextCheckupAt).not.toBeNull();
      expect(await moneyOf(pool, player.playerId)).toBe(5_000 - genetics.pregnancyCare.checkupCost);
      const ledger = await pool.query("SELECT amount FROM economy_transactions WHERE reference_id = $1 AND type = 'pregnancy_vet_check'", [pregnancyId]);
      expect(ledger.rows.map((row) => Number(row.amount))).toEqual([-genetics.pregnancyCare.checkupCost]);

      const tooSoon = await api(kit, player).post(`/breeding/pregnancies/${pregnancyId}/checkups`).expect(409);
      expect(tooSoon.body.error.code).toBe('PREGNANCY_CHECKUP_TOO_SOON');
      await api(kit, stranger).post(`/breeding/pregnancies/${pregnancyId}/checkups`).expect(404);
      await api(kit, player).post(`/breeding/pregnancies/${pregnancyId}/checkups`, {}, null).expect(400);

      await setMoney(pool, player.playerId, 0);
      await pool.query('UPDATE pregnancy_checkups SET created_at = created_at - make_interval(hours => $2) WHERE pregnancy_id = $1', [
        pregnancyId,
        genetics.pregnancyCare.checkupIntervalHours + 1,
      ]);
      const broke = await api(kit, player).post(`/breeding/pregnancies/${pregnancyId}/checkups`).expect(409);
      expect(broke.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('doğum sonrası bekleme OYUN AYIdır: süre geçmeden aynı kısrak yeniden çiftleşemez', async () => {
      const player = await breeder('Doğum Sonrası');
      const { mareId, stallionId } = await pair(player);
      kit.random.push(0);
      const attempt = (await breed(player, mareId, stallionId).expect(201)).body.data as BreedingAttemptView;
      const bornAt = new Date(attempt.pregnancy!.expectedBirthAt);
      await kit.scheduler.tickNow(bornAt);
      // Doğum "şimdi" gibi kayıtlı olsun: bekleme süresi gerçekten ölçülsün.
      await pool.query('UPDATE breeding_pairs SET created_at = now() WHERE mare_id = $1', [mareId]);
      const early = await breed(player, mareId, stallionId).expect(409);
      expect(early.body.error.message).toMatch(/dinlenmedi/);
      const waitDays = Math.ceil(genetics.breedingCooldownMonths / growth.gameMonthsPerRealDay) + 1;
      await pool.query('UPDATE breeding_pairs SET created_at = now() - make_interval(days => $2) WHERE mare_id = $1', [mareId, waitDays]);
      kit.random.push(0);
      await breed(player, mareId, stallionId).expect(201);
    });
  });

  describe('anlaşma + uygunluk kapıları', () => {
    it('BAŞKASININ aygırı bu uçla kullanılamaz: 409 BREEDING_REQUIRES_AGREEMENT, hiçbir satır yazılmaz', async () => {
      const mareOwner = await breeder('Kısrak Sahibi');
      const stallionOwner = await breeder('Aygır Sahibi');
      const mareId = await insertBreedingHorse(pool, mareOwner.playerId, 'Kısrak', 'mare');
      const stallionId = await insertBreedingHorse(pool, stallionOwner.playerId, 'Yabancı Aygır', 'stallion');
      const response = await breed(mareOwner, mareId, stallionId).expect(409);
      expect(response.body.error.code).toBe('BREEDING_REQUIRES_AGREEMENT');
      expect(await count('SELECT COUNT(*) FROM breeding_attempts WHERE mare_id = $1', [mareId])).toBe(0);
    });

    it('kısrak başkasınınsa 403; emekli olmayan at 409; tay sınırı 409; yaşlı aygır 409; aynı at / yanlış cinsiyet 409', async () => {
      const player = await breeder('Kapılar');
      const other = await breeder('Başkası');
      const { mareId, stallionId } = await pair(player);
      const foreignMare = await insertBreedingHorse(pool, other.playerId, 'Elin Kısrağı', 'mare');
      expect((await breed(player, foreignMare, stallionId).expect(403)).body.error.code).toBe('FORBIDDEN');

      const activeMare = await insertBreedingHorse(pool, player.playerId, 'Aktif', 'mare', { retired: false });
      expect((await breed(player, activeMare, stallionId).expect(409)).body.error.message).toMatch(/emekli/i);

      expect((await breed(player, mareId, mareId).expect(409)).body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');
      expect((await breed(player, stallionId, mareId).expect(409)).body.error.code).toBe('NOT_ELIGIBLE_FOR_BREEDING');

      const pastFoal = await insertBreedingHorse(pool, player.playerId, 'Eski Tay', 'stallion');
      for (let index = 0; index < genetics.lifetimeFoalLimit.mare; index++) {
        await pool.query(
          `INSERT INTO breeding_pairs (mare_id, stallion_id, fee, foal_id, created_at) VALUES ($1, $2, 0, $3, now() - interval '400 days')`,
          [mareId, stallionId, pastFoal],
        );
      }
      expect((await breed(player, mareId, stallionId).expect(409)).body.error.message).toMatch(/tay sınırı/i);

      const freshMare = await insertBreedingHorse(pool, player.playerId, 'Taze Kısrak', 'mare');
      const days = Math.ceil((genetics.maxBreedingAgeMonths - 60 + 1) / growth.gameMonthsPerRealDay);
      await pool.query(
        `UPDATE horses SET aging_started_at = now() - make_interval(days => $2),
                           birth_date = (now() - make_interval(days => $2) - interval '60 months')::date WHERE id = $1`,
        [stallionId, days],
      );
      expect((await breed(player, freshMare, stallionId).expect(409)).body.error.message).toMatch(/yaşlı/i);
    });

    it('pazarda aktif ilanı olan at çiftleştirilemez: 409 HORSE_LISTED_IN_MARKET', async () => {
      const player = await breeder('İlandaki');
      const { mareId, stallionId } = await pair(player);
      const listingId = randomUUID();
      await pool.query(
        `INSERT INTO market_listings (id, seller_id, horse_id, price, listing_type, status) VALUES ($1, $2, $3, 1000, 'fixed_price', 'active')`,
        [listingId, player.playerId, stallionId],
      );
      try {
        expect((await breed(player, mareId, stallionId).expect(409)).body.error.code).toBe('HORSE_LISTED_IN_MARKET');
      } finally {
        // Fikstür ilanı kaldırılır: pazar e2e'si genel ilan listesini sayar (aynı DB, sıralı koşu).
        await pool.query('DELETE FROM market_listings WHERE id = $1', [listingId]);
      }
    });

    it('aynı Idempotency-Key → TEK deneme; anahtar yoksa 400; başkası adına 403; UUID değil 400; kimliksiz 401', async () => {
      const player = await breeder('İdempotent');
      const other = await breeder('Başka Oyuncu');
      const { mareId, stallionId } = await pair(player);
      const key = randomUUID();
      kit.random.push(0);
      const first = await breed(player, mareId, stallionId, 'Tek', key).expect(201);
      const replay = await breed(player, mareId, stallionId, 'Tek', key);
      expect([201, 409]).toContain(replay.status);
      if (replay.status === 201) expect(replay.body.data.attemptId).toBe(first.body.data.attemptId);
      expect(await count('SELECT COUNT(*) FROM breeding_attempts WHERE mare_id = $1', [mareId])).toBe(1);

      await api(kit, player).post(`/players/${player.playerId}/breeding`, { mareId, stallionId, foalName: 'X' }, null).expect(400);
      await api(kit, other).post(`/players/${player.playerId}/breeding`, { mareId, stallionId, foalName: 'X' }).expect(403);
      await api(kit, player).post(`/players/${player.playerId}/breeding`, { mareId: 'x', stallionId, foalName: 'X' }).expect(400);
      expect((await breed(player, mareId, stallionId, '').expect(400)).body.error).toBeDefined();
      const { default: request } = await import('supertest');
      await request(kit.app.getHttpServer()).post(`/api/v1/players/${player.playerId}/breeding`).send({}).expect(401);
    });
  });

  it('gebelik takvimi sunucu saatiyle: ilerleme zamanla artar, istemci saatinden bağımsız', async () => {
    const player = await breeder('Takvim');
    const { mareId, stallionId } = await pair(player);
    kit.random.push(0);
    const attempt = (await breed(player, mareId, stallionId).expect(201)).body.data as BreedingAttemptView;
    await pool.query(
      `UPDATE pregnancies SET conceived_at = conceived_at - make_interval(hours => $2),
                              expected_birth_at = expected_birth_at - make_interval(hours => $2) WHERE id = $1`,
      [attempt.pregnancy!.pregnancyId, Math.round(GESTATION_MS / MS_PER_HOUR / 2)],
    );
    const center = await api(kit, player).get('/breeding/center').expect(200);
    const view = center.body.data.pregnancies.find((p: { pregnancyId: string }) => p.pregnancyId === attempt.pregnancy!.pregnancyId);
    expect(view.progress).toBeGreaterThan(0.45);
    expect(view.progress).toBeLessThan(0.55);
    expect(['low', 'medium', 'high']).toContain(view.riskLevel);
  });
});
