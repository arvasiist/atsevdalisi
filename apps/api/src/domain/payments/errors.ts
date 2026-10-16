/** Ödeme hataları (07.10.2026, Faz 12). Hepsi `http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'te. */

/** Sunucuda ödeme sağlayıcısı yapılandırılmamış (503) — sipariş YAZILMAZ. */
export class PaymentUnavailableError extends Error {
  constructor() {
    super('Satın alma şu an kapalı.');
    this.name = 'PaymentUnavailableError';
  }
}

export class StoreProductNotFoundError extends Error {
  constructor() {
    super('Ürün bulunamadı.');
    this.name = 'StoreProductNotFoundError';
  }
}

export class PaymentLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentLimitReachedError';
  }
}

export class PaymentOrderNotFoundError extends Error {
  constructor() {
    super('Sipariş bulunamadı.');
    this.name = 'PaymentOrderNotFoundError';
  }
}

/** İmzası doğrulanamayan / biçimsiz webhook (400). Ayrıntı istemciye VERİLMEZ. */
export class InvalidWebhookError extends Error {
  constructor() {
    super('Geçersiz ödeme bildirimi.');
    this.name = 'InvalidWebhookError';
  }
}

export class PaymentRefundNotAllowedError extends Error {
  constructor() {
    super('Bu sipariş iade edilemez (yalnızca ödenmiş sipariş).');
    this.name = 'PaymentRefundNotAllowedError';
  }
}
