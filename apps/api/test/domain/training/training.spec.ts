import { describe, expect, it } from 'vitest';
import {
  applyTraining,
  calculateFatigueGain,
  calculateInjuryRisk,
  calculateStatGain,
  getPrimaryStatKey,
  rollInjuryOccurred,
} from '../../../src/domain/training/training';
import { HorseNotReadyForTrainingError } from '../../../src/domain/training/errors';
import trainingConfig from '../../../../../config/training.config.json';
import type { TrainingConfig } from '@at-sevdalisi/game-config';

const config = trainingConfig as unknown as TrainingConfig;
const goodVitals = { health: 90, fitness: 80, fatigue: 20, energy: 80, morale: 80 };

/**
 * docs/ALGORITHMS.md §1 formüllerinin doğrulaması (brief §75 MVP kriteri:
 * "Antrenman stat/fatigue etkisi oluşturuyor").
 */
describe('calculateStatGain', () => {
  it('potansiyele yaklaştıkça kazanç azalır (diminishing returns)', () => {
    const low = calculateStatGain(config, {
      trainingType: 'speed',
      intensity: 'medium',
      durationMinutes: 30,
      currentStatValue: 30,
      potential: 90,
      vitals: goodVitals,
    });
    const high = calculateStatGain(config, {
      trainingType: 'speed',
      intensity: 'medium',
      durationMinutes: 30,
      currentStatValue: 85,
      potential: 90,
      vitals: goodVitals,
    });
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(high);
  });

  it('stat potansiyele ulaştıysa kazanç 0 olur', () => {
    const gain = calculateStatGain(config, {
      trainingType: 'speed',
      intensity: 'high',
      durationMinutes: 30,
      currentStatValue: 90,
      potential: 90,
      vitals: goodVitals,
    });
    expect(gain).toBe(0);
  });

  it('stat asla potansiyeli aşmaz', () => {
    const gain = calculateStatGain(config, {
      trainingType: 'speed',
      intensity: 'high',
      durationMinutes: 60,
      currentStatValue: 89.5,
      potential: 90,
      vitals: goodVitals,
    });
    expect(89.5 + gain).toBeLessThanOrEqual(90 + 1e-9);
  });
});

describe('calculateFatigueGain', () => {
  it('yoğunluk arttıkça fatigue artar', () => {
    const low = calculateFatigueGain(config, {
      trainingType: 'stamina',
      intensity: 'low',
      durationMinutes: 30,
      vitals: goodVitals,
    });
    const high = calculateFatigueGain(config, {
      trainingType: 'stamina',
      intensity: 'high',
      durationMinutes: 30,
      vitals: goodVitals,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('rest türü fatigue düşürür', () => {
    const restFatigue = calculateFatigueGain(config, {
      trainingType: 'rest',
      intensity: 'low',
      durationMinutes: 30,
      vitals: goodVitals,
    });
    expect(restFatigue).toBeLessThan(0);
  });
});

describe('calculateInjuryRisk', () => {
  it('yorgun/sağlıksız/genç-yaşlı atlarda risk daha yüksektir', () => {
    const riskLow = calculateInjuryRisk(config, {
      trainingType: 'sprint',
      intensity: 'low',
      vitals: { ...goodVitals, fatigue: 10, health: 95 },
      ageMonths: 50,
    });
    const riskHigh = calculateInjuryRisk(config, {
      trainingType: 'sprint',
      intensity: 'high',
      vitals: { ...goodVitals, fatigue: 90, health: 40 },
      ageMonths: 200,
    });
    expect(riskHigh).toBeGreaterThan(riskLow);
    expect(riskLow).toBeGreaterThanOrEqual(0);
    expect(riskHigh).toBeLessThanOrEqual(1);
  });
});

describe('applyTraining', () => {
  it('at hazır değilse HorseNotReadyForTrainingError fırlatır', () => {
    expect(() =>
      applyTraining(config, {
        trainingType: 'speed',
        intensity: 'medium',
        durationMinutes: 30,
        currentStatValue: 30,
        potential: 90,
        vitals: { ...goodVitals, fatigue: 95 },
        ageMonths: 50,
      }),
    ).toThrow(HorseNotReadyForTrainingError);
  });

  it('hazır at için tutarlı bir sonuç döner', () => {
    const outcome = applyTraining(config, {
      trainingType: 'speed',
      intensity: 'medium',
      durationMinutes: 30,
      currentStatValue: 30,
      potential: 90,
      vitals: goodVitals,
      ageMonths: 50,
    });
    expect(outcome.statGain).toBeGreaterThan(0);
    expect(outcome.fatigueGain).toBeGreaterThan(0);
    expect(outcome.injuryRisk).toBeGreaterThanOrEqual(0);
  });
});

describe('rollInjuryOccurred', () => {
  it('aynı seed ile deterministik sonuç üretir', () => {
    const r1 = rollInjuryOccurred(0.5, 'session-123:injury');
    const r2 = rollInjuryOccurred(0.5, 'session-123:injury');
    expect(r1).toBe(r2);
  });

  it('risk 0 ise asla, risk 1 ise her zaman sakatlık oluşur', () => {
    expect(rollInjuryOccurred(0, 'session-123:injury')).toBe(false);
    expect(rollInjuryOccurred(1, 'session-123:injury')).toBe(true);
  });
});

/** FAZ 1 wiring, dördüncü dilim — `POST /horses/{id}/train`'in `statChanges` eşlemesi. */
describe('getPrimaryStatKey', () => {
  it('her antrenman türünü doğru birincil stat alanına eşler', () => {
    expect(getPrimaryStatKey('speed')).toBe('speed');
    expect(getPrimaryStatKey('sprint')).toBe('sprint');
    expect(getPrimaryStatKey('stamina')).toBe('stamina');
    expect(getPrimaryStatKey('start')).toBe('startSpeed');
    expect(getPrimaryStatKey('cornering')).toBe('cornering');
    expect(getPrimaryStatKey('tempo')).toBe('midSpeed');
  });

  it('"rest" türü için null döner (hiçbir stat\'ı etkilemez)', () => {
    expect(getPrimaryStatKey('rest')).toBeNull();
  });
});
