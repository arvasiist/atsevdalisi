import { describe, expect, it } from 'vitest';
import { loadJockeyConfig } from '@at-sevdalisi/game-config';
import {
  calculateJockeyHorseCompatibility,
  calculateJockeySkillComposite,
  effectiveJockeySkill,
} from '../../../src/domain/jockey/jockey';

/**
 * JOKEY-AT UYUMU (02.10.2026). `calculateJockeyHorseCompatibility` bu tarihe
 * kadar HİÇBİR yerden çağrılmıyordu; artık kadro dondurulurken beceri puanını
 * ölçekler (motor değişmez). Etki config'ten okunur; 0 eski davranıştır.
 */
const config = loadJockeyConfig();

const jockey = {
  startSkill: 60,
  tacticalSkill: 60,
  sprintSkill: 60,
  horseControl: 60,
  riskManagement: 60,
  trackKnowledge: 60,
  experience: 75,
};

describe('effectiveJockeySkill', () => {
  it('etki config\'ten okunur ve sıfırdan büyüktür', () => {
    expect(config.compatibilityInfluence).toBeGreaterThan(0);
  });

  it('etki 0 → eski davranış (salt beceri puanı)', () => {
    const value = effectiveJockeySkill(
      { jockey, horse: { temperament: 90, racingStyle: 'closer' }, previousPairAveragePerformance: 10 },
      { ...config, compatibilityInfluence: 0 },
    );
    expect(value).toBeCloseTo(calculateJockeySkillComposite(jockey, config), 10);
  });

  it('uyum 50 ise puan değişmez; iyi uyum artırır, kötü uyum düşürür', () => {
    const composite = calculateJockeySkillComposite(jockey, config);
    const calm = { temperament: 10, racingStyle: 'mid_pack' as const };
    const fiery = { temperament: 95, racingStyle: 'mid_pack' as const };
    const good = effectiveJockeySkill({ jockey, horse: calm, previousPairAveragePerformance: 90 }, config);
    const bad = effectiveJockeySkill({ jockey, horse: fiery, previousPairAveragePerformance: 10 }, config);
    expect(calculateJockeyHorseCompatibility({ jockey, horse: calm, previousPairAveragePerformance: 90 }, config)).toBeGreaterThan(50);
    expect(good).toBeGreaterThan(composite);
    expect(bad).toBeLessThan(composite);
    // Etki sınırı: en fazla ±compatibilityInfluence oranı.
    expect(good).toBeLessThanOrEqual(composite * (1 + config.compatibilityInfluence) + 1e-9);
    expect(bad).toBeGreaterThanOrEqual(composite * (1 - config.compatibilityInfluence) - 1e-9);
  });

  it('0-100 aralığına kırpılır', () => {
    const top = { ...jockey, startSkill: 100, tacticalSkill: 100, sprintSkill: 100, horseControl: 100, riskManagement: 100, trackKnowledge: 100, experience: 500 };
    const value = effectiveJockeySkill(
      { jockey: top, horse: { temperament: 0, racingStyle: 'mid_pack' }, previousPairAveragePerformance: 100 },
      { ...config, compatibilityInfluence: 1 },
    );
    expect(value).toBe(100);
  });
});
