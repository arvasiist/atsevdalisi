import { describe, expect, it } from 'vitest';
import { loadHorsePersonalityConfig } from '@at-sevdalisi/game-config';
import { personalityChips } from '../../../src/features/personality/personality-labels';

const config = loadHorsePersonalityConfig();

describe('kişilik çipleri (08.10.2026)', () => {
  it('görünüm yoksa çip yok; boş liste "Dengeli"', () => {
    expect(personalityChips(undefined)).toEqual([]);
    expect(personalityChips({ traits: [] })).toEqual([{ key: 'balanced', ...config.labels.balanced }]);
  });

  it('metin config\'ten, sıra sunucunun sırası', () => {
    const chips = personalityChips({
      traits: [
        { trait: 'obedience', pole: 'low' },
        { trait: 'focus', pole: 'high' },
      ],
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      config.labels.traits.obedience.low.label,
      config.labels.traits.focus.high.label,
    ]);
    expect(chips.every((chip) => chip.hint.length > 0)).toBe(true);
  });

  it('her özelliğin iki ucu da adlandırılmış', () => {
    for (const trait of Object.keys(config.labels.traits) as Array<keyof typeof config.labels.traits>) {
      for (const pole of ['high', 'low'] as const) {
        expect(personalityChips({ traits: [{ trait, pole }] })).toHaveLength(1);
      }
    }
  });
});
