import { describe, expect, it } from 'vitest';
import { loadStoreConfig } from '@at-sevdalisi/game-config';
import { PaymentLimitReachedError } from '../../../src/domain/payments/errors';
import {
  assertCanPlaceOrder,
  computeClawback,
  decideWebhookEffect,
  resolveStoreProduct,
  sanitizeCode,
  validateStoreConfig,
} from '../../../src/domain/payments/store';

const config = loadStoreConfig();
const order = (status: Parameters<typeof decideWebhookEffect>[0]['status']) => ({ status, amountMinor: 2999, currency: 'TRY' });
const ok = { type: 'payment_succeeded' as const, amountMinor: 2999, currency: 'TRY' };

describe('mağaza kuralları (saf)', () => {
  it('üretim kataloğu geçerli; ürün yalnızca SKU ile çözülür', () => {
    expect(validateStoreConfig(config)).toEqual([]);
    const first = config.products[0]!;
    expect(resolveStoreProduct(first.sku, config)).toEqual({ chips: 0, ...first, gems: first.gems ?? 0 });
    // 16.10.2026 — çip paketi de SKU ile çözülür, elması 0'dır.
    const chipPack = config.products.find((product) => (product.chips ?? 0) > 0)!;
    expect(resolveStoreProduct(chipPack.sku, config)).toMatchObject({ gems: 0, chips: chipPack.chips });
    expect(resolveStoreProduct('gems-999999', config)).toBeNull();
    expect(resolveStoreProduct({ sku: first.sku, priceMinor: 1 }, config)).toBeNull();
  });

  it('bozuk katalog yakalanır', () => {
    const problems = validateStoreConfig({
      ...config,
      currency: 'tl',
      products: [
        { sku: 'x', gems: 0, priceMinor: 0 },
        { sku: 'dup-1', gems: 1, priceMinor: config.maxDailySpendMinor + 1 },
        { sku: 'dup-1', gems: 1, priceMinor: 1 },
        { sku: 'both-1', gems: 5, chips: 5, priceMinor: 1 },
      ],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'currency ISO 4217 (3 büyük harf) olmalı',
        'x: SKU kalıba uymuyor',
        'x: paket ya elmas ya çip vermeli (tam olarak biri)',
        'both-1: paket ya elmas ya çip vermeli (tam olarak biri)',
        'dup-1: fiyat günlük sınırı aşıyor',
        'dup-1: SKU tekrar ediyor',
      ]),
    );
  });

  it('sipariş sınırları: bekleyen sayısı ve günlük harcama', () => {
    const limits = { maxDailySpendMinor: 10_000, maxPendingOrders: 2 };
    expect(() => assertCanPlaceOrder({ spentOrPendingMinor: 0, pendingCount: 1 }, 5_000, limits)).not.toThrow();
    expect(() => assertCanPlaceOrder({ spentOrPendingMinor: 0, pendingCount: 2 }, 1, limits)).toThrow(PaymentLimitReachedError);
    expect(() => assertCanPlaceOrder({ spentOrPendingMinor: 6_000, pendingCount: 0 }, 5_000, limits)).toThrow(PaymentLimitReachedError);
    expect(() => assertCanPlaceOrder({ spentOrPendingMinor: 5_000, pendingCount: 0 }, 5_000, limits)).not.toThrow();
  });
});

describe('webhook etkisi (saf) — çift elmas ve sahte tutar imkânsız', () => {
  it('başarı: yalnızca bekleyen/oluşturulmuş siparişe ve tutar + para birimi BİREBİR ise', () => {
    expect(decideWebhookEffect(order('pending'), ok)).toEqual({ kind: 'mark_paid' });
    expect(decideWebhookEffect(order('created'), ok)).toEqual({ kind: 'mark_paid' });
    expect(decideWebhookEffect(order('cancelled'), ok)).toEqual({ kind: 'mark_paid' });
    expect(decideWebhookEffect(order('pending'), { ...ok, amountMinor: 1 })).toEqual({ kind: 'mark_failed', code: 'AMOUNT_MISMATCH' });
    expect(decideWebhookEffect(order('pending'), { ...ok, currency: 'USD' })).toEqual({ kind: 'mark_failed', code: 'AMOUNT_MISMATCH' });
    expect(decideWebhookEffect(order('pending'), { ...ok, amountMinor: null })).toEqual({ kind: 'mark_failed', code: 'AMOUNT_MISMATCH' });
  });

  it('ödenmiş/iade edilmiş siparişe ikinci başarı yok sayılır; başarısız sipariş incelemeye', () => {
    expect(decideWebhookEffect(order('paid'), ok)).toEqual({ kind: 'ignore', outcome: 'already_paid' });
    expect(decideWebhookEffect(order('refunded'), ok)).toEqual({ kind: 'ignore', outcome: 'already_paid' });
    expect(decideWebhookEffect(order('failed'), ok)).toEqual({ kind: 'ignore', outcome: 'needs_review' });
  });

  it('başarısızlık yalnızca bekleyene; iade yalnızca ödenmişe', () => {
    const failed = { type: 'payment_failed' as const, amountMinor: null, currency: null, failureCode: 'card declined' };
    expect(decideWebhookEffect(order('pending'), failed)).toEqual({ kind: 'mark_failed', code: 'CARD_DECLINED' });
    expect(decideWebhookEffect(order('paid'), failed)).toEqual({ kind: 'ignore', outcome: 'not_pending' });
    const refund = { type: 'payment_refunded' as const, amountMinor: 2999, currency: 'TRY' };
    expect(decideWebhookEffect(order('paid'), refund)).toEqual({ kind: 'mark_refunded' });
    expect(decideWebhookEffect(order('pending'), refund)).toEqual({ kind: 'ignore', outcome: 'not_paid' });
    expect(decideWebhookEffect(order('refunded'), refund)).toEqual({ kind: 'ignore', outcome: 'not_paid' });
  });

  it('iade geri alması: harcanmış elmas için açık kaydedilir, bakiye eksiye düşmez', () => {
    expect(computeClawback(500, 100)).toEqual({ debit: 100, shortfall: 0 });
    expect(computeClawback(30, 100)).toEqual({ debit: 30, shortfall: 70 });
    expect(computeClawback(0, 100)).toEqual({ debit: 0, shortfall: 100 });
    expect(sanitizeCode('<b>x</b>')).toBe('B_X_B');
  });
});
