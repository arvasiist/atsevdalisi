import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AdminPaymentOrderView,
  CheckoutView,
  PaymentOrderView,
  StoreView,
} from '@at-sevdalisi/shared-types';
import { loadStoreConfig } from '@at-sevdalisi/game-config';
import { assertStaffPermission } from '../../domain/admin/staff';
import {
  InvalidWebhookError,
  PaymentOrderNotFoundError,
  PaymentRefundNotAllowedError,
  PaymentUnavailableError,
  StoreProductNotFoundError,
} from '../../domain/payments/errors';
import { assertCanPlaceOrder, decideWebhookEffect, resolveStoreProduct } from '../../domain/payments/store';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../ports/payment-gateway';
import {
  PAYMENT_ORDER_REPOSITORY,
  type PaymentOrderRecord,
  type PaymentOrderRepository,
} from '../ports/payment-order.repository';

const store = loadStoreConfig();

function toView(order: PaymentOrderRecord): PaymentOrderView {
  return {
    id: order.id,
    sku: order.sku,
    gems: order.gems,
    chips: order.chips,
    amountMinor: order.amountMinor,
    currency: order.currency,
    status: order.status,
    failureCode: order.failureCode,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
  };
}

/**
 * MAĞAZA + ÖDEME (07.10.2026, Faz 12, brief §20/§21/§88).
 *
 * - İstemci yalnızca SKU gönderir; fiyat ve elmas config'ten.
 * - Sipariş açmak para HAREKETİ DEĞİLDİR: elmas yalnızca sağlayıcının
 *   imzalı webhook'u `paid` yazınca, aynı transaction'da defter satırıyla verilir.
 * - Webhook olayı `(sağlayıcı, olay kimliği)` ile tekildir; tutar/para birimi
 *   uyuşmazsa elmas verilmez.
 * - Yöneticinin iadesi sağlayıcıya bir TALEPTİR; elmas geri alma iade
 *   webhook'u gelince olur (talep ≠ sonuç).
 */
@Injectable()
export class PaymentsUseCase {
  private readonly logger = new Logger(PaymentsUseCase.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway | null,
    @Inject(PAYMENT_ORDER_REPOSITORY) private readonly orders: PaymentOrderRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  store(): StoreView {
    return {
      available: this.gateway !== null,
      products: store.products.map((product) => ({
        sku: product.sku,
        gems: product.gems ?? 0,
        chips: product.chips ?? 0,
        priceMinor: product.priceMinor,
        currency: store.currency,
      })),
    };
  }

  async checkout(playerId: string, rawSku: unknown, now: Date = new Date()): Promise<CheckoutView> {
    const gateway = this.gateway;
    if (gateway === null) throw new PaymentUnavailableError();
    const product = resolveStoreProduct(rawSku, store);
    if (product === null) throw new StoreProductNotFoundError();
    assertCanPlaceOrder(await this.orders.usage(playerId, now, store.pendingOrderTtlMinutes), product.priceMinor, store);
    const order = await this.orders.create({
      id: randomUUID(),
      playerId,
      sku: product.sku,
      gems: product.gems,
      chips: product.chips,
      amountMinor: product.priceMinor,
      currency: store.currency,
      provider: gateway.name,
      now,
    });
    const base = this.config.env.webBaseUrl;
    let session: { sessionId: string; checkoutUrl: string };
    try {
      session = await gateway.createCheckout({
        orderId: order.id,
        amountMinor: order.amountMinor,
        currency: order.currency,
        description: product.chips > 0 ? `${product.chips} çip` : `${product.gems} elmas`,
        successUrl: `${base}/store?order=${order.id}`,
        cancelUrl: `${base}/store?order=${order.id}&cancelled=1`,
      });
    } catch (error) {
      await this.orders.markCheckoutFailed(order.id, now);
      this.logger.warn(`Ödeme oturumu açılamadı (${order.id}): ${error instanceof Error ? error.name : 'hata'}`);
      throw new PaymentUnavailableError();
    }
    const pending = await this.orders.attachSession(order.id, session.sessionId, now);
    return { order: toView(pending), checkoutUrl: session.checkoutUrl };
  }

  async listOrders(playerId: string): Promise<PaymentOrderView[]> {
    return (await this.orders.listForPlayer(playerId, store.historyLimit)).map(toView);
  }

  async getOrder(playerId: string, orderId: string): Promise<PaymentOrderView> {
    const order = await this.orders.findForPlayer(playerId, orderId);
    if (!order) throw new PaymentOrderNotFoundError();
    return toView(order);
  }

  /**
   * Sağlayıcı webhook'u. Yoldaki ad yapılandırılmış sağlayıcıyla eşleşmiyorsa
   * (ya da sağlayıcı yoksa) 400 — hangi sağlayıcının kullanıldığı sızdırılmaz.
   * Bilinmeyen sipariş/tekrar olay 200 döner (sağlayıcı yeniden denemesin).
   */
  async handleWebhook(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
    now: Date = new Date(),
  ): Promise<{ received: true }> {
    const gateway = this.gateway;
    if (gateway === null || gateway.name !== providerName || !rawBody) throw new InvalidWebhookError();
    const event = gateway.parseWebhook(rawBody, headers);
    const result = await this.orders.applyWebhook(
      gateway.name,
      event,
      (order) => decideWebhookEffect(order, event),
      now,
    );
    if (result.kind === 'applied' && result.effect.kind === 'mark_failed' && result.effect.code === 'AMOUNT_MISMATCH') {
      this.logger.warn(`Ödeme tutarı siparişle uyuşmadı — inceleme gerekli (sipariş ${result.order.id}).`);
    }
    if (result.kind === 'applied' && result.order.clawbackShortfallGems > 0) {
      this.logger.warn(`İadede elmas açığı (${result.order.clawbackShortfallGems}) — inceleme gerekli (sipariş ${result.order.id}).`);
    }
    if (result.kind === 'applied' && result.order.clawbackShortfallChips > 0) {
      this.logger.warn(`İadede çip açığı (${result.order.clawbackShortfallChips}) — inceleme gerekli (sipariş ${result.order.id}).`);
    }
    return { received: true };
  }

  async listForAdmin(actorId: string): Promise<AdminPaymentOrderView[]> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'payments.manage');
    return this.orders.listForAdmin(store.adminListLimit);
  }

  async requestRefund(actorId: string, orderId: string): Promise<{ requested: true }> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'payments.manage');
    const gateway = this.gateway;
    if (gateway === null) throw new PaymentUnavailableError();
    const order = await this.orders.findById(orderId);
    if (!order) throw new PaymentOrderNotFoundError();
    if (order.status !== 'paid' || order.provider !== gateway.name || !order.providerPaymentId) {
      throw new PaymentRefundNotAllowedError();
    }
    await this.orders.recordRefundRequest(actorId, order.id);
    await gateway.refund({ paymentId: order.providerPaymentId, amountMinor: order.amountMinor });
    return { requested: true };
  }
}
