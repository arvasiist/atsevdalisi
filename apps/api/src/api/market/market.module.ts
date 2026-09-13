import { Module } from '@nestjs/common';
import { MARKET_LISTING_REPOSITORY } from '../../application/ports/market-listing.repository';
import { BuyMarketListingUseCase } from '../../application/use-cases/buy-market-listing.use-case';
import { CancelMarketListingUseCase } from '../../application/use-cases/cancel-market-listing.use-case';
import { CreateMarketListingUseCase } from '../../application/use-cases/create-market-listing.use-case';
import { GetMarketListingUseCase } from '../../application/use-cases/get-market-listing.use-case';
import { ListMarketListingsBySellerUseCase } from '../../application/use-cases/list-market-listings-by-seller.use-case';
import { ListMarketListingsUseCase } from '../../application/use-cases/list-market-listings.use-case';
import { PostgresMarketListingRepository } from '../../infrastructure/market/postgres-market-listing.repository';
import { HorseModule } from '../horse/horse.module';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { MarketController } from './market.controller';

/**
 * FAZ 1 wiring, on birinci dilim — brief §30 At Pazarı. `HorseModule`'ü
 * (`HORSE_REPOSITORY`) ve `PlayerModule`'ü (`PLAYER_REPOSITORY`) import
 * eder — `RaceModule`/`StableModule` ile AYNI desen. Kendi
 * `MARKET_LISTING_REPOSITORY` bağlamasını `RaceModule`'ün `RACE_REPOSITORY`
 * ile AYNI gerekçeyle KENDİSİ sağlar. `IdempotencyInterceptor` burada bir
 * provider olarak listelenir (`RaceModule`/`StableModule` ile AYNI
 * gerekçe — `REDIS_CLIENT`'ı enjekte edebilmesi için; `RedisModule`
 * `@Global()` olduğundan ayrıca `imports`'a eklenmesine GEREK YOKTUR).
 * On ikinci dilim — tarama/"İlanlarım" salt-okunur use-case'leri eklendi;
 * ikisi de AYNI `MARKET_LISTING_REPOSITORY` bağlamasını kullanır, yeni
 * bir bağımlılık/import gerekmedi.
 */
@Module({
  imports: [HorseModule, PlayerModule],
  controllers: [MarketController],
  providers: [
    CreateMarketListingUseCase,
    GetMarketListingUseCase,
    BuyMarketListingUseCase,
    CancelMarketListingUseCase,
    ListMarketListingsUseCase,
    ListMarketListingsBySellerUseCase,
    IdempotencyInterceptor,
    { provide: MARKET_LISTING_REPOSITORY, useClass: PostgresMarketListingRepository },
  ],
})
export class MarketModule {}
