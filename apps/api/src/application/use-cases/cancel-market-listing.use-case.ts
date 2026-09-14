import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { ListingNotFoundError } from '../../domain/market/errors';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * `DELETE /market/listings/{id}` (docs/API.md §5, brief §30 "Satışlarım").
 *
 * E2 DÜZELTMESİ:
 * İptal işlemi, repo seviyesinde koşullu atomik güncelleme (`WHERE status = 'active'`)
 * üzerinden yürütülür. Böylece satın alma ile iptalin çakıştığı durumlarda
 * satılmış ilanların durumu ezilmez; satılmış/süresi dolmuş ilanda ListingNotActiveError (409) fırlatılır.
 */
@Injectable()
export class CancelMarketListingUseCase {
  constructor(@Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository) {}

  async execute(listingId: string): Promise<MarketListing> {
    const listing = await this.marketListingRepository.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }

    return await this.marketListingRepository.cancelIfActive(listingId);
  }
}