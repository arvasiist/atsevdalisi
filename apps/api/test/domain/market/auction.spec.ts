import { describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { assertBidAllowed, minimumNextBid } from '../../../src/domain/market/auction';
import {
  BidTooLowError,
  CannotBidOwnListingError,
  ListingExpiredError,
  ListingNotAuctionError,
} from '../../../src/domain/market/errors';

/** Müzayede kuralları (02.10.2026) — saf, config'ten okunan artış. */
const config = loadEconomyConfig().auction;

describe('minimumNextBid', () => {
  it('ilk teklif başlangıç fiyatı; sonra max(yüzde, sabit) artış', () => {
    expect(minimumNextBid(500, null, config)).toBe(500);
    expect(minimumNextBid(0, null, config)).toBe(1);
    expect(minimumNextBid(1000, 1000, config)).toBe(
      1000 +
        Math.max(Math.ceil((1000 * config.minIncrementPercent) / 100), config.minIncrementAmount),
    );
    expect(minimumNextBid(1, 20, config)).toBe(20 + config.minIncrementAmount);
    expect(
      minimumNextBid(1, 20, { ...config, minIncrementAmount: 1, minIncrementPercent: 50 }),
    ).toBe(30);
  });
});

describe('assertBidAllowed', () => {
  const listing: MarketListing = {
    id: 'l1',
    sellerId: 'seller',
    horseId: 'h1',
    price: 500,
    listingType: 'auction',
    status: 'active',
    createdAt: '2026-10-02T10:00:00.000Z',
    expiresAt: '2026-10-03T10:00:00.000Z',
  };
  const now = new Date('2026-10-02T12:00:00.000Z');
  const base = { listing, bidderId: 'buyer', amount: 500, currentBid: null, now, config };

  it('geçerli teklif geçer; kurallar ayrı hatalarla reddeder', () => {
    expect(() => assertBidAllowed(base)).not.toThrow();
    expect(() => assertBidAllowed({ ...base, amount: 499 })).toThrow(BidTooLowError);
    expect(() => assertBidAllowed({ ...base, amount: 500.5 })).toThrow(BidTooLowError);
    expect(() => assertBidAllowed({ ...base, bidderId: 'seller' })).toThrow(
      CannotBidOwnListingError,
    );
    expect(() =>
      assertBidAllowed({ ...base, listing: { ...listing, listingType: 'fixed_price' } }),
    ).toThrow(ListingNotAuctionError);
    expect(() => assertBidAllowed({ ...base, now: new Date('2026-10-03T10:00:00.000Z') })).toThrow(
      ListingExpiredError,
    );
  });
});
