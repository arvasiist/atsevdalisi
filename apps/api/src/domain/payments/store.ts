import type { PaymentOrderStatus } from '@at-sevdalisi/shared-types';
import type { StoreConfig } from '@at-sevdalisi/game-config';
import { PaymentLimitReachedError } from './errors';

/**
 * MAĞAZA + ÖDEME KURALLARI (07.10.2026, Faz 12) — saf, framework'süz.
 *
 * - Ürün (fiyat + elmas) YALNIZCA config'ten çözülür; istemci SKU dışında
 *   hiçbir şey göndermez (fiyatı ya da elması belirleyemez).
 * - Webhook'un sipariş üzerindeki etkisi `decideWebhookEffect`tedir: tutar ve
 *   para birimi siparişle birebir eşleşmeden elmas VERİLMEZ.
 */
const SKU_PATTERN = /^[a-z0-9-]{3,40}$/;

export interface StoreProduct {
  sku: string;
  gems: number;
  priceMinor: number;
}

export function resolveStoreProduct(rawSku: unknown, config: Pick<StoreConfig, 'products'>): StoreProduct | null {
  if (typeof rawSku !== 'string' || !SKU_PATTERN.test(rawSku)) return null;
  return config.products.find((product) => product.sku === rawSku) ?? null;
}

export function validateStoreConfig(config: StoreConfig): string[] {
  const problems: string[] = [];
  if (!/^[A-Z]{3}$/.test(config.currency)) problems.push('currency ISO 4217 (3 büyük harf) olmalı');
  const seen = new Set<string>();
  for (const product of config.products) {
    if (!SKU_PATTERN.test(product.sku)) problems.push(`${product.sku}: SKU kalıba uymuyor`);
    if (seen.has(product.sku)) problems.push(`${product.sku}: SKU tekrar ediyor`);
    seen.add(product.sku);
    if (!Number.isInteger(product.gems) || product.gems < 1) problems.push(`${product.sku}: elmas pozitif tam sayı olmalı`);
    if (!Number.isInteger(product.priceMinor) || product.priceMinor < 1) problems.push(`${product.sku}: fiyat pozitif tam sayı olmalı`);
    if (product.priceMinor > config.maxDailySpendMinor) problems.push(`${product.sku}: fiyat günlük sınırı aşıyor`);
  }
  for (const key of ['maxDailySpendMinor', 'maxPendingOrders', 'pendingOrderTtlMinutes', 'historyLimit', 'adminListLimit'] as const) {
    if (!Number.isInteger(config[key]) || config[key] < 1) problems.push(`${key} pozitif tam sayı olmalı`);
  }
  return problems;
}

/** Sipariş açma sınırları (sahtekârlık/çalıntı kart hızını keser). */
export function assertCanPlaceOrder(
  usage: { spentOrPendingMinor: number; pendingCount: number },
  priceMinor: number,
  config: Pick<StoreConfig, 'maxDailySpendMinor' | 'maxPendingOrders'>,
): void {
  if (usage.pendingCount >= config.maxPendingOrders) {
    throw new PaymentLimitReachedError('Tamamlanmamış çok sayıda ödemen var; önce onları bitir ya da bekle.');
  }
  if (usage.spentOrPendingMinor + priceMinor > config.maxDailySpendMinor) {
    throw new PaymentLimitReachedError('Günlük harcama sınırına ulaştın.');
  }
}

export type PaymentWebhookType = 'payment_succeeded' | 'payment_failed' | 'payment_refunded';

export type WebhookEffect =
  | { kind: 'mark_paid' }
  | { kind: 'mark_failed'; code: string }
  | { kind: 'mark_refunded' }
  | { kind: 'ignore'; outcome: string };

/**
 * Webhook olayı + siparişin KİLİT ALTINDA okunan durumu → yapılacak iş.
 * - Başarı: yalnızca tutar + para birimi BİREBİR eşleşirse ödenir; uyuşmazlık
 *   sipariş `failed` (AMOUNT_MISMATCH) olur ve elmas verilmez (inceleme).
 *   Süresi dolup iptal edilmiş sipariş için gelen gerçek ödeme de işlenir —
 *   para alınmıştır, elmas verilmelidir.
 * - Zaten ödenmiş/iade edilmiş siparişe ikinci başarı → yok sayılır (çift elmas yok).
 * - İade yalnızca ödenmiş siparişe uygulanır.
 */
export function decideWebhookEffect(
  order: { status: PaymentOrderStatus; amountMinor: number; currency: string },
  event: { type: PaymentWebhookType; amountMinor: number | null; currency: string | null; failureCode?: string | null },
): WebhookEffect {
  if (event.type === 'payment_succeeded') {
    if (order.status === 'paid' || order.status === 'refunded') return { kind: 'ignore', outcome: 'already_paid' };
    if (order.status === 'failed') return { kind: 'ignore', outcome: 'needs_review' };
    if (event.amountMinor !== order.amountMinor || event.currency !== order.currency) {
      return { kind: 'mark_failed', code: 'AMOUNT_MISMATCH' };
    }
    return { kind: 'mark_paid' };
  }
  if (event.type === 'payment_failed') {
    if (order.status === 'created' || order.status === 'pending') {
      return { kind: 'mark_failed', code: sanitizeCode(event.failureCode ?? 'PAYMENT_FAILED') };
    }
    return { kind: 'ignore', outcome: 'not_pending' };
  }
  if (order.status === 'paid') return { kind: 'mark_refunded' };
  return { kind: 'ignore', outcome: 'not_paid' };
}

/** Sağlayıcının serbest metnini kısa, güvenli bir koda indirger. */
export function sanitizeCode(raw: string): string {
  const code = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return code || 'PAYMENT_FAILED';
}

/** İadede geri alınacak elmas: harcanmışsa eldeki kadar alınır, kalanı açık olarak kaydedilir. */
export function computeClawback(currentGems: number, purchasedGems: number): { debit: number; shortfall: number } {
  const debit = Math.min(currentGems, purchasedGems);
  return { debit, shortfall: purchasedGems - debit };
}
