import { describe, expect, it } from 'vitest';
import { combineConditionModifiers } from '../../../src/domain/race/modifier-combination';

/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — bkz. `modifier-combination.ts`
 * doc yorumu. Bu testler, denetimin "kontrolsüz çarpımsal modifikatör
 * yığılması" bulgusunun GERÇEKTEN kapatıldığını sayısal olarak doğrular.
 */
describe('combineConditionModifiers', () => {
  it('tüm faktörler nötr (1.0) ise sonuç 1.0 olur', () => {
    expect(combineConditionModifiers([1, 1, 1, 1, 1])).toBe(1);
  });

  it('TEK BİR faktör nötr değilken davranış ham çarpma ile AYNIDIR (mevcut dengeyi bozmaz)', () => {
    expect(combineConditionModifiers([1, 1, 0.8, 1, 1])).toBeCloseTo(0.8, 10);
    expect(combineConditionModifiers([1, 1.05, 1, 1, 1])).toBeCloseTo(1.05, 10);
  });

  it('BİRDEN FAZLA kötü faktör aynı anda varken sonuç, ham çarpımdan DAHA AZ cezalandırıcıdır (çarpımsal yığılma YOK)', () => {
    // Gerçek config değerleri (bkz. race-engine.ts doc yorumu): kötü kondisyon
    // (0.6) × kötü zemin (0.85) × kötü hava (0.90) × yüksek yorgunluk (0.8) ×
    // tükenmiş stamina (0.85).
    const factors = [0.6, 0.85, 0.9, 0.8, 0.85];
    const naiveMultiplication = factors.reduce((product, f) => product * f, 1);
    const combined = combineConditionModifiers(factors);

    expect(naiveMultiplication).toBeCloseTo(0.3121, 3);
    expect(combined).toBeGreaterThan(naiveMultiplication);
  });

  it('HİÇBİR kombinasyon MIN_COMBINED_MODIFIER (0.5) tabanının ALTINA inemez — en kötü durumda bile atın performansı yarısından fazla silinemez', () => {
    const worstCase = combineConditionModifiers([0.1, 0.1, 0.1, 0.1, 0.1]);
    expect(worstCase).toBe(0.5);
  });

  it('boş bir liste verilirse (kenar durum) nötr (1.0) döner', () => {
    expect(combineConditionModifiers([])).toBe(1);
  });
});
