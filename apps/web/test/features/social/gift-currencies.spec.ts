import { describe, expect, it } from 'vitest';
import { loadGiftConfig } from '@at-sevdalisi/game-config';
import { GIFT_CURRENCIES } from '../../../src/features/social/gift-currencies';

describe('hediye birimleri (09.10.2026 elmas politikası)', () => {
  it('form yalnızca config\'in izin verdiği birimleri gösterir; elmas yok', () => {
    expect(GIFT_CURRENCIES).toEqual(loadGiftConfig().allowedCurrencies);
    expect(GIFT_CURRENCIES).not.toContain('gems');
    expect(GIFT_CURRENCIES).toContain('money');
  });
});
