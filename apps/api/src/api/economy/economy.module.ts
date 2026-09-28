import { Module } from '@nestjs/common';
import { FEED_INVENTORY_REPOSITORY } from '../../application/ports/feed-inventory.repository';
import { PAYMENT_PROVIDER } from '../../application/ports/payment-provider';
import { WALLET_REPOSITORY } from '../../application/ports/wallet.repository';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';
import { DepositFundsUseCase } from '../../application/use-cases/deposit-funds.use-case';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case';
import { PostgresFeedInventoryRepository } from '../../infrastructure/feed/postgres-feed-inventory.repository';
import { MockPaymentProvider } from '../../infrastructure/payments/mock-payment-provider';
import { PostgresWalletRepository } from '../../infrastructure/wallet/postgres-wallet.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { EconomyController } from './economy.controller';

/**
 * FAZ 1 wiring, yedinci dilim — brief §37 Günlük Ödül.
 *
 * DEĞİŞTİ (düzeltme, 27.09.2026): bu modül ÖNCEDEN `PlayerModule`'ü import
 * edip `PLAYER_REPOSITORY`'sini kullanıyordu; günlük ödülün cüzdan
 * mutasyonu + defter kaydı o dilimde `PlayerRepository.updateWithLock`'tan
 * `FeedInventoryRepository.grantWithLock`'a TAŞINDI (bkz.
 * `claim-daily-reward.use-case.ts` doc yorumu), yani use-case artık
 * `PLAYER_REPOSITORY`'yi HİÇ enjekte etmiyor ve `PlayerModule` import'u
 * gereksiz kaldı — kaldırıldı.
 *
 * DEĞİŞTİ (28.09.2026, brief §42 PHASE 4b): `PlayerModule` import'u GERİ
 * GELDİ — ama bu bir geri alma DEĞİL, yeni bir bağımlılıktır.
 * `DepositFundsUseCase` bakiyeyi `PLAYER_REPOSITORY.updateWithLock` ile
 * yazar (günlük ödülden FARKLI olarak burada yem envanteri devrede
 * değildir), yani `PLAYER_REPOSITORY`'ye gerçekten ihtiyaç vardır.
 * `StableModule`'ün aynı import'u yapma gerekçesinin AYNISI.
 *
 * ## Neden `FEED_INVENTORY_REPOSITORY` burada (asıl düzeltme)
 *
 * Taşıma yapılırken provider kaydı UNUTULDU: `ClaimDailyRewardUseCase`'in
 * yeni bağımlılığı yalnızca `FeedModule`/`CareModule`'de sağlanıyordu,
 * `EconomyModule`'de değil. Sonuç: Nest use-case'i HİÇ çözemedi ve
 * `GET/POST` günlük ödül ucunu sunan `EconomyController` kurulamadı —
 * bu yüzden TÜM e2e paketi (AppModule'ü bootstrap eden her dosya) düştü.
 * Belirti yanıltıcıydı: 10 dosyanın hepsi `afterAll`'da
 * `TypeError: ... reading 'close'` veriyordu (`app` hiç oluşmadığı için),
 * gerçek neden ise `beforeAll`'daki DI çözümlemesiydi. Modül grafiği
 * yalnızca `Test.createTestingModule(...).compile()` sırasında kurulduğu
 * için bu hata birim testlerde GÖRÜNMEZ — sadece e2e/CI'da çıkar.
 * (`module-graph.spec.ts` bu sınıf hataları yakalamak için vardır.)
 *
 * `PostgresFeedInventoryRepository` durumsuzdur (yalnızca `PG_POOL` tutar),
 * bu yüzden aynı sınıfın birden çok modülde ayrı ayrı sağlanması
 * zararsızdır — `FeedModule`/`CareModule`'ün `HORSE_HEALTH_REPOSITORY` için
 * yazdığı gerekçenin AYNISI.
 */
@Module({
  imports: [PlayerModule],
  controllers: [EconomyController],
  providers: [
    ClaimDailyRewardUseCase,
    { provide: FEED_INVENTORY_REPOSITORY, useClass: PostgresFeedInventoryRepository },
    // brief §20 "WALLET SYSTEM", §42 PHASE 4 — cüzdan + işlem geçmişi
    // OKUMA yolu. `PostgresWalletRepository` de durumsuzdur (yalnızca
    // `PG_POOL` tutar), yukarıdaki AYNI gerekçe.
    GetWalletUseCase,
    { provide: WALLET_REPOSITORY, useClass: PostgresWalletRepository },
    // brief §20 DEPOSIT / §21 / §41, §42 PHASE 4b — SANAL para yatırma.
    //
    // `PAYMENT_PROVIDER` bağlaması BURADADIR ve bilinçli olarak TEK
    // satırdır: gerçek bir sağlayıcıya geçmek için değiştirilecek yer
    // tam olarak burasıdır (`MockPaymentProvider` → `StripePaymentProvider`
    // gibi). Başka hiçbir dosya sağlayıcının KİMLİĞİNİ bilmez —
    // use-case yalnızca `PaymentProvider` arayüzünü görür.
    DepositFundsUseCase,
    { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
    // brief §54 — yatırma bir PARA GİRİŞİ olduğundan `Idempotency-Key`
    // zorunludur (bkz. `economy.controller.ts` `deposit` doc yorumu).
    // `StableModule`/`RaceModule` ile AYNI gerekçe: interceptor
    // `REDIS_CLIENT`'ı enjekte edebilsin diye provider olarak listelenir;
    // `RedisModule` `@Global()` olduğundan ayrıca import GEREKMEZ.
    IdempotencyInterceptor,
  ],
})
export class EconomyModule {}
