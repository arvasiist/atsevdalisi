import { describe, expect, it } from 'vitest';
import type { FeedItemView } from '@at-sevdalisi/shared-types';
import {
  FEED_PURCHASE_MAX_COUNT,
  clampFeedCount,
  describeFeedConditions,
  describeFeedPurchase,
  groupShopFeedItems,
} from '../../../src/features/shop/shop-catalog';

function item(overrides: Partial<FeedItemView>): FeedItemView {
  return {
    type: 'arpa',
    price: { currency: 'money', amount: 20 },
    stocked: true,
    dailyLimit: null,
    quantity: 0,
    fedInWindow: null,
    discountPercent: 0,
    category: 'feed',
    qualityTier: 'standard',
    allowedLifeStages: null,
    requiresVetWithinHours: null,
    ...overrides,
  };
}

describe('Market kataloğu (brief §8)', () => {
  it('bedava kalem (saman) listelenmez; kategori sırası yem → tay → takviye → ilaç, içinde ucuzdan pahalıya', () => {
    const sections = groupShopFeedItems([
      item({ type: 'agri_kesici', category: 'medicine', price: { currency: 'money', amount: 150 } }),
      item({ type: 'saman', price: null, stocked: false }),
      item({ type: 'enerji_yemi', price: { currency: 'money', amount: 90 } }),
      item({ type: 'yulaf', price: { currency: 'money', amount: 30 } }),
      item({ type: 'tay_yemi', category: 'foal', price: { currency: 'money', amount: 70 } }),
      item({ type: 'elektrolit', category: 'supplement', price: { currency: 'money', amount: 60 } }),
    ]);
    expect(sections.map((section) => section.category)).toEqual(['feed', 'foal', 'supplement', 'medicine']);
    expect(sections[0]!.items.map((entry) => entry.type)).toEqual(['yulaf', 'enerji_yemi']);
  });

  it('koşullar sunucunun kurallarını anlatır (yaş evresi, veteriner, günlük sınır)', () => {
    expect(describeFeedConditions(item({ allowedLifeStages: ['foal', 'development'], dailyLimit: 2 }))).toEqual([
      'Yalnızca Tay / Gelişim çağındaki ata',
      'At başına günde en fazla 2',
    ]);
    expect(describeFeedConditions(item({ requiresVetWithinHours: 24 }))).toEqual([
      'Son 24 saatte veteriner kontrolü gerekir',
    ]);
    expect(describeFeedConditions(item({}))).toEqual([]);
  });

  it('adet 1..config azamisi aralığına çekilir', () => {
    expect(clampFeedCount(0)).toBe(1);
    expect(clampFeedCount(Number.NaN)).toBe(1);
    expect(clampFeedCount(3.7)).toBe(3);
    expect(clampFeedCount(FEED_PURCHASE_MAX_COUNT + 10)).toBe(FEED_PURCHASE_MAX_COUNT);
  });

  it('makbuz yanıttaki sayıları yazar (istemci toplam hesaplamaz)', () => {
    expect(
      describeFeedPurchase({
        type: 'yulaf',
        quantity: 7,
        newBalance: { money: 900, gems: 0 },
        price: { currency: 'money', amount: 30 },
        purchasedCount: 3,
        totalCost: 81,
      }),
    ).toBe('3 × Yulaf alındı · 81 çip ödendi · stokta 7');
  });
});
