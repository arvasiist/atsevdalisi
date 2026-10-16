import { describe, expect, it } from 'vitest';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { HorseStatus } from '@at-sevdalisi/shared-types';
import raceConfigJson from '../../../../../config/race.config.json';
import type { VitalSigns } from '../../../src/domain/horse/vital-signs';
import { checkRaceReadiness, type RaceReadinessThresholds } from '../../../src/domain/race/readiness';
import { STARTER_HORSE_AGE_MONTHS } from '../../../src/domain/horse/horse';

/**
 * Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
 * yarışabilsinler". Bu dosya, `vital-signs.spec.ts`teki
 * `checkTrainingReadiness` testleriyle AYNI desen: eşikler GERÇEK
 * `config/race.config.json`'dan okunur (elle kurulmuş bir fixture DEĞİL),
 * böylece config değiştiğinde testler de anlamlı kalır.
 *
 * NEDEN AYRI EŞİKLER: antrenman yorgun bir atla YAPILABİLİR (enerji ≥ 15,
 * yorgunluk ≤ 90) ama yarış YAPILAMAZ (enerji ≥ 30, yorgunluk ≤ 70) —
 * bu, ayrı bir config bloğu olmasının tek nedenidir ve aşağıdaki test
 * bu farkın GERÇEKTEN korunduğunu doğrular.
 */
const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const thresholds: RaceReadinessThresholds = raceConfig.readiness;

/** Yeni doğmuş bir atın değerleri (`domain/horse/horse.ts` `createStarterHorse`) — hepsi eşiklerin içinde. */
const healthyVitals: VitalSigns = { health: 100, fitness: 50, fatigue: 0, energy: 100, morale: 80 };
/** 15.10.2026 — B12: başlangıç atının oyun yaşı (48 ay) — yarış yaşının üstünde. */
const ADULT = STARTER_HORSE_AGE_MONTHS;

describe('checkRaceReadiness — hazır durumlar', () => {
  it('yeni bir başlangıç atı yarışa HAZIRdır (aksi hâlde hiçbir oyuncu yarışamazdı)', () => {
    const result = checkRaceReadiness('active', healthyVitals, thresholds, ADULT);
    expect(result.ready).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('eşik değerlerinde SINIRDA olmak engel DEĞİLDİR (tam eşik yeterlidir)', () => {
    const borderline: VitalSigns = {
      ...healthyVitals,
      health: thresholds.minHealth,
      fatigue: thresholds.maxFatigue,
      energy: thresholds.minEnergy,
    };
    expect(checkRaceReadiness('active', borderline, thresholds, ADULT).ready).toBe(true);
  });
});

describe('checkRaceReadiness — engeller', () => {
  it('at active değilse HORSE_NOT_ACTIVE döner', () => {
    for (const status of ['injured', 'resting', 'retired'] as const) {
      const result = checkRaceReadiness(status, healthyVitals, thresholds, ADULT);
      expect(result.ready).toBe(false);
      expect(result.reason).toBe('HORSE_NOT_ACTIVE');
    }
  });

  it('sağlık eşiğin altındaysa INSUFFICIENT_HEALTH döner', () => {
    const result = checkRaceReadiness('active', { ...healthyVitals, health: thresholds.minHealth - 1 }, thresholds, ADULT);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_HEALTH');
  });

  it('yorgunluk eşiğin üstündeyse HORSE_TOO_TIRED döner', () => {
    const result = checkRaceReadiness('active', { ...healthyVitals, fatigue: thresholds.maxFatigue + 1 }, thresholds, ADULT);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('HORSE_TOO_TIRED');
  });

  it('enerji eşiğin altındaysa INSUFFICIENT_ENERGY döner', () => {
    const result = checkRaceReadiness('active', { ...healthyVitals, energy: thresholds.minEnergy - 1 }, thresholds, ADULT);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_ENERGY');
  });

  /**
   * Kontrol SIRASI bilinçlidir ve DETERMİNİSTİKTİR: istemci tek bir mesaj
   * göstereceği için, birden fazla koşul birden ihlal edilse bile HER
   * ZAMAN tek bir neden döner. Sıra "en kalıcıdan en geçiciye"dir.
   */
  it('birden fazla koşul ihlal edilse bile TEK ve ÖNGÖRÜLEBİLİR bir neden döner', () => {
    const allBad: VitalSigns = { health: 0, fitness: 0, fatigue: 100, energy: 0, morale: 0 };
    // Durum önce gelir.
    expect(checkRaceReadiness('retired', allBad, thresholds, ADULT).reason).toBe('HORSE_NOT_ACTIVE');
    // Durum iyiyse sağlık, sonra yorgunluk, en son enerji.
    expect(checkRaceReadiness('active', allBad, thresholds, ADULT).reason).toBe('INSUFFICIENT_HEALTH');
    expect(checkRaceReadiness('active', { ...allBad, health: 100 }, thresholds, ADULT).reason).toBe('HORSE_TOO_TIRED');
    expect(checkRaceReadiness('active', { ...allBad, health: 100, fatigue: 0 }, thresholds, ADULT).reason).toBe(
      'INSUFFICIENT_ENERGY',
    );
  });
});

describe('yarış eşikleri antrenman eşiklerinden DAHA SIKIdır', () => {
  /**
   * Bu test, ileride biri "aynı eşikleri kullansak olur" diye iki config
   * bloğunu birleştirirse kırılır — ve kırılmalıdır: yorgun bir atı
   * antrenmana sokabilmek ama yarışa sokamamak bilinçli bir oyun
   * kararıdır (proje sahibinin "hazır olan kişiler yarışabilsinler"
   * talebi).
   */
  it('minEnergy yarışta antrenmandan yüksektir', () => {
    const trainingConfig = { minEnergyToTrain: 15, maxFatigueToTrain: 90 };
    expect(thresholds.minEnergy).toBeGreaterThan(trainingConfig.minEnergyToTrain);
  });

  it('maxFatigue yarışta antrenmandan düşüktür', () => {
    const trainingConfig = { minEnergyToTrain: 15, maxFatigueToTrain: 90 };
    expect(thresholds.maxFatigue).toBeLessThan(trainingConfig.maxFatigueToTrain);
  });
});

describe('HorseStatus tipiyle uyum', () => {
  it('tüm at durumları için bir sonuç döner (tanımsız/çökme yok)', () => {
    const statuses: HorseStatus[] = ['active', 'injured', 'resting', 'retired'];
    for (const status of statuses) {
      const result = checkRaceReadiness(status, healthyVitals, thresholds, ADULT);
      expect(typeof result.ready).toBe('boolean');
      // "Hazır" ise neden YOK, "hazır değil"se neden VAR — ikisi asla
      // çelişmez (istemci `reason`a koşulsuz güvenebilir).
      expect(result.ready ? result.reason === null : result.reason !== null).toBe(true);
    }
  });
});

/** 15.10.2026 — B12: yarış için asgari yaş. */
describe('checkRaceReadiness — yarış yaşı', () => {
  it('config yarış yaşı tanımlar ve başlangıç atı ondan büyüktür (yoksa yeni oyuncu yarışamazdı)', () => {
    expect(thresholds.minAgeMonths).toBeGreaterThan(0);
    expect(STARTER_HORSE_AGE_MONTHS).toBeGreaterThanOrEqual(thresholds.minAgeMonths);
  });

  it('yaşı dolmamış tay HORSE_TOO_YOUNG; tam yaşında yarışabilir', () => {
    expect(checkRaceReadiness('active', healthyVitals, thresholds, 0).reason).toBe('HORSE_TOO_YOUNG');
    expect(checkRaceReadiness('active', healthyVitals, thresholds, thresholds.minAgeMonths - 1).reason).toBe(
      'HORSE_TOO_YOUNG',
    );
    expect(checkRaceReadiness('active', healthyVitals, thresholds, thresholds.minAgeMonths).ready).toBe(true);
  });

  it('sıra: durum önce, yaş sonra, sağlık daha sonra', () => {
    const allBad: VitalSigns = { health: 0, fitness: 0, fatigue: 100, energy: 0, morale: 0 };
    expect(checkRaceReadiness('injured', allBad, thresholds, 0).reason).toBe('HORSE_NOT_ACTIVE');
    expect(checkRaceReadiness('active', allBad, thresholds, 0).reason).toBe('HORSE_TOO_YOUNG');
  });
});

