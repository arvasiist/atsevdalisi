import type { AdminPaymentOrderView, PaymentOrderStatus } from '@at-sevdalisi/shared-types';
import type { WebhookEffect } from '../../domain/payments/store';
import type { PaymentWebhookEvent } from './payment-gateway';

export const PAYMENT_ORDER_REPOSITORY = Symbol('PAYMENT_ORDER_REPOSITORY');

export interface PaymentOrderRecord {
  id: string;
  playerId: string;
  sku: string;
  gems: number;
  amountMinor: number;
  currency: string;
  status: PaymentOrderStatus;
  provider: string;
  providerSessionId: string | null;
  providerPaymentId: string | null;
  failureCode: string | null;
  clawbackShortfallGems: number;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
}

export type WebhookApplyResult =
  | { kind: 'duplicate' }
  | { kind: 'unknown_order' }
  | { kind: 'applied'; order: PaymentOrderRecord; effect: WebhookEffect };

export interface PaymentOrderRepository {
  /** Son 24 saatte ödenmiş + süresi dolmamış bekleyen siparişler (sınır hesabı). */
  usage(playerId: string, now: Date, pendingTtlMinutes: number): Promise<{ spentOrPendingMinor: number; pendingCount: number }>;
  create(input: {
    id: string;
    playerId: string;
    sku: string;
    gems: number;
    amountMinor: number;
    currency: string;
    provider: string;
    now: Date;
  }): Promise<PaymentOrderRecord>;
  attachSession(orderId: string, sessionId: string, now: Date): Promise<PaymentOrderRecord>;
  markCheckoutFailed(orderId: string, now: Date): Promise<void>;
  findForPlayer(playerId: string, orderId: string): Promise<PaymentOrderRecord | null>;
  findById(orderId: string): Promise<PaymentOrderRecord | null>;
  listForPlayer(playerId: string, limit: number): Promise<PaymentOrderRecord[]>;
  listForAdmin(limit: number): Promise<AdminPaymentOrderView[]>;
  /**
   * TEK transaction: olay kaydı (PK → tekrar = `duplicate`), sipariş `FOR
   * UPDATE`, `decide` KİLİT ALTINDA karar verir; ödendiyse oyuncu `FOR UPDATE`
   * + elmas + `gem_purchase` defter satırı, iadede geri alma + `gem_purchase_refund`.
   */
  applyWebhook(
    provider: string,
    event: PaymentWebhookEvent,
    decide: (order: PaymentOrderRecord) => WebhookEffect,
    now: Date,
  ): Promise<WebhookApplyResult>;
  /** Yöneticinin iade talebinin denetim kaydı (para hareketi YOK — sonuç webhook'la gelir). */
  recordRefundRequest(actorId: string, orderId: string): Promise<void>;
}
