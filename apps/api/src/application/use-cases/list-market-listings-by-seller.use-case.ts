import { Inject, Injectable } from '@nestjs/common';
import type { ListingStatus, MarketListing } from '@at-sevdalisi/shared-types';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * FAZ 1 wiring, on ikinci dilim — At Pazarı'nın "İlanlarım" ekranı
 * (`GET /market/my-listings`, bkz. docs/API.md §5). `ListHorsesByOwnerUseCase`
 * ile AYNI desen: iş kuralı İÇERMEZ, sadece repository'yi çağırır.
 * `sellerId` bu projede henüz gerçek bir kimlik doğrulama/oturum sistemi
 * olmadığından açıkça sorgu parametresi olarak alınır (bkz. "Açık
 * kararlar" madde 1) — `HorseController.listByOwner`'daki `ownerId` ile
 * AYNI gerekçe.
 */
@Injectable()
export class ListMarketListingsBySellerUseCase {
  constructor(
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
  ) {}

  async execute(sellerId: string, status?: ListingStatus): Promise<MarketListing[]> {
    return this.marketListingRepository.findBySellerId(sellerId, status);
  }
}
