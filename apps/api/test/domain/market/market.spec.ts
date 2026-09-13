import { describe, expect, it } from 'vitest';
import {
  calculateMarketValue,
  cancelListing,
  createListingDraft,
  expireListingIfNeeded,
  isListingExpired,
  purchaseListing,
} from '../../../src/domain/market/market';
import {
  CannotBuyOwnListingError,
  InvalidListingExpiryError,
  InvalidListingPriceError,
  ListingExpiredError,
  ListingNotActiveError,
} from '../../../src/domain/market/errors';
import economyConfigJson from '../../../../../config/economy.config.json';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { WalletBalance } from '../../../src/domain/economy/wallet';

const economyConfig = economyConfigJson as unknown as EconomyConfig;

/** docs/ALGORITHMS.md §11 MarketValue. */
describe('calculateMarketValue', () => {
  it('yüksek kaliteli/potansiyelli/sağlıklı bir at daha değerli çıkar', () => {
    const high = calculateMarketValue(
      { quality: 90, potential: 90, ageGrowthFactor: 1, raceHistory: { racesRun: 10, wins: 8 }, pedigreeQualityScore: 85, health: 95 },
      economyConfig,
    );
    const low = calculateMarketValue(
      { quality: 30, potential: 30, ageGrowthFactor: 0.5, raceHistory: { racesRun: 10, wins: 1 }, pedigreeQualityScore: 20, health: 50 },
      economyConfig,
    );
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it('yarış geçmişi/soy bilgisi olmayan atlar için nötr varsayılan kullanır (hata fırlatmaz)', () => {
    expect(() =>
      calculateMarketValue({ quality: 50, potential: 50, ageGrowthFactor: 1, raceHistory: null, pedigreeQualityScore: null, health: 50 }, economyConfig),
    ).not.toThrow();
  });

  it('demandFactor değeri sonuca doğrudan orantılı çarpan olarak uygulanır', () => {
    const input = { quality: 60, potential: 60, ageGrowthFactor: 1, raceHistory: null, pedigreeQualityScore: null, health: 60 } as const;
    const base = calculateMarketValue(input, economyConfig, 1);
    const highDemand = calculateMarketValue(input, economyConfig, 1.5);
    expect(highDemand).toBe(Math.round(base * 1.5));
  });
});

describe('createListingDraft', () => {
  it('geçerli bir ilan taslağı oluşturur', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const listing = createListingDraft({
      id: 'listing-1',
      sellerId: 'seller-1',
      horseId: 'horse-1',
      price: 10000,
      listingType: 'fixed_price',
      now,
      expiresInHours: 24,
    });
    expect(listing.status).toBe('active');
    expect(listing.expiresAt).toBe(new Date(now.getTime() + 24 * 3600 * 1000).toISOString());
  });

  it('negatif fiyat için hata fırlatır', () => {
    expect(() =>
      createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: -5, listingType: 'fixed_price' }),
    ).toThrow(InvalidListingPriceError);
  });

  it('expiresInHours verilmezse süresiz ilan oluşturur', () => {
    const listing = createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price' });
    expect(listing.expiresAt).toBeNull();
  });

  // FAZ 1 wiring, on üçüncü dilim — `expiresInHours` FAZ 0'dan beri kabul
  // ediliyordu ama hiç DOĞRULANMIYORDU (herhangi bir sayı, hatta negatif/
  // ondalık kabul edilirdi). Bu dilim `InvalidListingPriceError` ile AYNI
  // desende bir doğrulama ekledi.
  it('expiresInHours sıfır veya negatifse hata fırlatır', () => {
    expect(() =>
      createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price', expiresInHours: 0 }),
    ).toThrow(InvalidListingExpiryError);
    expect(() =>
      createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price', expiresInHours: -5 }),
    ).toThrow(InvalidListingExpiryError);
  });

  it('expiresInHours üst sınırı (720 saat) aşarsa hata fırlatır', () => {
    expect(() =>
      createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price', expiresInHours: 721 }),
    ).toThrow(InvalidListingExpiryError);
  });

  it('expiresInHours tam sayı değilse hata fırlatır', () => {
    expect(() =>
      createListingDraft({ id: 'x', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price', expiresInHours: 1.5 }),
    ).toThrow(InvalidListingExpiryError);
  });
});

describe('purchaseListing', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const listing = createListingDraft({ id: 'l1', sellerId: 'seller-1', horseId: 'h1', price: 10000, listingType: 'fixed_price', now });

  it('parayı alıcıdan satıcıya aktarır ve ilanı sold yapar', () => {
    const buyerBalance: WalletBalance = { money: 20000, gems: 0 };
    const sellerBalance: WalletBalance = { money: 0, gems: 0 };
    const result = purchaseListing(listing, 'buyer-1', buyerBalance, sellerBalance, now);
    expect(result.listing.status).toBe('sold');
    expect(result.buyerBalance.money).toBe(10000);
    expect(result.sellerBalance.money).toBe(10000);
  });

  it('kendi ilanını satın almaya çalışırsa hata fırlatır', () => {
    const balance: WalletBalance = { money: 20000, gems: 0 };
    expect(() => purchaseListing(listing, 'seller-1', balance, balance, now)).toThrow(CannotBuyOwnListingError);
  });

  it('aktif olmayan ilanı satın almaya çalışırsa hata fırlatır', () => {
    const sold = { ...listing, status: 'sold' as const };
    const balance: WalletBalance = { money: 20000, gems: 0 };
    expect(() => purchaseListing(sold, 'buyer-1', balance, balance, now)).toThrow(ListingNotActiveError);
  });

  it('süresi dolmuş ilanı satın almaya çalışırsa hata fırlatır', () => {
    const expiring = createListingDraft({ id: 'l2', sellerId: 's', horseId: 'h', price: 100, listingType: 'fixed_price', now, expiresInHours: 1 });
    const later = new Date(now.getTime() + 2 * 3600 * 1000);
    const balance: WalletBalance = { money: 20000, gems: 0 };
    expect(() => purchaseListing(expiring, 'buyer-1', balance, balance, later)).toThrow(ListingExpiredError);
  });
});

describe('isListingExpired / expireListingIfNeeded / cancelListing', () => {
  it('expiresAt geçmişse expired sayılır', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const listing = createListingDraft({ id: 'l', sellerId: 's', horseId: 'h', price: 1, listingType: 'fixed_price', now, expiresInHours: 1 });
    const later = new Date(now.getTime() + 2 * 3600 * 1000);
    expect(isListingExpired(listing, later)).toBe(true);
    expect(expireListingIfNeeded(listing, later).status).toBe('expired');
  });

  it('aktif bir ilanı iptal edebilir', () => {
    const listing = createListingDraft({ id: 'l', sellerId: 's', horseId: 'h', price: 1, listingType: 'fixed_price' });
    expect(cancelListing(listing).status).toBe('cancelled');
  });

  it('aktif olmayan bir ilanı iptal etmeye çalışırsa hata fırlatır', () => {
    const listing = { ...createListingDraft({ id: 'l', sellerId: 's', horseId: 'h', price: 1, listingType: 'fixed_price' }), status: 'sold' as const };
    expect(() => cancelListing(listing)).toThrow(ListingNotActiveError);
  });
});
