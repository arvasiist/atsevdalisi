import { describe, expect, it } from 'vitest';
import { loadCareConfig, loadGiftConfig } from '@at-sevdalisi/game-config';
import { validateGemPolicy } from '../../../src/domain/economy/gem-policy';

/**
 * ELMAS POLİTİKASI (09.10.2026, sahibinin onayı): elmas yalnızca görünüş ve
 * kolaylık satın alır. Gerçek config kurala uyar; ihlal açılışta yakalanır.
 */
describe('elmas politikası', () => {
  const care = loadCareConfig();
  const gift = loadGiftConfig();

  it('gerçek config: hiçbir yem elmasla satılmaz, elmas hediye edilmez', () => {
    expect(validateGemPolicy(care, gift)).toEqual([]);
    for (const definition of Object.values(care.feedTypes)) {
      expect(definition.price?.currency ?? 'money').toBe('money');
    }
    expect(gift.allowedCurrencies).not.toContain('gems');
  });

  it('elmasla fiyatlanan yem ve elmas hediyesi reddedilir', () => {
    const feedTypes = { ...care.feedTypes, arpa: { ...care.feedTypes.arpa, price: { currency: 'gems' as const, amount: 2 } } };
    const problems = validateGemPolicy({ feedTypes }, { allowedCurrencies: ['money', 'gems'] });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('care.feedTypes.arpa');
    expect(problems[1]).toContain('gift.allowedCurrencies');
  });
});
