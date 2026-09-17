import { Module } from '@nestjs/common';
import { MARKET_LISTING_REPOSITORY } from '../../application/ports/market-listing.repository';
import { MARKET_PURCHASE_REPOSITORY } from '../../application/ports/market-purchase.repository';
import { BuyMarketListingUseCase } from '../../application/use-cases/buy-market-listing.use-case';
import { CancelMarketListingUseCase } from '../../application/use-cases/cancel-market-listing.use-case';
import { CreateMarketListingUseCase } from '../../application/use-cases/create-market-listing.use-case';
import { GetMarketListingUseCase } from '../../application/use-cases/get-market-listing.use-case';
import { ListMarketListingsBySellerUseCase } from '../../application/use-cases/list-market-listings-by-seller.use-case';
import { ListMarketListingsUseCase } from '../../application/use-cases/list-market-listings.use-case';
import { PostgresMarketListingRepository } from '../../infrastructure/market/postgres-market-listing.repository';
import { PostgresMarketPurchaseRepository } from '../../infrastructure/market/postgres-market-purchase.repository';
import { HorseModule } from '../horse/horse.module';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { MarketController } from './market.controller';

@Module({
  imports: [HorseModule],
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
    { provide: MARKET_PURCHASE_REPOSITORY, useClass: PostgresMarketPurchaseRepository },
  ],
  exports: [MARKET_LISTING_REPOSITORY],
})
export class MarketModule {}