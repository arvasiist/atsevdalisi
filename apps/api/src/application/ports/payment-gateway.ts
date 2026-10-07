import type { PaymentWebhookType } from '../../domain/payments/store';

/**
 * GERÇEK PARA ÖDEME SAĞLAYICISI (07.10.2026, Faz 12, brief §88). Mevcut
 * `PaymentProvider` (sahte yatırma, anında başarı) ile KARIŞTIRMA: gerçek
 * ödeme asenkrondur — sunucu bir ödeme oturumu açar, oyuncu kart bilgisini
 * SAĞLAYICININ sayfasında girer, sonuç sağlayıcının İMZALI webhook'uyla gelir.
 *
 * Sağlayıcı yapılandırılmamışsa enjekte edilen değer `null`dır ve mağaza
 * kapalıdır. Anahtarlar ortam değişkenindedir; istemciye ve loglara gitmez.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentWebhookEvent {
  /** Sağlayıcının olay kimliği — tekrar işlemeyi keser. */
  eventId: string;
  type: PaymentWebhookType;
  /** Siparişi bulmak için: ödeme oturumu ya da ödeme kimliği (en az biri). */
  sessionId: string | null;
  paymentId: string | null;
  amountMinor: number | null;
  currency: string | null;
  failureCode?: string | null;
}

export interface PaymentGateway {
  readonly name: string;
  createCheckout(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; checkoutUrl: string }>;
  /**
   * İMZAYI DOĞRULAR ve olayı ayrıştırır. İmza geçersizse ya da gövde
   * biçimsizse FIRLATIR (`InvalidWebhookError`). Ham gövde gerekir —
   * JSON'a çevrilip yeniden üretilen gövde imzayı bozar.
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent;
  /** İade TALEBİ; sonuç (`payment_refunded`) yine webhook'la gelir. */
  refund(input: { paymentId: string; amountMinor: number }): Promise<void>;
}
