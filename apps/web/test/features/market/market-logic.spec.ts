import { describe, expect, it } from 'vitest';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import {
  buildSellBody,
  formatTimeLeft,
  listingActions,
} from '../../../src/features/market/market-logic';

const now = new Date('2026-10-02T12:00:00.000Z');

function listing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
    id: 'l1',
    sellerId: 'seller',
    horseId: 'h1',
    price: 500,
    listingType: 'fixed_price',
    status: 'active',
    createdAt: '2026-10-02T10:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('listingActions — düğmeler (sunucu otoritedir)', () => {
  it('sabit fiyat: başkası alır, sahibi kaldırır; girişsiz hiçbir şey', () => {
    expect(listingActions(listing(), 'buyer', now)).toMatchObject({
      canBuy: true,
      canBid: false,
      canCancel: false,
    });
    expect(listingActions(listing(), 'seller', now)).toMatchObject({
      canBuy: false,
      canCancel: true,
      isMine: true,
    });
    expect(listingActions(listing(), null, now)).toMatchObject({ canBuy: false, canBid: false });
  });

  it('müzayede: teklif kutusu sunucunun minimumNextBid değeriyle; teklif almışsa iptal yok', () => {
    const auction = listing({
      listingType: 'auction',
      expiresAt: '2026-10-03T12:00:00.000Z',
      auction: { currentBid: 600, bidCount: 2, minimumNextBid: 630, leaderId: 'buyer' },
    });
    expect(listingActions(auction, 'buyer', now)).toMatchObject({
      canBuy: false,
      canBid: true,
      isLeader: true,
      suggestedBid: 630,
    });
    expect(listingActions(auction, 'seller', now).canCancel).toBe(false);
    const fresh = listing({ listingType: 'auction', expiresAt: '2026-10-03T12:00:00.000Z' });
    expect(listingActions(fresh, 'seller', now).canCancel).toBe(true);
    expect(listingActions(fresh, 'other', now).suggestedBid).toBe(500);
  });

  it('süresi dolmuş müzayedeye teklif düğmesi yok', () => {
    const ended = listing({ listingType: 'auction', expiresAt: '2026-10-02T11:59:00.000Z' });
    expect(listingActions(ended, 'buyer', now).canBid).toBe(false);
  });
});

describe('buildSellBody', () => {
  const base = {
    horseId: 'h1',
    listingType: 'fixed_price' as const,
    price: '750',
    durationHours: '',
  };
  it('sabit fiyat süresiz olabilir; müzayede süre ister', () => {
    expect(buildSellBody(base)).toEqual({
      ok: true,
      body: { horseId: 'h1', price: 750, listingType: 'fixed_price' },
    });
    expect(buildSellBody({ ...base, listingType: 'auction' }).ok).toBe(false);
    expect(buildSellBody({ ...base, listingType: 'auction', durationHours: '24' })).toEqual({
      ok: true,
      body: { horseId: 'h1', price: 750, listingType: 'auction', expiresInHours: 24 },
    });
  });
  it('at seçilmemiş / bozuk fiyat reddedilir', () => {
    expect(buildSellBody({ ...base, horseId: '' }).ok).toBe(false);
    expect(buildSellBody({ ...base, price: '-1' }).ok).toBe(false);
    expect(buildSellBody({ ...base, price: '1.5' }).ok).toBe(false);
    expect(buildSellBody({ ...base, price: '' }).ok).toBe(false);
  });
});

describe('formatTimeLeft', () => {
  it('dk / sa / gün / doldu', () => {
    expect(formatTimeLeft(null, now)).toBeNull();
    expect(formatTimeLeft('2026-10-02T12:30:00.000Z', now)).toBe('30 dk kaldı');
    expect(formatTimeLeft('2026-10-02T15:10:00.000Z', now)).toBe('3 sa 10 dk kaldı');
    expect(formatTimeLeft('2026-10-06T12:00:00.000Z', now)).toBe('4 gün kaldı');
    expect(formatTimeLeft('2026-10-02T11:00:00.000Z', now)).toBe('süre doldu');
  });
});
