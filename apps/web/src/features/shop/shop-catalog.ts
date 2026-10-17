/**
 * MARKET — saf ekran mantığı (16.10.2026, brief §8). Fiyat, stok, günlük
 * sınır ve kullanım koşulları SUNUCUNUN `feed-inventory` yanıtından gelir;
 * sunucu aynı kuralları satın alma/besleme anında KENDİSİ uygular. Burada
 * toplam fiyat HESAPLANMAZ (depo indirimi yukarı yuvarlanır, ödenen tutar
 * yanıttaki `totalCost`tur).
 */
import type { BuyFeedResult, FeedCategory, FeedItemView } from '@at-sevdalisi/shared-types';
import { loadCareConfig } from '@at-sevdalisi/game-config';
import { LIFE_STAGE_LABELS } from '../breeding/horse-lifecycle';
import { FEED_CATEGORY_ORDER, FEED_TYPE_LABELS } from '../care/feed-labels';

/** Tek alımda en fazla adet — sunucuyla aynı config (`feedPurchaseMaxCount`). */
export const FEED_PURCHASE_MAX_COUNT = loadCareConfig().feedPurchaseMaxCount;

export interface ShopFeedSection {
  category: FeedCategory;
  items: FeedItemView[];
}

/** Satın alınabilir kalemler (fiyatı olan), kategori sırasıyla, kategori içinde ucuzdan pahalıya. */
export function groupShopFeedItems(items: readonly FeedItemView[]): ShopFeedSection[] {
  return FEED_CATEGORY_ORDER.map((category) => ({
    category,
    items: items
      .filter((item) => item.category === category && item.price !== null)
      .sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0)),
  })).filter((section) => section.items.length > 0);
}

/** Kullanım koşulları — her biri sunucunun uyguladığı bir kural. */
export function describeFeedConditions(item: FeedItemView): string[] {
  const conditions: string[] = [];
  if (item.allowedLifeStages && item.allowedLifeStages.length > 0) {
    const stages = item.allowedLifeStages.map((stage) => LIFE_STAGE_LABELS[stage] ?? stage).join(' / ');
    conditions.push(`Yalnızca ${stages} çağındaki ata`);
  }
  if (item.requiresVetWithinHours !== null) {
    conditions.push(`Son ${item.requiresVetWithinHours} saatte veteriner kontrolü gerekir`);
  }
  if (item.dailyLimit !== null) {
    conditions.push(`At başına günde en fazla ${item.dailyLimit}`);
  }
  return conditions;
}

/** Adet girdisini 1..azami aralığına çeker (boş/bozuk → 1). */
export function clampFeedCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(FEED_PURCHASE_MAX_COUNT, Math.max(1, Math.trunc(value)));
}

/** Makbuz — sayılar yanıttan. */
export function describeFeedPurchase(result: BuyFeedResult): string {
  return `${result.purchasedCount} × ${FEED_TYPE_LABELS[result.type]} alındı · ${result.totalCost} çip ödendi · stokta ${result.quantity}`;
}
