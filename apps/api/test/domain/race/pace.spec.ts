import { describe, expect, it } from 'vitest';
import { computeFinalStretchFraction, derivePaceEffect, derivePaceScore } from '../../../src/domain/race/pace';
import raceConfigJson from '../../../../../config/race.config.json';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;

/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — `pace.ts` bu oturumdan ÖNCE
 * HİÇ test edilmiyordu (bkz. `apps/api/test/domain/race/` dizininde eksik
 * dosya) — atın "kişiliğini" (önden gitme/kapanış) belirleyen bu modül,
 * denetimin talep ettiği testsiz kritik değişiklik boşluğunun tam
 * kendisiydi. Bu dosya hem YENİ mesafe-duyarlılığını hem de PACE
 * sisteminin temel davranışını doğrular.
 */
describe('computeFinalStretchFraction', () => {
  it('1600m (mevcut TEK kullanılan yarış mesafesi, PRACTICE_RACE_DISTANCE_METERS) için TAM OLARAK eski sabit 0.75 eşiğini üretir (400/1600 = 0.25)', () => {
    expect(computeFinalStretchFraction(1600, raceConfig.pace)).toBeCloseTo(0.25, 10);
  });

  it('çok kısa bir mesafede MAX_FINAL_STRETCH_FRACTION üst sınırına kırpılır (final düzlük yarışın tamamı OLAMAZ)', () => {
    const fraction = computeFinalStretchFraction(500, raceConfig.pace);
    expect(fraction).toBeLessThanOrEqual(0.4);
  });

  it('çok uzun bir mesafede MIN_FINAL_STRETCH_FRACTION alt sınırına kırpılır (final düzlük anlamsız derecede kısa bir an OLAMAZ)', () => {
    const fraction = computeFinalStretchFraction(20000, raceConfig.pace);
    expect(fraction).toBeGreaterThanOrEqual(0.1);
  });

  it('mesafe arttıkça oran (kırpma bölgesi dışındayken) monotonik olarak azalır — pist geometrisine duyarlılık', () => {
    const short = computeFinalStretchFraction(2000, raceConfig.pace);
    const long = computeFinalStretchFraction(3200, raceConfig.pace);
    expect(long).toBeLessThan(short);
  });
});

describe('derivePaceEffect', () => {
  const distanceMeters = 1600;

  it('front_runner erken aşamada pozisyon bonusu alır, final düzlükte (kişilik "geç kapanamaz") KAYBEDER', () => {
    const early = derivePaceEffect('front_runner', 0.1, distanceMeters, raceConfig.pace);
    const late = derivePaceEffect('front_runner', 0.9, distanceMeters, raceConfig.pace);
    expect(early.performanceBonus).toBeGreaterThan(0);
    expect(late.performanceBonus).toBe(0);
    expect(early.staminaConsumptionMultiplier).toBeGreaterThan(1);
  });

  it('closer erken aşamada bonus ALMAZ, final düzlükte (kişilik "geç kapanır") bonus ALIR', () => {
    const early = derivePaceEffect('closer', 0.1, distanceMeters, raceConfig.pace);
    const late = derivePaceEffect('closer', 0.9, distanceMeters, raceConfig.pace);
    expect(early.performanceBonus).toBe(0);
    expect(late.performanceBonus).toBeGreaterThan(0);
    expect(early.staminaConsumptionMultiplier).toBeLessThan(1);
  });

  it('tracker/mid_pack her zaman nötr profildedir (bonus/ceza yok)', () => {
    const effect = derivePaceEffect('tracker', 0.9, distanceMeters, raceConfig.pace);
    expect(effect.performanceBonus).toBe(0);
    expect(effect.staminaConsumptionMultiplier).toBe(1);
  });

  it('AYNI positionFraction (0.8), FARKLI mesafelerde closer için farklı sonuç verebilir (geometriye duyarlılık kanıtı): uzun bir yarışta 0.8 henüz "final düzlük" DEĞİLDİR, kısa bir yarışta OLABİLİR', () => {
    const inShortRace = derivePaceEffect('closer', 0.8, 1000, raceConfig.pace);
    const inLongRace = derivePaceEffect('closer', 0.8, 3200, raceConfig.pace);
    // 1000m: fraction = clamp(400/1000, .1, .4) = .4 → late stage >= 0.6 → 0.8 GEÇ aşamadır.
    expect(inShortRace.performanceBonus).toBeGreaterThan(0);
    // 3200m: fraction = clamp(400/3200, .1, .4) = .125 → late stage >= 0.875 → 0.8 HENÜZ geç değildir.
    expect(inLongRace.performanceBonus).toBe(0);
  });
});

/**
 * `RaceSegmentSnapshot.paceScore` (bu turda EKLENDİ) — motorun zaten
 * ürettiği `staminaConsumptionMultiplier`'ı istemciye gösterilebilir bir
 * 0-100 "tempo" puanına çeviren saf fonksiyon. Testler, eşlemenin
 * config'teki GERÇEK çarpan değerleriyle (1.15 / 1.0 / 0.97) tutarlı
 * olduğunu ve kırpmanın sınırlarda çalıştığını doğrular.
 */
describe('derivePaceScore', () => {
  it('nötr çarpan (1.0) tam olarak 50 verir — "normalden ne sert ne yumuşak" ekseninin merkezi', () => {
    expect(derivePaceScore(1)).toBe(50);
  });

  it('config degerindeki frontRunnerStaminaMultiplier (1.15) 65 verir — nötrün ÜSTÜNDE, yani "normalden sert"', () => {
    expect(derivePaceScore(raceConfig.pace.frontRunnerStaminaMultiplier)).toBeCloseTo(65, 10);
  });

  it('config degerindeki closerStaminaMultiplier (0.97) 47 verir — nötrün ALTINDA, yani "enerji tasarrufu"', () => {
    expect(derivePaceScore(raceConfig.pace.closerStaminaMultiplier)).toBeCloseTo(47, 10);
  });

  it('tracker/mid_pack profili (çarpan tam 1) ile closer profili arasındaki sıralama korunur: closer daha tasarruflu', () => {
    const tracker = derivePaceScore(derivePaceEffect('tracker', 0.9, 1600, raceConfig.pace).staminaConsumptionMultiplier);
    const closer = derivePaceScore(derivePaceEffect('closer', 0.9, 1600, raceConfig.pace).staminaConsumptionMultiplier);
    const frontRunner = derivePaceScore(derivePaceEffect('front_runner', 0.1, 1600, raceConfig.pace).staminaConsumptionMultiplier);
    expect(closer).toBeLessThan(tracker);
    expect(tracker).toBeLessThan(frontRunner);
  });

  it('0-100 aralığının DIŞINA kırpılır (dejenere/gelecekteki aşırı config değerlerine karşı güvenlik)', () => {
    expect(derivePaceScore(0)).toBe(0);
    expect(derivePaceScore(5)).toBe(100);
  });

  it('deterministiktir — aynı girdi her zaman aynı çıktıyı verir', () => {
    expect(derivePaceScore(1.07)).toBe(derivePaceScore(1.07));
  });

  it('kayan nokta gürültüsünü TEMİZLER: config çarpanları tam 65/47 verir, 64.99999999999999/47.00000000000001 DEĞİL', () => {
    // `1.15 - 1` kayan noktada tam `0.15` DEĞİLDİR — yuvarlama olmadan bu
    // değerler demo fixture'ına ve telemetriye `64.99999999999999` olarak
    // sızıyordu (bkz. `derivePaceScore` içindeki yorum).
    expect(derivePaceScore(raceConfig.pace.frontRunnerStaminaMultiplier)).toBe(65);
    expect(derivePaceScore(raceConfig.pace.closerStaminaMultiplier)).toBe(47);
  });
});
