import { describe, expect, it } from 'vitest';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';
import type { RaceTribuneGiftsView } from '@at-sevdalisi/shared-types';
import {
  bumpHorseCount,
  canSendTribuneGift,
  horseGiftSummary,
  mergeTribuneFeed,
  tribuneGiftBlockedReason,
  tribuneGiftName,
} from '../../../src/features/grandstand/tribune-gifts';

/** 08.10.2026 — tribün hediyesi panelinin saf mantığı. */
const catalog = loadGrandstandConfig().tribuneGifts;
const items = catalog.items.map((item) => ({ ...item, ownerAmount: Math.floor((item.price * 70) / 100) }));

function view(overrides: Partial<RaceTribuneGiftsView> = {}): RaceTribuneGiftsView {
  return {
    raceId: 'r',
    open: true,
    items,
    recipients: [{ horseId: 'h1', horseName: 'Kaplan', ownerDisplayName: 'Ayşe' }],
    perHorse: [],
    recent: [],
    sentToday: 0,
    dailyLimit: 50,
    ...overrides,
  };
}

const feedItem = (id: string) => ({
  tribuneGiftId: id,
  giftKey: 'carrot',
  horseId: 'h1',
  horseName: 'Kaplan',
  senderDisplayName: 'Mehmet',
  createdAt: '2026-10-08T12:00:00Z',
});

describe('tribün hediyesi paneli', () => {
  it('katalogda at nalı var; ad katalogdan, bilinmeyen anahtar "hediye"', () => {
    expect(tribuneGiftName('horseshoe')).toBe('Altın Nal');
    expect(tribuneGiftName('uydurma')).toBe('hediye');
  });

  it('gönderilebilirlik: pencere, günlük sınır, bakiye', () => {
    const carrot = items[0]!;
    expect(canSendTribuneGift(view(), carrot, 100)).toBe(true);
    expect(canSendTribuneGift(view(), carrot, carrot.price - 1)).toBe(false);
    expect(canSendTribuneGift(view({ open: false }), carrot, 100)).toBe(false);
    expect(canSendTribuneGift(view({ sentToday: 50 }), carrot, 100)).toBe(false);
    expect(canSendTribuneGift(view(), carrot, undefined)).toBe(false);
  });

  it('engel metni: kapalı, alıcı yok, sınır dolu', () => {
    expect(tribuneGiftBlockedReason(view())).toBeNull();
    expect(tribuneGiftBlockedReason(view({ open: false }))).toContain('artık');
    expect(tribuneGiftBlockedReason(view({ recipients: [] }))).toContain('oyuncu atı yok');
    expect(tribuneGiftBlockedReason(view({ sentToday: 50 }))).toContain('sınır');
  });

  it('canlı akış: yeni en üstte, aynı hediye iki kez eklenmez, sınırda kırpılır', () => {
    const feed = mergeTribuneFeed([feedItem('a')], { ...feedItem('b'), raceId: 'r' }, 2);
    expect(feed.map((item) => item.tribuneGiftId)).toEqual(['b', 'a']);
    expect(mergeTribuneFeed(feed, feedItem('b'), 2)).toHaveLength(2);
    expect(mergeTribuneFeed(feed, feedItem('c'), 2).map((item) => item.tribuneGiftId)).toEqual(['c', 'b']);
  });

  it('at başına sayaç ve özet katalog sırasıyla', () => {
    let perHorse = bumpHorseCount([], 'h1', 'horseshoe');
    perHorse = bumpHorseCount(perHorse, 'h1', 'carrot');
    perHorse = bumpHorseCount(perHorse, 'h1', 'carrot');
    expect(perHorse).toEqual([{ horseId: 'h1', counts: { horseshoe: 1, carrot: 2 } }]);
    expect(horseGiftSummary(perHorse[0]!.counts, items)).toEqual([
      { key: 'carrot', count: 2 },
      { key: 'horseshoe', count: 1 },
    ]);
    expect(horseGiftSummary(undefined, items)).toEqual([]);
  });
});
