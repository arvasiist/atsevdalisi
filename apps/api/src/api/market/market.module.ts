import { Module } from '@nestjs/common';
import { MARKET_LISTING_REPOSITORY } from '../../application/ports/market-listing.repository';
import { MARKET_AUCTION_REPOSITORY } from '../../application/ports/market-auction.repository';
import { MARKET_PURCHASE_REPOSITORY } from '../../application/ports/market-purchase.repository';
import { BuyMarketListingUseCase } from '../../application/use-cases/buy-market-listing.use-case';
import { CancelMarketListingUseCase } from '../../application/use-cases/cancel-market-listing.use-case';
import { CreateMarketListingUseCase } from '../../application/use-cases/create-market-listing.use-case';
import { GetMarketListingUseCase } from '../../application/use-cases/get-market-listing.use-case';
import { ListMarketListingsBySellerUseCase } from '../../application/use-cases/list-market-listings-by-seller.use-case';
import { ListMarketListingsUseCase } from '../../application/use-cases/list-market-listings.use-case';
import { MarketAuctionUseCase } from '../../application/use-cases/market-auction.use-case';
import { PostgresMarketAuctionRepository } from '../../infrastructure/market/postgres-market-auction.repository';
import { AuctionSettleScheduler } from '../../infrastructure/scheduler/auction-settle.scheduler';
import { PostgresMarketListingRepository } from '../../infrastructure/market/postgres-market-listing.repository';
import { PostgresMarketPurchaseRepository } from '../../infrastructure/market/postgres-market-purchase.repository';
import { HorseOwnerGuardByBodyField } from '../auth/horse-owner.guard';
import { ListingOwnerGuard } from '../auth/listing-owner.guard';
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
    MarketAuctionUseCase,
    AuctionSettleScheduler,
    IdempotencyInterceptor,
    { provide: MARKET_LISTING_REPOSITORY, useClass: PostgresMarketListingRepository },
    { provide: MARKET_PURCHASE_REPOSITORY, useClass: PostgresMarketPurchaseRepository },
    { provide: MARKET_AUCTION_REPOSITORY, useClass: PostgresMarketAuctionRepository },
    // AUDIT_REPORT.md Bulgu S2/S4 hardening (bu oturum) — bkz.
    // `horse-owner.guard.ts`/`listing-owner.guard.ts` doc yorumları.
    HorseOwnerGuardByBodyField,
    ListingOwnerGuard,
  ],
  exports: [MARKET_LISTING_REPOSITORY],
})
export class MarketModule {}