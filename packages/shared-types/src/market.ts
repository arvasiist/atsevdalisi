import type { ISODateTimeString, UUID } from './common';

/** brief §7 MarketListing, §30 */
export type ListingType = 'fixed_price' | 'auction';
export type ListingStatus = 'active' | 'sold' | 'expired' | 'cancelled';

export interface MarketListing {
  id: UUID;
  sellerId: UUID;
  horseId: UUID;
  price: number;
  listingType: ListingType;
  status: ListingStatus;
  createdAt: ISODateTimeString;
  expiresAt: ISODateTimeString | null;
}
