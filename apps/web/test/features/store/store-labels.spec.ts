import { describe, expect, it } from 'vitest';
import { PAYMENT_ORDER_STATUSES } from '@at-sevdalisi/shared-types';
import { PAYMENT_STATUS_LABELS, formatPrice, isFinalPaymentStatus } from '../../../src/features/store/store-labels';

describe('mağaza metinleri', () => {
  it('kuruş → TL gösterimi (istemci fiyat hesaplamaz, yalnızca biçimler)', () => {
    expect(formatPrice(2999, 'TRY')).toMatch(/29,99/);
    expect(formatPrice(150000, 'TRY')).toMatch(/1\.500,00/);
  });

  it('her sipariş durumunun etiketi var; yalnızca bekleyenler son durum değildir', () => {
    for (const status of PAYMENT_ORDER_STATUSES) expect(PAYMENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    expect(PAYMENT_ORDER_STATUSES.filter((s) => !isFinalPaymentStatus(s))).toEqual(['created', 'pending']);
  });
});
