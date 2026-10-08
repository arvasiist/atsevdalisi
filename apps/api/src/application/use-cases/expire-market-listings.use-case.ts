import { Inject, Injectable } from '@nestjs/common';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * SABİT FİYATLI İLAN SÜRE DOLUMU (08.10.2026) — zamanlayıcının tek işi.
 * Kural ve atomiklik repository'dedir (`expireDueFixedPriceListings`).
 */
@Injectable()
export class ExpireMarketListingsUseCase {
  constructor(@Inject(MARKET_LISTING_REPOSITORY) private readonly listings: MarketListingRepository) {}

  async expireDue(now: Date = new Date()): Promise<{ expired: string[] }> {
    return { expired: await this.listings.expireDueListings(now) };
  }
}
