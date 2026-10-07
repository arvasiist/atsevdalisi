/**
 * MAĞAZA + GERÇEK PARA ÖDEMESİ (07.10.2026, Faz 12, brief §20/§88).
 *
 * Gerçek para OYUN İÇİ DEFTERDEN AYRIDIR: tutarlar (kuruş) `payment_orders`
 * tablosunda yaşar; oyun içi defter (`economy_transactions`) yalnızca
 * verilen/geri alınan ELMASI görür. Ödeme sonucu YALNIZCA sağlayıcının
 * imzalı webhook'uyla kabul edilir — istemcinin "ödendi" diyebileceği bir
 * uç YOKTUR.
 */
export const PAYMENT_ORDER_STATUSES = ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export interface StoreProductView {
  sku: string;
  gems: number;
  /** En küçük para birimi (kuruş). Gösterimde 100'e bölünür. */
  priceMinor: number;
  currency: string;
}

export interface StoreView {
  /** Sunucuda bir ödeme sağlayıcısı yapılandırılmış mı? `false` ise satın alma kapalı. */
  available: boolean;
  products: StoreProductView[];
}

/** Oyuncunun makbuzu (sipariş). Sağlayıcı oturum/ödeme kimliği oyuncuya DÖNMEZ. */
export interface PaymentOrderView {
  id: string;
  sku: string;
  gems: number;
  amountMinor: number;
  currency: string;
  status: PaymentOrderStatus;
  failureCode: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface CheckoutView {
  order: PaymentOrderView;
  /** Sağlayıcının ödeme sayfası — kart bilgisi YALNIZCA orada girilir. */
  checkoutUrl: string;
}

export interface AdminPaymentOrderView extends PaymentOrderView {
  playerId: string;
  username: string;
  provider: string;
  /** İade anında oyuncunun harcamış olduğu, geri alınamayan elmas (sahtekârlık incelemesi). */
  clawbackShortfallGems: number;
}
