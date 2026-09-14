import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { cancelListing } from '../../domain/market/market';
import { ListingNotFoundError } from '../../domain/market/errors';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * `DELETE /market/listings/{id}` (docs/API.md §5, brief §30 "Satışlarım").
 *
 * E2 DÜZELTMESİ:
 * cancelListing(listing) saf domain fonksiyonu ile durum kontrol edilir;
 * PostgresMarketListingRepository.update ise WHERE status = 'active' güvencesiyle
 * satılmış ilanların durumunun ezilmesini engeller.
 */
@Injectable()
export class CancelMarketListingUseCase {
  constructor(@Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository) {}

  async execute(listingId: string): Promise<MarketListing> {
    const listing = await this.marketListingRepository.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }

    const cancelled = cancelListing(listing);
    await this.marketListingRepository.update(cancelled);

    return cancelled;
  }
}