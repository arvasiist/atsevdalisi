import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import type { DepositRequest, PaymentIntent, PaymentProvider } from '../../application/ports/payment-provider';

/**
 * SANAL (mock) ödeme sağlayıcısı — brief §21/§41, §42 PHASE 4b.
 *
 * Hiçbir ağ çağrısı YAPMAZ, hiçbir gerçek para HAREKET ETTİRMEZ. Tek işi
 * benzersiz bir referans üretip "ödeme başarılı" demektir. Varlık sebebi
 * brief §41'in açık talebidir: sistemi önce Virtual Coin / Mock Wallet
 * olarak geliştir, gerçek parayı varsayılan olarak AÇMA.
 *
 * ## `isEnabled()` neden İKİ koşulun birleşimi
 *
 * ```
 * config.economy.mockDeposit.enabled  &&  env.nodeEnv !== 'production'
 * ```
 *
 * Tek başına config bayrağı YETMEZ: `config/*.config.json` depoda
 * sürümlenir ve dağıtım ortamına göre DEĞİŞMEZ — yani üretimde de
 * `"enabled": true` olarak durur. Bayrağa güvenmek, "birisi config'i
 * yanlışlıkla `true` bıraktı" durumunda üretimde sınırsız sanal para
 * basma ucunu açık bırakırdı. Ortam koşulu bunu YAPISAL olarak engeller:
 * üretimde uç nokta, config ne derse desin, kapalıdır.
 *
 * Bu, brief §41'in "varsayılan olarak production'a AÇMA" cümlesinin
 * kod hâlidir. Gerçek para yolu bilerek YOKTUR: açmak için (a) gerçek bir
 * `PaymentProvider` implementasyonu yazılmalı, (b) `EconomyModule`'de
 * `PAYMENT_PROVIDER` token'ı ona bağlanmalı, (c) bu sınıfın ortam koşulu
 * gözden geçirilmelidir. Üçü de bilinçli, açık adımlardır — hiçbiri
 * "config'i çevir" kadar kolay değildir.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  /**
   * `'mock'` — defterdeki `mock_deposit` türü ve
   * `reference_type = 'payment_intent'` ile birlikte, bir satırın
   * gerçek mi oyuncak mı olduğunu geriye dönük olarak okunabilir kılar
   * (bkz. `packages/shared-types/src/economy.ts` → `mock_deposit` notu).
   */
  readonly id = 'mock';

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  isEnabled(): boolean {
    return this.config.economy.mockDeposit.enabled && this.config.env.nodeEnv !== 'production';
  }

  async createDeposit(request: DepositRequest): Promise<PaymentIntent> {
    // `randomUUID()` — `join-race.use-case.ts`'teki `entryId` ile AYNI
    // gerekçe: bu bir SİMÜLASYON değeri DEĞİL, bir kimliktir. CLAUDE.md
    // kural 3 (`Math.random()` yasak) yarış motorunun determinizmi
    // içindir; ödeme referansı deterministik OLMAK ZORUNDA DEĞİLDİR ve
    // olmamalıdır (aynı iki yatırma aynı referansı üretirse mutabakat
    // imkânsızlaşırdı).
    const providerReference = `mock_${randomUUID()}`;

    return {
      providerId: this.id,
      providerReference,
      amount: request.amount,
      currency: request.currency,
      createdAt: new Date().toISOString(),
    };
  }
}
