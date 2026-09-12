import { describe, expect, it } from 'vitest';
import {
  applyXpGain,
  getUnlockedFeatures,
  getXpRequiredForLevel,
} from '../../../src/domain/progression/progression';
import progressionConfigJson from '../../../../../config/progression.config.json';
import type { ProgressionConfig } from '@at-sevdalisi/game-config';

const config = progressionConfigJson as unknown as ProgressionConfig;

/** brief §36 Seviye Sistemi testleri. */
describe('getXpRequiredForLevel', () => {
  it('seviye arttıkça gereken XP artar', () => {
    expect(getXpRequiredForLevel(1, config)).toBeLessThan(getXpRequiredForLevel(10, config));
    expect(getXpRequiredForLevel(10, config)).toBeLessThan(getXpRequiredForLevel(40, config));
  });
});

describe('applyXpGain', () => {
  it('eşiğin altında XP kazancı level up yapmaz', () => {
    const result = applyXpGain(1, 0, 10, config);
    expect(result).toMatchObject({ level: 1, xp: 10, leveledUp: false, levelsGained: 0 });
  });

  it('tam eşik XP ile level up olur ve fazlalık taşınır', () => {
    const required = getXpRequiredForLevel(1, config);
    const result = applyXpGain(1, 0, required, config);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(0);
    expect(result.leveledUp).toBe(true);
  });

  it('çok büyük XP kazancıyla birden fazla seviye atlanabilir', () => {
    const result = applyXpGain(1, 0, 100000, config);
    expect(result.levelsGained).toBeGreaterThan(1);
  });

  it('maxLevel asla aşılmaz ve XP sıfırlanır', () => {
    const result = applyXpGain(49, 0, 10_000_000, config);
    expect(result.level).toBe(config.maxLevel);
    expect(result.xp).toBe(0);
  });

  it('negatif XP fırlatır', () => {
    expect(() => applyXpGain(1, 0, -5, config)).toThrow();
  });

  it('level 5e ulaşınca horse_market açılır', () => {
    let level = 1;
    let xp = 0;
    const unlocked: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const need = getXpRequiredForLevel(level, config);
      const result = applyXpGain(level, xp, need, config);
      level = result.level;
      xp = result.xp;
      unlocked.push(...result.newlyUnlockedFeatures);
    }
    expect(level).toBe(5);
    expect(unlocked).toContain('horse_market');
  });
});

describe('getUnlockedFeatures', () => {
  it('kümülatif olarak o seviyeye kadar açılan tüm özellikleri döner', () => {
    const features = getUnlockedFeatures(10, config.unlocks);
    expect(features).toEqual(expect.arrayContaining(['basic_stable', 'horse_market', 'advanced_training']));
    expect(features).not.toContain('breeding');
  });
});
