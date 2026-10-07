/**
 * MAĞAZA METİNLERİ (07.10.2026, Faz 12) — saf. Fiyat sunucudan kuruş olarak
 * gelir; burada yalnızca gösterilir (istemci fiyat HESAPLAMAZ).
 */
import type { PaymentOrderStatus } from '@at-sevdalisi/shared-types';

export const PAYMENT_STATUS_LABELS: Record<PaymentOrderStatus, string> = {
  created: 'Oluşturuldu',
  pending: 'Ödeme bekleniyor',
  paid: 'Ödendi',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
  refunded: 'İade edildi',
};

/** 2999, "TRY" → "29,99 ₺" (tr-TR). */
export function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amountMinor / 100);
}

export function isFinalPaymentStatus(status: PaymentOrderStatus): boolean {
  return status === 'paid' || status === 'failed' || status === 'cancelled' || status === 'refunded';
}
