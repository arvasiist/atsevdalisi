import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { WalletDepositResult } from '@at-sevdalisi/shared-types';
import { assertValidMockDepositConfig, validateMockDeposit } from '../../domain/economy/mock-deposit';
import { credit } from '../../domain/economy/wallet';
import { InvalidDepositAmountError, MockDepositDisabledError } from '../../domain/economy/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../ports/payment-provider';

/**
 * SANAL para yatırma — brief §20 "WALLET SYSTEM" (DEPOSIT), §21 "Gerçek
 * para entegrasyonunu şimdilik doğrudan hard-code etme", §41 "Sistemi
 * önce: Virtual Coin / Mock Wallet olarak geliştir", §42 PHASE 4b.
 *
 * ## Bu, projedeki İLK "para YARATAN" yoldur — ve bu yüzden en dikkatli olan
 *
 * Bugüne kadarki tüm para yolları (`claim-daily-reward`, `upgrade-stable`,
 * `buy-feed`, `buy-market-listing`, `join-race`, `send-gift`,
 * `buy-grandstand-ticket`, `breed-horse`) bakiyeyi ya İÇ kaynaktan
 * (günlük ödül, yarış ödülü) ya da İKİ OYUNCU ARASINDA taşır. Bu use-case
 * ise cüzdana DIŞARIDAN para sokar; brief §41'in "production'a açma"
 * uyarısı tam olarak bu yüzden vardır. Üç savunma katmanı vardır:
 *
 *  1. **Uç nokta üretimde YAPISAL olarak kapalıdır.** `isEnabled()`
 *     `NODE_ENV === 'production'` iken her zaman `false` döner — config
 *     bayrağı ne olursa olsun (bkz. `MockPaymentProvider`).
 *  2. **Defterdeki tür `'mock_deposit'`tir, `'deposit'` DEĞİL.** Gerçek
 *     bir sağlayıcı bağlandığında geçmiş kayıtların hangisi oyuncak
 *     olduğu geriye dönük olarak OKUNABİLİR kalır.
 *  3. **Tek işlem tavanı** (`mockDeposit.maxAmount`) sunucudadır; istemci
 *     gönderdiği değeri "kırptıramaz" — aşarsa istek 400 alır.
 *
 * ## Kilit disiplini (CLAUDE.md kural 7) — ve neden sağlayıcı kilit DIŞINDA
 *
 * `createDeposit` oyuncu satırı KİLİTLENMEDEN ÖNCE çağrılır. Gerekçe
 * `PaymentProvider.createDeposit` doc yorumundadır: gerçek bir
 * sağlayıcıda bu bir ağ çağrısıdır ve `FOR UPDATE` kilidi tutulurken
 * yapılması, kilidi dış bir gecikmeye bağımlı hâle getirirdi. Bakiyeyi
 * YAZAN tek yer `updateWithLock`'tur ve kontrol/hesaplama orada, satır
 * kilitliyken yapılır (`claim-daily-reward`/`upgrade-stable` ile AYNI).
 *
 * ## Idempotency (brief §54) — iki katman
 *
 * HTTP katmanında `IdempotencyInterceptor` vardır: aynı `Idempotency-Key`
 * ile gelen ikinci istek use-case'e HİÇ ULAŞMAZ, önbellekteki ilk yanıtı
 * alır (bu yüzden `ledgerEntries[].idempotencyKey` bilinçli olarak
 * `null`'dur — defter satırının kendi `id`'si zaten tekil bir anahtardır
 * ve interceptor'ın anahtarı onunla aynı şey değildir: biri "bu HTTP
 * isteği tekrarlandı mı", diğeri "bu defter satırı hangi ödeme"). Bu
 * ayrım `claim-daily-reward`'daki AYNI gerekçedir.
 *
 * ## `transactionId` neden BURADA üretiliyor
 *
 * brief §22 "Transaction ID oluşturulmalı" der. Kimliği veritabanı
 * üretseydi, yanıta koymak için yazma SONRASI bir okuma gerekirdi ve o
 * okuma ile yazma arasına başka bir para hareketi girebilirdi. Kimliği
 * burada üretip `ledgerEntries[].id` olarak vermek, dönen kimliği
 * yazılan satırın kimliğiyle YAPISAL olarak aynı yapar (bkz.
 * `EconomyLedgerEntryInput.id`).
 *
 * Kapsam dışı (bilinçli): GÜNLÜK toplam yatırma tavanı (teknik gerekçe
 * `MockDepositConfig.maxAmount` doc yorumunda — PHASE 16 anti-cheat),
 * para ÇEKME (withdrawal), gerçek sağlayıcı entegrasyonu, iade/chargeback.
 */
@Injectable()
export class DepositFundsUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, rawAmount: unknown): Promise<WalletDepositResult> {
    // 1) KAPALI UÇ NOKTADA TUTARIN GEÇERLİLİĞİ SORULMAZ. Kapatılmış bir
    //    özellikte "tutarın çok küçük" demek yanıltıcı olurdu; ayrıca bu
    //    kontrol config'in kendisi bozuk olsa bile çalışır (yalnızca bir
    //    boolean okur), yani kapalı uç 500 DEĞİL 403 döner.
    if (!this.paymentProvider.isEnabled()) {
      throw new MockDepositDisabledError();
    }

    // 2) Yapılandırma tutarlılığı — bir oyuncu girdisi değil, bir sunucu
    //    hatasıdır (düz `Error` → 500). `assertDailyGiftItemsAreStocked`
    //    ile AYNI gerekçe: sessiz bir config hatası, teşhisi zor bir
    //    "uç nokta çalışıyor ama para gelmiyor" durumuna dönüşürdü.
    assertValidMockDepositConfig(this.config.economy.mockDeposit);

    // 3) Tutar doğrulaması DOMAIN'de (CLAUDE.md kural 5: esbuild altında
    //    `@Body()` DTO dekoratörleri atlanır, yani ham gövde buraya
    //    gerçekten bozuk gelebilir). `rawAmount` bilerek `unknown`.
    const validation = validateMockDeposit(rawAmount, this.config.economy.mockDeposit);
    if (!validation.ok) {
      throw new InvalidDepositAmountError(validation.problem);
    }
    const { amount } = validation;

    // 4) Ödeme sağlayıcısı — KİLİTTEN ÖNCE (bkz. sınıf doc yorumu).
    //    Para birimi `money`: `gems` premium para birimidir ve brief §41
    //    mock cüzdanın onu basmasını İSTEMEZ (gerçek para karşılığı olan
    //    tek şey odur). Bu yüzden para birimi config'e AÇILMADI —
    //    açılsaydı yanlışlıkla `gems` yazılarak premium para basılabilirdi.
    const intent = await this.paymentProvider.createDeposit({ playerId, amount, currency: 'money' });

    // 5) Kimlik yazmadan ÖNCE üretilir (bkz. sınıf doc yorumu).
    const transactionId = randomUUID();

    const result = await this.playerRepository.updateWithLock(playerId, (player) => {
      // Satır KİLİTLİYKEN okunan bakiye authoritative olandır — kilit
      // dışında okunan bir değer stale olabilir (bkz. `updateWithLock`
      // doc yorumu, `upgrade-stable` ile AYNI gerekçe).
      const newBalance = credit({ money: player.money, gems: player.gems }, amount, 'money');
      const now = new Date();

      const depositResult: WalletDepositResult = {
        transactionId,
        amount,
        currency: 'money',
        newBalance,
        providerId: intent.providerId,
        providerReference: intent.providerReference,
      };

      return {
        player: { ...player, money: newBalance.money, updatedAt: now.toISOString() },
        result: depositResult,
        ledgerEntries: [
          {
            id: transactionId,
            playerId,
            type: 'mock_deposit',
            amount,
            currency: 'money',
            // Sağlayıcı referansı defterde SAKLANIR — mutabakat bu alan
            // üzerinden yapılır (bkz. `PaymentIntent.providerReference`).
            referenceType: 'payment_intent',
            referenceId: intent.providerReference,
            balanceBefore: player.money,
            balanceAfter: newBalance.money,
            idempotencyKey: null,
          },
        ],
      };
    });

    if (result === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return result;
  }
}
