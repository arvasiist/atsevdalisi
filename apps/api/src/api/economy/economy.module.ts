import { Module } from '@nestjs/common';
import { FEED_INVENTORY_REPOSITORY } from '../../application/ports/feed-inventory.repository';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';
import { PostgresFeedInventoryRepository } from '../../infrastructure/feed/postgres-feed-inventory.repository';
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
 *
 * `PostgresFeedInventoryRepository` durumsuzdur (yalnızca `PG_POOL` tutar),
 * bu yüzden aynı sınıfın birden çok modülde ayrı ayrı sağlanması
 * zararsızdır — `FeedModule`/`CareModule`'ün `HORSE_HEALTH_REPOSITORY` için
 * yazdığı gerekçenin AYNISI.
 */
@Module({
  controllers: [EconomyController],
  providers: [
    ClaimDailyRewardUseCase,
    { provide: FEED_INVENTORY_REPOSITORY, useClass: PostgresFeedInventoryRepository },
  ],
})
export class EconomyModule {}
