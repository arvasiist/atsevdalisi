import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { ListingNotFoundError } from '../../domain/market/errors';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * `GET /market/listings/{id}` (docs/API.md §5).
 *
 * FAZ 1 wiring, on birinci dilim — `GetStableSummaryUseCase`/`GetHorse
 * UseCase` ile AYNI desen: iş kuralı İÇERMEZ, sadece repository'yi
 * çağırır. brief §30'un tam (filtrelenebilir liste, `my-listings`) tarama
 * ekranları BU dilimin KAPSAMI DIŞINDADIR (bkz. docs/ROADMAP.md) — bu,
 * yalnızca TEK bir ilanı id'siyle okur (doğrulama/test amaçlı da yeterli).
 */
@Injectable()
export class GetMarketListingUseCase {
  constructor(@Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository) {}

  async execute(listingId: string): Promise<MarketListing> {
    const listing = await this.marketListingRepository.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }
    return listing;
  }
}
