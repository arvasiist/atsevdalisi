import { describe, expect, it } from 'vitest';
import { applyVitalDelta, checkTrainingReadiness } from '../../../src/domain/horse/vital-signs';

const thresholds = { minEnergyToTrain: 15, maxFatigueToTrain: 90 };

describe('applyVitalDelta', () => {
  it('delta değerlerini doğru şekilde uygular', () => {
    const result = applyVitalDelta(
      { health: 95, fitness: 90, fatigue: 10, energy: 95, morale: 90 },
      { fatigue: 15, energy: -10 },
    );
    expect(result.fatigue).toBe(25);
    expect(result.energy).toBe(85);
  });

  it('üst sınırı (100) aşmaz', () => {
    const result = applyVitalDelta(
      { health: 98, fitness: 98, fatigue: 5, energy: 98, morale: 98 },
      { health: 10, morale: 10 },
    );
    expect(result.health).toBe(100);
    expect(result.morale).toBe(100);
  });

  it('alt sınırı (0) aşmaz', () => {
    const result = applyVitalDelta(
      { health: 5, fitness: 5, fatigue: 95, energy: 5, morale: 5 },
      { health: -20, energy: -20 },
    );
    expect(result.health).toBe(0);
    expect(result.energy).toBe(0);
  });

  it('girdi nesnesini değiştirmez (saf fonksiyon)', () => {
    const vitals = { health: 50, fitness: 50, fatigue: 50, energy: 50, morale: 50 };
    applyVitalDelta(vitals, { health: 10 });
    expect(vitals.health).toBe(50);
  });
});

describe('checkTrainingReadiness', () => {
  it('tüm eşikler karşılanınca ready: true döner', () => {
    const result = checkTrainingReadiness(
      { health: 90, fitness: 80, fatigue: 20, energy: 80, morale: 80 },
      thresholds,
    );
    expect(result).toEqual({ ready: true, reason: null });
  });

  it('fatigue eşiği aşılınca HORSE_TOO_TIRED döner', () => {
    const result = checkTrainingReadiness(
      { health: 90, fitness: 80, fatigue: 95, energy: 80, morale: 80 },
      thresholds,
    );
    expect(result).toEqual({ ready: false, reason: 'HORSE_TOO_TIRED' });
  });

  it('energy eşiğin altına düşünce INSUFFICIENT_ENERGY döner', () => {
    const result = checkTrainingReadiness(
      { health: 90, fitness: 80, fatigue: 20, energy: 5, morale: 80 },
      thresholds,
    );
    expect(result).toEqual({ ready: false, reason: 'INSUFFICIENT_ENERGY' });
  });
});
