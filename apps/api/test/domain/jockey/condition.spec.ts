import { describe, expect, it } from 'vitest';
import { loadJockeyConfig, type JockeyConditionConfig } from '@at-sevdalisi/game-config';
import {
  computeJockeyCondition,
  formLabel,
  placementPercentile,
  validateJockeyConditionConfig,
} from '../../../src/domain/jockey/condition';
import { effectiveJockeySkill } from '../../../src/domain/jockey/jockey';

const jockeyConfig = loadJockeyConfig();
const config = jockeyConfig.condition;
const wins = (count: number) => Array.from({ length: count }, () => ({ finishPosition: 1, fieldSize: 8 }));
const lasts = (count: number) => Array.from({ length: count }, () => ({ finishPosition: 8, fieldSize: 8 }));

describe('jokey durumu: form + yorgunluk (08.10.2026)', () => {
  it('config geçerli', () => {
    expect(validateJockeyConditionConfig(config)).toEqual([]);
  });

  it('sıra yüzdeliği: birinci 100, sonuncu 0, tek at 100, geçersiz satır sayılmaz', () => {
    expect(placementPercentile({ finishPosition: 1, fieldSize: 8 })).toBe(100);
    expect(placementPercentile({ finishPosition: 8, fieldSize: 8 })).toBe(0);
    expect(placementPercentile({ finishPosition: 2, fieldSize: 3 })).toBe(50);
    expect(placementPercentile({ finishPosition: 1, fieldSize: 1 })).toBe(100);
    expect(placementPercentile({ finishPosition: 9, fieldSize: 8 })).toBeNull();
    expect(placementPercentile({ finishPosition: 0, fieldSize: 8 })).toBeNull();
  });

  it('geçmişi olmayan jokey TAM nötr (çarpan 1, etiket unknown)', () => {
    const view = computeJockeyCondition({ recentPlacements: [], ridesInWindow: 0 }, config);
    expect(view).toMatchObject({ form: 'unknown', formRides: 0, formPercent: 0, fatiguePercent: 0, multiplier: 1 });
  });

  it('formMinRides altında form sayılmaz', () => {
    const view = computeJockeyCondition({ recentPlacements: wins(config.formMinRides - 1), ridesInWindow: 0 }, config);
    expect(view.form).toBe('unknown');
    expect(view.multiplier).toBe(1);
  });

  it('iyi form artırır, kötü form düşürür; simetrik ve formInfluence ile sınırlı', () => {
    const hot = computeJockeyCondition({ recentPlacements: wins(config.formSampleSize), ridesInWindow: 0 }, config);
    const cold = computeJockeyCondition({ recentPlacements: lasts(config.formSampleSize), ridesInWindow: 0 }, config);
    expect(hot.form).toBe('hot');
    expect(cold.form).toBe('cold');
    expect(hot.multiplier).toBeCloseTo(1 + config.formInfluence, 10);
    expect(cold.multiplier).toBeCloseTo(1 - config.formInfluence, 10);
  });

  it('formSampleSize dışındaki eski binişler sayılmaz (en yeni önce)', () => {
    const history = [...wins(config.formSampleSize), ...lasts(20)];
    const view = computeJockeyCondition({ recentPlacements: history, ridesInWindow: 0 }, config);
    expect(view.formRides).toBe(config.formSampleSize);
    expect(view.form).toBe('hot');
  });

  it('yorgunluk: ücretsiz binişe kadar yok, sonra biniş başına, tavanla sınırlı', () => {
    const at = (rides: number) => computeJockeyCondition({ recentPlacements: [], ridesInWindow: rides }, config);
    expect(at(config.freeRidesInWindow).fatiguePercent).toBe(0);
    expect(at(config.freeRidesInWindow + 1).multiplier).toBeCloseTo(1 - config.fatiguePenaltyPerRide, 10);
    expect(at(1000).multiplier).toBeCloseTo(1 - config.maxFatiguePenalty, 10);
    expect(at(1000).fatiguePercent).toBeCloseTo(config.maxFatiguePenalty * 100, 6);
  });

  it('etiket bantları', () => {
    expect(formLabel(null, config)).toBe('unknown');
    expect(formLabel(config.formBands.hot, config)).toBe('hot');
    expect(formLabel(config.formBands.good, config)).toBe('good');
    expect(formLabel(50, config)).toBe('average');
    expect(formLabel(config.formBands.poor, config)).toBe('poor');
    expect(formLabel(config.formBands.cold, config)).toBe('cold');
  });

  it('effectiveJockeySkill çarpanı uygular; verilmezse eski değer (motor girdisi geriye uyumlu)', () => {
    const jockey = {
      startSkill: 70,
      tacticalSkill: 70,
      sprintSkill: 70,
      horseControl: 70,
      riskManagement: 70,
      trackKnowledge: 70,
      experience: 40,
    };
    const base = { jockey, horse: { temperament: 40, racingStyle: 'mid_pack' as const }, previousPairAveragePerformance: null };
    const old = effectiveJockeySkill(base, jockeyConfig);
    expect(effectiveJockeySkill({ ...base, conditionMultiplier: 1 }, jockeyConfig)).toBe(old);
    expect(effectiveJockeySkill({ ...base, conditionMultiplier: 0.95 }, jockeyConfig)).toBeCloseTo(old * 0.95, 10);
  });

  it('bozuk config reddedilir', () => {
    const broken: JockeyConditionConfig = {
      ...config,
      formMinRides: config.formSampleSize + 1,
      formBands: { hot: 60, good: 70, poor: 40, cold: 30 },
      maxFatiguePenalty: 1,
    };
    const problems = validateJockeyConditionConfig(broken);
    expect(problems.some((p) => p.includes('formMinRides'))).toBe(true);
    expect(problems.some((p) => p.includes('formBands'))).toBe(true);
    expect(problems.some((p) => p.includes('maxFatiguePenalty'))).toBe(true);
  });
});
