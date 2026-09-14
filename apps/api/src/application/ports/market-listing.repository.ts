import type { ListingStatus, MarketListing, PaginatedResult } from '@at-sevdalisi/shared-types';

/**
 * `GET /market/listings` (tarama/browse) için arama filtresi —
 * `MarketController`'da doğrulanır (bkz. `ListMarketListingsUseCase`
 * doc yorumu). `status` burada ZORUNLUDUR: controller, sorgu parametresi
 * verilmezse `'active'` varsayılanını UYGULAR (bkz. o dosyanın yorumu) —
 * bu yüzden port katmanına "varsayılan davranış" belirsizliği hiç sızmaz.
 */
export interface MarketListingSearchFilter {
  status: ListingStatus;
  /** Verilirse yalnızca `price >= minPrice` olan ilanlar döner. */
  minPrice?: number;
  /** Verilirse yalnızca `price <= maxPrice` olan ilanlar döner. */
  maxPrice?: number;
  /** 1-tabanlı sayfa numarası. */
  page: number;
  pageSize: number;
}

/**
 * `MarketListingRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), bkz. `application/ports/player.repository.ts`
 * ile AYNI desen (docs/ARCHITECTURE.md §4).
 */
export interface MarketListingRepository {
  findById(id: string): Promise<MarketListing | null>;
  findActiveByHorseId(horseId: string): Promise<MarketListing | null>;
  save(listing: MarketListing): Promise<void>;
  update(listing: MarketListing): Promise<void>;
  search(filter: MarketListingSearchFilter): Promise<PaginatedResult<MarketListing>>;
  findBySellerId(sellerId: string, status?: ListingStatus): Promise<MarketListing[]>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const MARKET_LISTING_REPOSITORY = Symbol('MARKET_LISTING_REPOSITORY');