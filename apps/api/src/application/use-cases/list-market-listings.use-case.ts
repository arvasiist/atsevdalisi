import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing, PaginatedResult } from '@at-sevdalisi/shared-types';
import {
  MARKET_LISTING_REPOSITORY,
  type MarketListingRepository,
  type MarketListingSearchFilter,
} from '../ports/market-listing.repository';

/**
 * FAZ 1 wiring, on ikinci dilim — At Pazarı'nın filtrelenebilir tarama
 * listesi (`GET /market/listings`, bkz. docs/API.md §5). İş kuralı
 * İÇERMEZ — girdi doğrulaması (status/minPrice/maxPrice/page/pageSize)
 * `MarketController`'da yapılır, `ListHorsesByOwnerUseCase` ile AYNI
 * desen (docs/ARCHITECTURE.md §4: use-case'ler sadece ORKESTRE eder).
 */
@Injectable()
export class ListMarketListingsUseCase {
  constructor(
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
  ) {}

  async execute(filter: MarketListingSearchFilter): Promise<PaginatedResult<MarketListing>> {
    return this.marketListingRepository.search(filter);
  }
}
