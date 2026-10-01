import { describe, expect, it } from 'vitest';
import { InvalidWalletCursorError } from '../../../src/domain/economy/errors';
import { normalizeWalletHistoryCursor } from '../../../src/domain/economy/wallet-history';

/**
 * Cüzdan geçmişi imleci (30.09.2026). `limit`in aksine bozuk imleç
 * varsayılana DÜŞMEZ — sessizce ilk sayfayı dönmek "daha fazla göster"i
 * aynı sayfada sonsuza dek döndürürdü.
 */
describe('normalizeWalletHistoryCursor', () => {
  it('yok/boş → null (ilk sayfa)', () => {
    expect(normalizeWalletHistoryCursor(undefined)).toBeNull();
    expect(normalizeWalletHistoryCursor(null)).toBeNull();
    expect(normalizeWalletHistoryCursor('   ')).toBeNull();
  });

  it('geçerli UUID aynen döner', () => {
    const id = '3f9c1e5a-1b2c-4d5e-8f90-a1b2c3d4e5f6';
    expect(normalizeWalletHistoryCursor(id)).toBe(id);
  });

  it('UUID olmayan metin ve metin olmayan değer 400 hatasıdır', () => {
    expect(() => normalizeWalletHistoryCursor('abc')).toThrow(InvalidWalletCursorError);
    expect(() => normalizeWalletHistoryCursor("1' OR '1'='1")).toThrow(InvalidWalletCursorError);
    expect(() => normalizeWalletHistoryCursor(42)).toThrow(InvalidWalletCursorError);
  });
});
