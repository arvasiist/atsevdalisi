import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { describe, expect, it } from 'vitest';
import { CURRENCY_LABELS, formatCost, formatCurrency, hasEnoughFunds } from '../../src/lib/currency';

/**
 * Oyuncuya görünen para birimi adları (brief §1 "ANA PARA BİRİMİ").
 *
 * NEDEN VAR: bu adlar daha önce 5 sayfada satır içi yazılıydı (`₺` /
 * `elmas`) ve hiçbir test onları denetlemiyordu — yani "Çip" adının
 * gerçekten gösterildiği yalnızca gözle doğrulanabiliyordu. Tarayıcı/GPU
 * olmayan bu ortamda gözle doğrulama MÜMKÜN DEĞİL (bkz. CLAUDE.md), bu
 * yüzden adlar test edilebilir tek yere — `lib/currency.ts` — taşındı.
 */

describe('CURRENCY_LABELS', () => {
  it('her para birimi için bir ad tanımlıdır (fazlası/eksiği yok)', () => {
    expect(Object.keys(CURRENCY_LABELS).sort()).toEqual([...CURRENCIES].sort());
  });

  it('ana para birimi Çip, premium olan Elmas olarak adlandırılır', () => {
    expect(CURRENCY_LABELS.money).toBe('Çip');
    expect(CURRENCY_LABELS.gems).toBe('Elmas');
  });
});

describe('formatCurrency', () => {
  it('Çip tutarını tr-TR biçiminde ve küçük harfli birimle yazar', () => {
    expect(formatCurrency('money', 5000)).toBe('5.000 çip');
  });

  it('Elmas tutarını aynı biçimde yazar', () => {
    expect(formatCurrency('gems', 50)).toBe('50 elmas');
  });

  it('sıfırı da geçerli bir tutar olarak yazar (boş metin DEĞİL)', () => {
    expect(formatCurrency('money', 0)).toBe('0 çip');
  });

  it('formatCost, sunucudan gelen { currency, amount } nesnesini aynı şekilde yazar', () => {
    expect(formatCost({ currency: 'money', amount: 120 })).toBe('120 çip');
    expect(formatCost({ currency: 'gems', amount: 3 })).toBe('3 elmas');
  });
});

describe('hasEnoughFunds', () => {
  const player = { money: 100, gems: 5 };

  it('ilgili birimin bakiyesine bakar (diğer birime DEĞİL)', () => {
    expect(hasEnoughFunds(player, { currency: 'money', amount: 100 })).toBe(true);
    expect(hasEnoughFunds(player, { currency: 'money', amount: 101 })).toBe(false);
    expect(hasEnoughFunds(player, { currency: 'gems', amount: 5 })).toBe(true);
    expect(hasEnoughFunds(player, { currency: 'gems', amount: 6 })).toBe(false);
  });

  it('tam bakiye yeterlidir (sınır dahil)', () => {
    expect(hasEnoughFunds(player, { currency: 'money', amount: 100 })).toBe(true);
  });
});
