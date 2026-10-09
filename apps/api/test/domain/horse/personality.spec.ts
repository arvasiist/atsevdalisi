import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHorsePersonalityConfig, loadTrainingConfig, type HorsePersonalityConfig } from '@at-sevdalisi/game-config';
import {
  PERSONALITY_TRAIT_COLUMNS,
  PERSONALITY_TRAIT_KEYS,
  computePersonalityTrainingEffects,
  deriveBirthPersonality,
  describePersonality,
  validateHorsePersonalityConfig,
} from '../../../src/domain/horse/personality';
import { calculateStatGain } from '../../../src/domain/training/training';

const config = loadHorsePersonalityConfig();
const neutralTraits = Object.fromEntries(PERSONALITY_TRAIT_KEYS.map((key) => [key, config.neutral]));

describe('at kişiliği (08.10.2026)', () => {
  it('config geçerli; kişilik sütunları migration 0003 ile birebir', () => {
    expect(validateHorsePersonalityConfig(config)).toEqual([]);
    const migration = readFileSync(
      join(__dirname, '../../../../../database/migrations/0003_create_horse_stat_tables.up.sql'),
      'utf8',
    );
    for (const column of Object.values(PERSONALITY_TRAIT_COLUMNS)) {
      expect(migration).toMatch(new RegExp(`\\b${column}\\s+NUMERIC\\(5,2\\) NOT NULL DEFAULT 50`));
    }
  });

  it('doğuş: at kimliğinden determinist, aralık içinde, temperament nötr kalır, çeşitlilik var', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    const births = ids.map((id) => deriveBirthPersonality(id, config));
    expect(deriveBirthPersonality(ids[0]!, config)).toEqual(births[0]);
    for (const birth of births) {
      expect(birth.temperament).toBeUndefined();
      for (const trait of config.birth.traits) {
        const value = birth[trait]!;
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(config.neutral - config.birth.spread);
        expect(value).toBeLessThanOrEqual(config.neutral + config.birth.spread);
      }
    }
    // "Her at 50" geri gelmesin: her özellik en az 20 farklı değer alır.
    for (const trait of config.birth.traits) {
      expect(new Set(births.map((birth) => birth[trait])).size).toBeGreaterThan(20);
    }
    // Etiket dağılımı: hem "Dengeli" hem etiketli at doğar.
    const labelled = births.filter((birth) => describePersonality(birth, config).traits.length > 0).length;
    expect(labelled).toBeGreaterThan(0);
    expect(labelled).toBeLessThan(births.length);
  });

  it('listeye özellik eklemek diğerlerinin doğuş değerini kaydırmaz', () => {
    const narrower: HorsePersonalityConfig = { ...config, birth: { ...config.birth, traits: ['focus'] } };
    const id = '11111111-2222-4333-8444-555555555555';
    expect(deriveBirthPersonality(id, narrower).focus).toBe(deriveBirthPersonality(id, config).focus);
  });

  it('nötr at = TAM no-op (eski atlar ve SQL fikstürleri değişmez)', () => {
    for (const intensity of ['low', 'medium', 'high'] as const) {
      expect(computePersonalityTrainingEffects(neutralTraits, intensity, config)).toEqual({
        gainMultiplier: 1,
        fatigueMultiplier: 1,
        injuryRiskMultiplier: 1,
      });
    }
    expect(computePersonalityTrainingEffects({}, 'high', config)).toEqual({
      gainMultiplier: 1,
      fatigueMultiplier: 1,
      injuryRiskMultiplier: 1,
    });
  });

  it('yön: odak kazancı, stres dayanımı yorgunluğu, itaat sakatlığı düşürür/artırır', () => {
    const high = (trait: string) => ({ ...neutralTraits, [trait]: 80 });
    const low = (trait: string) => ({ ...neutralTraits, [trait]: 20 });
    expect(computePersonalityTrainingEffects(high('focus'), 'medium', config).gainMultiplier).toBeGreaterThan(1);
    expect(computePersonalityTrainingEffects(low('focus'), 'medium', config).gainMultiplier).toBeLessThan(1);
    expect(computePersonalityTrainingEffects(high('stressResistance'), 'medium', config).fatigueMultiplier).toBeLessThan(1);
    expect(computePersonalityTrainingEffects(low('stressResistance'), 'medium', config).fatigueMultiplier).toBeGreaterThan(1);
    expect(computePersonalityTrainingEffects(high('obedience'), 'medium', config).injuryRiskMultiplier).toBeLessThan(1);
    expect(computePersonalityTrainingEffects(low('obedience'), 'medium', config).injuryRiskMultiplier).toBeGreaterThan(1);
  });

  it('rekabetçilik bir ÖDÜNLEŞİMDİR: yoğunda artı, hafifte eksi; rahat at tersine', () => {
    const driven = { ...neutralTraits, competitiveness: 80 };
    const relaxed = { ...neutralTraits, competitiveness: 20 };
    expect(computePersonalityTrainingEffects(driven, 'high', config).gainMultiplier).toBeGreaterThan(1);
    expect(computePersonalityTrainingEffects(driven, 'low', config).gainMultiplier).toBeLessThan(1);
    expect(computePersonalityTrainingEffects(driven, 'medium', config).gainMultiplier).toBe(1);
    expect(computePersonalityTrainingEffects(relaxed, 'high', config).gainMultiplier).toBeLessThan(1);
    expect(computePersonalityTrainingEffects(relaxed, 'low', config).gainMultiplier).toBeGreaterThan(1);
  });

  it('kişilik kazancı da potansiyel tavanını aşamaz', () => {
    const training = loadTrainingConfig();
    const gain = calculateStatGain(training, {
      trainingType: 'speed',
      intensity: 'high',
      durationMinutes: 120,
      currentStatValue: 89.9,
      potential: 90,
      vitals: { health: 100, fitness: 0, fatigue: 0, energy: 100, morale: 0 },
      personalityFactor: 1.5,
    });
    expect(gain).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('etiket: eşiği aşanlar, en belirgin önce, en fazla maxLabels; nötr at "Dengeli" (boş)', () => {
    expect(describePersonality(neutralTraits, config)).toEqual({ traits: [] });
    const view = describePersonality(
      { ...neutralTraits, focus: 70, obedience: 25, courage: 64, temperament: 50 },
      config,
    );
    expect(view.traits).toEqual([
      { trait: 'obedience', pole: 'low' },
      { trait: 'focus', pole: 'high' },
    ]);
    expect(view.traits.length).toBeLessThanOrEqual(config.labels.maxLabels);
    // Eşik sınırı dahildir.
    expect(describePersonality({ ...neutralTraits, focus: config.labels.highThreshold }, config).traits).toEqual([
      { trait: 'focus', pole: 'high' },
    ]);
    expect(describePersonality({ ...neutralTraits, focus: config.labels.highThreshold - 0.01 }, config).traits).toEqual([]);
  });

  it('etiket ham değeri taşımaz (yalnızca özellik + uç)', () => {
    const view = describePersonality({ ...neutralTraits, focus: 77 }, config);
    expect(JSON.stringify(view)).not.toMatch(/77/);
    for (const entry of view.traits) {
      expect(Object.keys(entry).sort()).toEqual(['pole', 'trait']);
    }
  });

  it('bozuk config reddedilir', () => {
    const broken: HorsePersonalityConfig = {
      ...config,
      birth: { traits: ['temperament'], spread: 80 },
      effects: { ...config.effects, focusTrainingGainPerPoint: 0.05 },
      labels: { ...config.labels, highThreshold: 40 },
    };
    const problems = validateHorsePersonalityConfig(broken);
    expect(problems.some((problem) => problem.includes('temperament'))).toBe(true);
    expect(problems.some((problem) => problem.includes('spread'))).toBe(true);
    expect(problems.some((problem) => problem.includes('focusTrainingGainPerPoint'))).toBe(true);
    expect(problems.some((problem) => problem.includes('lowThreshold'))).toBe(true);
  });
});
