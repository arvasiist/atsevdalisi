import { describe, expect, it } from 'vitest';
import {
  calculateJockeyHorseCompatibility,
  calculateJockeySkillComposite,
  hireJockey,
} from '../../../src/domain/jockey/jockey';
import { JockeyAlreadyOwnedError } from '../../../src/domain/jockey/errors';
import jockeyConfigJson from '../../../../../config/jockey.config.json';
import type { JockeyConfig } from '@at-sevdalisi/game-config';
import type { Jockey } from '@at-sevdalisi/shared-types';

const config = jockeyConfigJson as unknown as JockeyConfig;

const strongSkills = { startSkill: 90, tacticalSkill: 90, sprintSkill: 90, horseControl: 90, riskManagement: 90, trackKnowledge: 90 };
const weakSkills = { startSkill: 30, tacticalSkill: 30, sprintSkill: 30, horseControl: 30, riskManagement: 30, trackKnowledge: 30 };

/** RaceEntrantSnapshot.jockeySkillComposite için (bkz. domain/race/base-ability.ts). */
describe('calculateJockeySkillComposite', () => {
  it('daha yetenekli bir jokey daha yüksek kompozit puan alır', () => {
    expect(calculateJockeySkillComposite(strongSkills, config)).toBeGreaterThan(
      calculateJockeySkillComposite(weakSkills, config),
    );
  });

  it('sonuç [0, 100] aralığındadır', () => {
    const composite = calculateJockeySkillComposite(strongSkills, config);
    expect(composite).toBeLessThanOrEqual(100);
    expect(composite).toBeGreaterThanOrEqual(0);
  });
});

/** docs/ALGORITHMS.md §12 jokey-at uyumu. */
describe('calculateJockeyHorseCompatibility', () => {
  it('ateşli (yüksek temperament) bir at için yüksek horseControl daha iyi uyum verir', () => {
    const fieryHorse = { temperament: 90, racingStyle: 'closer' as const };
    const badFit = calculateJockeyHorseCompatibility(
      { horse: fieryHorse, jockey: { ...weakSkills, experience: 10 }, previousPairAveragePerformance: null },
      config,
    );
    const goodFit = calculateJockeyHorseCompatibility(
      { horse: fieryHorse, jockey: { ...strongSkills, experience: 10 }, previousPairAveragePerformance: null },
      config,
    );
    expect(goodFit).toBeGreaterThan(badFit);
  });

  it('sakin bir at, düşük horseControl becerili bir jokeyle bile ateşli attan daha iyi uyum verir', () => {
    const fieryHorse = { temperament: 90, racingStyle: 'closer' as const };
    const calmHorse = { temperament: 10, racingStyle: 'closer' as const };
    const jockey = { ...weakSkills, experience: 10 };
    const fieryFit = calculateJockeyHorseCompatibility({ horse: fieryHorse, jockey, previousPairAveragePerformance: null }, config);
    const calmFit = calculateJockeyHorseCompatibility({ horse: calmHorse, jockey, previousPairAveragePerformance: null }, config);
    expect(calmFit).toBeGreaterThan(fieryFit);
  });

  it('geçmiş ortak performans verilmezse nötr varsayılan kullanılır (hata fırlatmaz)', () => {
    const horse = { temperament: 50, racingStyle: 'mid_pack' as const };
    expect(() =>
      calculateJockeyHorseCompatibility({ horse, jockey: { ...weakSkills, experience: 0 }, previousPairAveragePerformance: null }, config),
    ).not.toThrow();
  });
});

describe('hireJockey', () => {
  const jockey: Jockey = {
    id: 'j1',
    name: 'Test Jokey',
    experience: 10,
    startSkill: 50,
    tacticalSkill: 50,
    sprintSkill: 50,
    horseControl: 50,
    riskManagement: 50,
    trackKnowledge: 50,
    salary: 500,
    ownerId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('sahipsiz bir jokeyi kiralar', () => {
    const hired = hireJockey(jockey, 'player-1');
    expect(hired.ownerId).toBe('player-1');
  });

  it('zaten sahiplenilmiş bir jokeyi kiralamaya çalışırsa hata fırlatır', () => {
    const hired = hireJockey(jockey, 'player-1');
    expect(() => hireJockey(hired, 'player-2')).toThrow(JockeyAlreadyOwnedError);
  });
});
