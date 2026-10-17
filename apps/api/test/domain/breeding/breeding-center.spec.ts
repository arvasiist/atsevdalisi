import { describe, expect, it } from 'vitest';
import { loadGeneticsConfig, type GeneticsConfig } from '@at-sevdalisi/game-config';
import { calculateStudFee } from '../../../src/domain/breeding/breeding';
import {
  computeBirthOutcome,
  computeConceptionChance,
  computePregnancyCare,
  deriveFertility,
  expectedBirthAt,
  failedAttemptRestEndsAt,
  failedConceptionRefund,
  gestationDurationMs,
  inheritFertility,
  isConceived,
  isStudFeeWithinBounds,
  nextCheckupAvailableAt,
  pregnancyRiskLevel,
  pregnancyRiskMultiplier,
  studFeeBounds,
  validateBreedingCenterConfig,
} from '../../../src/domain/breeding/breeding-center';

const config = loadGeneticsConfig();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function withConfig(patch: (draft: GeneticsConfig) => void): GeneticsConfig {
  const draft = structuredClone(config);
  patch(draft);
  return draft;
}

describe('çiftleştirme merkezi — saf kurallar (brief §4–§5)', () => {
  it('config açılış doğrulamasından geçer', () => {
    expect(() => validateBreedingCenterConfig(config)).not.toThrow();
  });

  it('gebelik süresi gerçeğin ~1/5\'i: 335 gün × 0,2 = 67 gün (config\'ten, sabit kod değil)', () => {
    expect(gestationDurationMs(config)).toBe(Math.round(config.gestation.realWorldDays * config.gestation.timeScale * DAY));
    expect(gestationDurationMs(config) / DAY).toBeCloseTo(67, 0);
    const conceived = new Date('2026-10-16T12:00:00Z');
    expect(expectedBirthAt(conceived, config).getTime() - conceived.getTime()).toBe(gestationDurationMs(config));
  });

  it('doğurganlık kimlikten determinist, base ± spread içinde; tay ebeveyn ortalaması ± mutasyon', () => {
    const values = Array.from({ length: 200 }, (_, index) => deriveFertility(`horse-${index}`, config));
    expect(deriveFertility('horse-7', config)).toBe(deriveFertility('horse-7', config));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(config.fertility.base - config.fertility.spread);
      expect(value).toBeLessThanOrEqual(config.fertility.base + config.fertility.spread);
    }
    expect(new Set(values).size).toBeGreaterThan(10);
    expect(inheritFertility(60, 80, () => 0.5, config)).toBe(70);
    expect(inheritFertility(60, 80, () => 0, config)).toBe(70 - config.fertility.inheritanceMutation);
  });

  it('döllenme olasılığı asla %100 değil ve asla tabanın altında değil; doğurganlık + sağlık + yaş etkiler', () => {
    const best = computeConceptionChance({ mareFertility: 100, stallionFertility: 100, mareHealth: 100, mareLifeStage: 'prime' }, config);
    const worst = computeConceptionChance({ mareFertility: 0, stallionFertility: 0, mareHealth: 0, mareLifeStage: 'aging' }, config);
    expect(best).toBe(config.conception.maxChance);
    expect(best).toBeLessThan(1);
    expect(worst).toBe(config.conception.minChance);
    const neutral = computeConceptionChance({ mareFertility: 50, stallionFertility: 50, mareHealth: 100, mareLifeStage: 'prime' }, config);
    expect(neutral).toBeCloseTo(config.conception.baseChance, 6);
    const older = computeConceptionChance({ mareFertility: 50, stallionFertility: 50, mareHealth: 100, mareLifeStage: 'aging' }, config);
    expect(older).toBeCloseTo(neutral - config.conception.ageStagePenalty.aging!, 6);
    const sick = computeConceptionChance({ mareFertility: 50, stallionFertility: 50, mareHealth: 50, mareLifeStage: 'prime' }, config);
    expect(sick).toBeLessThan(neutral);
    expect(isConceived(0, 0.5)).toBe(true);
    expect(isConceived(0.5, 0.5)).toBe(false);
  });

  it('tutmayan denemeden sonra kısrak dinlenir', () => {
    const at = new Date('2026-10-16T00:00:00Z');
    expect(failedAttemptRestEndsAt(null, config)).toBeNull();
    expect(failedAttemptRestEndsAt(at, config)!.getTime() - at.getTime()).toBe(config.conception.failedAttemptCooldownHours * HOUR);
  });

  it('bakım puanı: beklenen kontrol + beslenen gün oranı; risk çarpanı tam bakımda min, hiç bakımda max', () => {
    const conceivedAt = new Date('2026-10-01T00:00:00Z');
    const at = new Date(conceivedAt.getTime() + 21 * DAY);
    const score = computePregnancyCare({ conceivedAt, at, checkupCount: 3, fedDays: 21 }, config);
    expect(score.expectedCheckups).toBe(Math.ceil((21 * 24) / config.pregnancyCare.checkupIntervalHours));
    expect(score.care).toBe(1);
    expect(score.nutrition).toBe(1);
    expect(pregnancyRiskMultiplier(score, config)).toBeCloseTo(config.pregnancyCare.minRiskMultiplier, 9);
    expect(pregnancyRiskMultiplier({ care: 0, nutrition: 0 }, config)).toBeCloseTo(config.pregnancyCare.maxRiskMultiplier, 9);
    const none = computePregnancyCare({ conceivedAt, at, checkupCount: 0, fedDays: 0 }, config);
    expect(none.care).toBe(0);
    expect(none.nutrition).toBe(0);
  });

  it('doğum sonucu: risk [0,1], tay sağlığı riskle düşer; risk düzeyi eşiklerden', () => {
    const good = computeBirthOutcome(0.05, config.pregnancyCare.minRiskMultiplier, config);
    const bad = computeBirthOutcome(0.05, config.pregnancyCare.maxRiskMultiplier, config);
    expect(bad.birthRisk).toBeGreaterThan(good.birthRisk);
    expect(bad.foalHealth).toBeLessThanOrEqual(good.foalHealth);
    expect(computeBirthOutcome(5, 2, config).birthRisk).toBe(1);
    expect(computeBirthOutcome(5, 2, config).foalHealth).toBe(100 - config.pregnancyCare.healthPenaltyAtFullRisk);
    expect(pregnancyRiskLevel(0, config)).toBe('low');
    expect(pregnancyRiskLevel(config.pregnancyCare.riskLevels.medium, config)).toBe('medium');
    expect(pregnancyRiskLevel(config.pregnancyCare.riskLevels.high, config)).toBe('high');
  });

  it('veteriner kontrolü aralığı', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    expect(nextCheckupAvailableAt(null, now, config)).toBeNull();
    const recent = new Date(now.getTime() - HOUR);
    expect(nextCheckupAvailableAt(recent, now, config)!.getTime()).toBe(recent.getTime() + config.pregnancyCare.checkupIntervalHours * HOUR);
    const old = new Date(now.getTime() - (config.pregnancyCare.checkupIntervalHours + 1) * HOUR);
    expect(nextCheckupAvailableAt(old, now, config)).toBeNull();
  });

  it('ilan ücreti formül ücretinin sınırları içinde tam sayı olmalı', () => {
    const stallion = { quality: 70, potential: 80 };
    const bounds = studFeeBounds(stallion, config);
    expect(bounds.suggested).toBe(calculateStudFee(stallion, config));
    expect(bounds.min).toBeLessThanOrEqual(bounds.suggested);
    expect(bounds.max).toBeGreaterThanOrEqual(bounds.suggested);
    expect(isStudFeeWithinBounds(bounds.suggested, bounds)).toBe(true);
    expect(isStudFeeWithinBounds(bounds.max + 1, bounds)).toBe(false);
    expect(isStudFeeWithinBounds(bounds.min - 1, bounds)).toBe(false);
    expect(isStudFeeWithinBounds(1000.5, bounds)).toBe(false);
    expect(isStudFeeWithinBounds('1000', bounds)).toBe(false);
  });

  it('tutmayan döllenmenin iadesi yüzdeyle, aşağı yuvarlanır ve ücreti aşamaz', () => {
    expect(failedConceptionRefund(1000, config)).toBe(Math.floor((1000 * config.breedingCenter.failedConceptionRefundPercent) / 100));
    const half = withConfig((draft) => {
      draft.breedingCenter.failedConceptionRefundPercent = 50;
    });
    expect(failedConceptionRefund(999, half)).toBe(499);
  });

  it('bozuk config API\'yi açtırmaz: kesin döllenme, para basan iade, sıfır gebelik', () => {
    expect(() => validateBreedingCenterConfig(withConfig((d) => { d.conception.maxChance = 1; }))).toThrow(/kesin/);
    expect(() => validateBreedingCenterConfig(withConfig((d) => { d.breedingCenter.failedConceptionRefundPercent = 101; }))).toThrow(/para basardı/);
    expect(() => validateBreedingCenterConfig(withConfig((d) => { d.gestation.timeScale = 0; }))).toThrow(/gestation/);
    expect(() => validateBreedingCenterConfig(withConfig((d) => { d.pregnancyCare.careWeight = 0.9; }))).toThrow(/careWeight/);
    expect(() => validateBreedingCenterConfig(withConfig((d) => { d.conception.failedAttemptCooldownHours = 0; }))).toThrow(/sınırsız/);
  });
});
