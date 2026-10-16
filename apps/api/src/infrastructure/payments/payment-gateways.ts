import type { PaymentGateway } from '../../application/ports/payment-gateway';

/**
 * ÖDEME SAĞLAYICISI SEÇİMİ (07.10.2026, Faz 12). `PAYMENT_PROVIDER` bir
 * sağlayıcı adıdır. BUGÜN gerçek bir sağlayıcı uygulaması YOKTUR (sahibinin
 * kararı + sözleşme + anahtarlar + yasal inceleme bekleniyor): değişken
 * boşsa mağaza kapalıdır (`null`), bilinmeyen bir ad açılışta HATA verir.
 * Yeni sağlayıcı: `PaymentGateway`ı uygula (imza doğrulaması ŞART), buraya ekle.
 */
const GATEWAYS: Record<string, (env: NodeJS.ProcessEnv) => PaymentGateway> = {};

export function createPaymentGateway(env: NodeJS.ProcessEnv): PaymentGateway | null {
  const name = env.PAYMENT_PROVIDER?.trim();
  if (!name) return null;
  const factory = GATEWAYS[name];
  if (!factory) {
    throw new Error(`PAYMENT_PROVIDER="${name}" tanınmıyor (bilinen: ${Object.keys(GATEWAYS).join(', ') || 'yok'}).`);
  }
  return factory(env);
}
