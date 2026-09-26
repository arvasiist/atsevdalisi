import { describe, expect, it } from 'vitest';
import { CAREER_TIERS, getCareerProgress } from '../../../src/features/career/career-tier';

describe('getCareerProgress', () => {
  it('seviye 1 => NOVICE, bir sonraki kademe LOCAL_OWNER, ilerleme 0', () => {
    const result = getCareerProgress(1);
    expect(result.tier.id).toBe('NOVICE');
    expect(result.nextTier?.id).toBe('LOCAL_OWNER');
    expect(result.progressToNextTier).toBe(0);
  });

  it('seviye 5 => hâlâ NOVICE, kademe içinde kısmi ilerleme (4/9)', () => {
    const result = getCareerProgress(5);
    expect(result.tier.id).toBe('NOVICE');
    expect(result.progressToNextTier).toBeCloseTo(4 / 9, 5);
  });

  it('seviye 9 (eşiğin bir altı) => hâlâ NOVICE', () => {
    const result = getCareerProgress(9);
    expect(result.tier.id).toBe('NOVICE');
  });

  it('seviye 10 (tam eşik) => LOCAL_OWNER, ilerleme 0', () => {
    const result = getCareerProgress(10);
    expect(result.tier.id).toBe('LOCAL_OWNER');
    expect(result.nextTier?.id).toBe('RISING_STABLE');
    expect(result.progressToNextTier).toBe(0);
  });

  it('seviye 19 => LOCAL_OWNER, ilerleme (9/10)', () => {
    const result = getCareerProgress(19);
    expect(result.tier.id).toBe('LOCAL_OWNER');
    expect(result.progressToNextTier).toBeCloseTo(9 / 10, 5);
  });

  it('seviye 20 => RISING_STABLE', () => {
    expect(getCareerProgress(20).tier.id).toBe('RISING_STABLE');
  });

  it('seviye 30 => PRO_STABLE', () => {
    expect(getCareerProgress(30).tier.id).toBe('PRO_STABLE');
  });

  it('seviye 39 => hâlâ PRO_STABLE (eşiğin bir altı)', () => {
    expect(getCareerProgress(39).tier.id).toBe('PRO_STABLE');
  });

  it('seviye 40 => CHAMPIONSHIP_STABLE, nextTier null, ilerleme 1 (son kademe)', () => {
    const result = getCareerProgress(40);
    expect(result.tier.id).toBe('CHAMPIONSHIP_STABLE');
    expect(result.nextTier).toBe(null);
    expect(result.progressToNextTier).toBe(1);
  });

  it('seviye 50 (maxLevel) => hâlâ CHAMPIONSHIP_STABLE, ilerleme 1', () => {
    const result = getCareerProgress(50);
    expect(result.tier.id).toBe('CHAMPIONSHIP_STABLE');
    expect(result.progressToNextTier).toBe(1);
  });

  it('seviye 0/negatif/NaN => güvenli varsayılan olarak NOVICE döner (çökmez)', () => {
    expect(getCareerProgress(0).tier.id).toBe('NOVICE');
    expect(getCareerProgress(-5).tier.id).toBe('NOVICE');
    expect(getCareerProgress(Number.NaN).tier.id).toBe('NOVICE');
  });

  it('ondalık bir seviye tabana yuvarlanır (10.9 => LOCAL_OWNER, henüz RISING_STABLE değil)', () => {
    expect(getCareerProgress(10.9).tier.id).toBe('LOCAL_OWNER');
  });

  it('CAREER_TIERS beş kademeyi de brief §27 sırasıyla içerir', () => {
    expect(CAREER_TIERS.map((t) => t.id)).toEqual([
      'NOVICE',
      'LOCAL_OWNER',
      'RISING_STABLE',
      'PRO_STABLE',
      'CHAMPIONSHIP_STABLE',
    ]);
  });
});
