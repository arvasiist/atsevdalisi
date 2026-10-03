import { describe, expect, it } from 'vitest';
import { HORSE_COAT_COLORS } from '@at-sevdalisi/shared-types';
import { COAT_PALETTES, paletteFor } from '../../../src/features/race-viewer/coat-palette';

describe('COAT_PALETTES (01.10.2026)', () => {
  it('her don rengi için geçerli renkler tanımlıdır', () => {
    expect(Object.keys(COAT_PALETTES).sort()).toEqual([...HORSE_COAT_COLORS].sort());
    for (const coat of HORSE_COAT_COLORS) {
      const palette = paletteFor({ coatColor: coat, faceMarking: 'none', legMarking: 'none' });
      for (const color of [palette.body, palette.mane, palette.lowerLeg]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('farklı donlar farklı gövde rengi verir', () => {
    const bodies = new Set(HORSE_COAT_COLORS.map((coat) => COAT_PALETTES[coat].body));
    expect(bodies.size).toBe(HORSE_COAT_COLORS.length);
  });
});
