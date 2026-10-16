import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import {
  BidTooLowError,
  CannotBidOwnListingError,
  ListingExpiredError,
  ListingNotActiveError,
  ListingNotAuctionError,
} from './errors';
import { isListingExpired } from './market';

/**
 * MÜZAYEDE KURALLARI (02.10.2026) — saf, veritabanısız.
 *
 * İlk teklif en az başlangıç fiyatı (`listing.price`) kadardır. Sonraki
 * teklif mevcut en yüksek tekliften en az
 * `max(ceil(mevcut × yüzde / 100), sabit)` fazla olmalıdır — aynı isteğin
 * tekrarı (ağ yeniden denemesi) bu yüzden ikinci bir emanet ALAMAZ: tekrar,
 * kendi önceki teklifinin altında kalır ve `BID_TOO_LOW` ile düşer.
 */
export function minimumNextBid(
  startPrice: number,
  currentBid: number | null,
  config: EconomyConfig['auction'],
): number {
  if (currentBid === null) {
    return Math.max(1, startPrice);
  }
  const step = Math.max(
    Math.ceil((currentBid * config.minIncrementPercent) / 100),
    config.minIncrementAmount,
  );
  return currentBid + step;
}

export interface BidCheckInput {
  listing: MarketListing;
  bidderId: string;
  amount: number;
  currentBid: number | null;
  now: Date;
  config: EconomyConfig['auction'];
}

/** Teklifin kabul edilebilirliği — kilit ALTINDA okunan değerlerle çağrılır. */
export function assertBidAllowed(input: BidCheckInput): void {
  const { listing, bidderId, amount, currentBid, now, config } = input;
  if (listing.listingType !== 'auction') {
    throw new ListingNotAuctionError(listing.id);
  }
  if (listing.status !== 'active') {
    throw new ListingNotActiveError(listing.id, listing.status);
  }
  if (isListingExpired(listing, now)) {
    throw new ListingExpiredError(listing.id);
  }
  if (listing.sellerId === bidderId) {
    throw new CannotBidOwnListingError();
  }
  const minimum = minimumNextBid(listing.price, currentBid, config);
  if (!Number.isSafeInteger(amount) || amount < minimum) {
    throw new BidTooLowError(amount, minimum);
  }
}
