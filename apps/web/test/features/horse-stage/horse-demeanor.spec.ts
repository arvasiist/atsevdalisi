import { describe, expect, it } from 'vitest';
import { loadHorsePresenceConfig } from '@at-sevdalisi/game-config';
import {
  HORSE_MOOD_LABELS,
  deriveHorseDemeanor,
  deriveHorseMood,
  type HorseVitalsForDemeanor,
} from '../../../src/features/horse-stage/horse-demeanor';

const config = loadHorsePresenceConfig();
const t = config.thresholds;
const base: HorseVitalsForDemeanor = {
  health: 90,
  energy: 60,
  fatigue: 20,
  morale: 60,
  status: 'active',
};

describe('deriveHorseMood (01.10.2026) — atın gerçek durumu → ruh hâli', () => {
  it("eşikler config'ten okunur; her ruh hâli ulaşılabilir", () => {
    expect(deriveHorseMood(base, config)).toBe('neutral');
    expect(deriveHorseMood({ ...base, energy: t.highEnergy, morale: t.highMorale }, config)).toBe(
      'energetic',
    );
    expect(deriveHorseMood({ ...base, morale: t.lowMorale - 1 }, config)).toBe('calm');
    expect(deriveHorseMood({ ...base, energy: t.lowEnergy - 1 }, config)).toBe('tired');
    expect(deriveHorseMood({ ...base, fatigue: t.highFatigue + 1 }, config)).toBe('tired');
    expect(deriveHorseMood({ ...base, health: t.lowHealth - 1 }, config)).toBe('unwell');
    expect(deriveHorseMood({ ...base, status: 'injured' }, config)).toBe('injured');
  });

  it('öncelik en ciddi durumdan başlar: sakat > keyifsiz > yorgun > durgun', () => {
    const everythingBad = { health: 10, energy: 5, fatigue: 95, morale: 5 };
    expect(deriveHorseMood({ ...everythingBad, status: 'injured' }, config)).toBe('injured');
    expect(deriveHorseMood({ ...everythingBad, status: 'active' }, config)).toBe('unwell');
    expect(deriveHorseMood({ ...base, energy: 5, morale: 5 }, config)).toBe('tired');
  });

  it('demeanor ruh hâlinin config parametrelerini taşır; yorgun at enerjikten daha düşük başlı ve daha az kıpırdar', () => {
    const tired = deriveHorseDemeanor({ ...base, energy: 1 }, config);
    const energetic = deriveHorseDemeanor({ ...base, energy: 100, morale: 100 }, config);
    expect(tired).toEqual({ mood: 'tired', ...config.moods.tired });
    expect(tired.headLift).toBeLessThan(energetic.headLift);
    expect(tired.weightShiftRate).toBeLessThan(energetic.weightShiftRate);
  });

  it('her ruh hâlinin ekran etiketi ve config parametresi vardır', () => {
    for (const mood of Object.keys(config.moods)) {
      expect(HORSE_MOOD_LABELS[mood as keyof typeof HORSE_MOOD_LABELS]).toBeTruthy();
    }
    expect(Object.keys(HORSE_MOOD_LABELS).sort()).toEqual(Object.keys(config.moods).sort());
  });
});
