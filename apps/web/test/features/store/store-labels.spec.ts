import { describe, expect, it } from 'vitest';
import { PAYMENT_ORDER_STATUSES } from '@at-sevdalisi/shared-types';
import { PAYMENT_STATUS_LABELS, describeStoreReward, formatPrice, isFinalPaymentStatus } from '../../../src/features/store/store-labels';

describe('mağaza metinleri', () => {
  it('kuruş → TL gösterimi (istemci fiyat hesaplamaz, yalnızca biçimler)', () => {
    expect(formatPrice(2999, 'TRY')).toMatch(/29,99/);
    expect(formatPrice(150000, 'TRY')).toMatch(/1\.500,00/);
  });

  it('her sipariş durumunun etiketi var; yalnızca bekleyenler son durum değildir', () => {
    for (const status of PAYMENT_ORDER_STATUSES) expect(PAYMENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    expect(PAYMENT_ORDER_STATUSES.filter((s) => !isFinalPaymentStatus(s))).toEqual(['created', 'pending']);
  });

  it('ürün ya çip ya elmas olarak yazılır (16.10.2026)', () => {
    expect(describeStoreReward({ gems: 0, chips: 5500 })).toBe('5.500 çip');
    expect(describeStoreReward({ gems: 120, chips: 0 })).toBe('120 elmas');
  });
});
