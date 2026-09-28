/**
 * `PaymentProvider` — brief §21 "Gerçek para entegrasyonunu şimdilik
 * doğrudan hard-code etme", §41 "Ücretli yarış sistemini doğrudan
 * 'kullanıcıların para yatırıp yarış sonucuna göre para kazanması'
 * şeklinde varsayılan olarak production'a açma. Sistemi önce: Virtual
 * Coin / Mock Wallet olarak geliştir." — §42 PHASE 4b.
 *
 * ## Neden bir PORT (interface), neden doğrudan Stripe değil
 *
 * Brief'in istediği tam olarak budur: gerçek sağlayıcı seçilmeden ÖNCE
 * onun OTURACAĞI yeri tanımlamak. Bu port olmadan, bugün yazılacak her
 * "para yatır" kodu doğrudan bir sağlayıcının SDK'sına bağlanır ve
 * yarın sağlayıcı değiştiğinde use-case'in kendisi değişirdi.
 *
 * `PLAYER_REPOSITORY`/`WALLET_REPOSITORY` ile AYNI desen: Application
 * katmanı bu arayüzü KULLANIR, Infrastructure İMPLEMENTE eder
 * (`infrastructure/payments/mock-payment-provider.ts`), bağlama
 * `EconomyModule`'de yapılır.
 *
 * ## SÖZLEŞME — burası kritiktir
 *
 * Bu portun implementasyonu **ASLA oyuncu bakiyesini değiştirmez.**
 * Sağlayıcının işi "bu ödeme gerçekleşti" demek ve bir referans
 * üretmektir; bakiyeyi YAZMAK yalnızca `deposit-funds.use-case.ts`'in
 * `PlayerRepository.updateWithLock` çağrısıyla olur (CLAUDE.md kural 1:
 * SUNUCU OTORİTESİ, kural 7: kilit + aynı transaction'da defter kaydı).
 * Bir sağlayıcı implementasyonu `players` tablosuna dokunmaya başlarsa
 * bu, para yolunun ikiye bölünmesi demektir — kabul edilemez.
 */

import type { Currency } from '../../domain/economy/wallet';

export interface DepositRequest {
  playerId: string;
  /** Pozitif tam sayı — doğrulaması çağıranın sorumluluğundadır (`domain/economy/mock-deposit.ts`). */
  amount: number;
  currency: Currency;
}

export interface PaymentIntent {
  /** Ödemeyi oluşturan sağlayıcının kimliği (ör. `'mock'`, `'stripe'`). */
  providerId: string;
  /**
   * Sağlayıcı tarafındaki işlem referansı. Defterde
   * `reference_type = 'payment_intent'` + `reference_id = <bu değer>`
   * olarak saklanır — mutabakat (reconciliation) bu alan üzerinden
   * yapılır, bu yüzden SAĞLAYICI BAŞINA TEKİL olmalıdır.
   */
  providerReference: string;
  amount: number;
  currency: Currency;
  /** ISO 8601 — sağlayıcının ödemeyi kabul ettiği an. */
  createdAt: string;
}

export interface PaymentProvider {
  readonly id: string;
  /**
   * Bu sunucuda para yatırma açık mı. **İki koşulun birleşimidir**
   * (bkz. `MockPaymentProvider`): config bayrağı VE ortam. `false`
   * döndüğünde `deposit-funds.use-case.ts` HİÇBİR yazma yapmadan
   * `MockDepositDisabledError` (403) fırlatır.
   */
  isEnabled(): boolean;
  /**
   * Ödemeyi başlatır ve referansını döner. **Bakiye değiştirmez** (bkz.
   * yukarıdaki SÖZLEŞME notu).
   *
   * ÇAĞRI SIRASI ÖNEMLİDİR: bu metod oyuncu satırı kilitlenmeden ÖNCE
   * çağrılır. Sebep, dış bir servise yapılan ağ çağrısının (gerçek bir
   * sağlayıcıda saniyeler sürebilir) `FOR UPDATE` kilidi TUTULURKEN
   * yapılmasının, o oyuncunun satırını o süre boyunca bloke etmesi ve
   * kilitleme disiplinini (bkz. `PlayerRepository.updateWithLock`) dış
   * bir gecikmeye bağımlı hâle getirmesidir. Mock sağlayıcıda bu çağrı
   * anlıktır, ama sözleşme gerçek sağlayıcıya göre yazılmıştır.
   */
  createDeposit(request: DepositRequest): Promise<PaymentIntent>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
