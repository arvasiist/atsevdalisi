import { describe, expect, it } from 'vitest';
import type { AvatarAppearance, AvatarField, CosmeticItemView } from '@at-sevdalisi/shared-types';
import { cosmeticForOption, lockedSelections } from '../../../src/features/cosmetics/cosmetic-logic';

const item = (key: string, optionId: string, owned: boolean): CosmeticItemView => ({
  key,
  name: key,
  catalog: 'silkColors',
  optionId,
  color: '#123456',
  priceGems: 40,
  owned,
});

const catalogOf = (field: AvatarField) => (field === 'silksPrimary' || field === 'silksSecondary' ? 'silkColors' : 'other');

const base = {
  skinTone: 'a', hairStyle: 'a', hairColor: 'a', socialOutfit: 'a', outfitColor: 'a', shoes: 'a',
  hat: 'none', accessory: 'none', raceOutfit: 'solid', silksPrimary: 'gold', silksSecondary: 'red',
} as AvatarAppearance;

describe('kozmetik kilidi', () => {
  it('seçeneğin ürününü bulur; ücretsiz seçenek null', () => {
    const items = [item('silk-pink', 'pink', false)];
    expect(cosmeticForOption(items, 'silkColors', 'pink')?.key).toBe('silk-pink');
    expect(cosmeticForOption(items, 'silkColors', 'gold')).toBeNull();
    expect(cosmeticForOption(items, 'hats', 'pink')).toBeNull();
  });

  it('yalnızca sahip olunmayan seçili ürünleri döner; iki alanda aynı ürün bir kez', () => {
    const items = [item('silk-pink', 'pink', false), item('silk-silver', 'silver', true)];
    expect(lockedSelections(base, items, catalogOf)).toEqual([]);
    const both = { ...base, silksPrimary: 'pink', silksSecondary: 'pink' };
    expect(lockedSelections(both, items, catalogOf).map((locked) => locked.key)).toEqual(['silk-pink']);
    const owned = { ...base, silksPrimary: 'silver' };
    expect(lockedSelections(owned, items, catalogOf)).toEqual([]);
  });
});
