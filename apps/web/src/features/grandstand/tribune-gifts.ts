/**
 * TRİBÜN HEDİYESİ (08.10.2026) — saf ekran mantığı. Fiyat, pay ve alıcı
 * sunucudadır; burası yalnızca katalog adı, özet ve düğme durumu.
 */
import type {
  RaceTribuneGiftsView,
  TribuneGiftInboxView,
  TribuneGiftEvent,
  TribuneGiftFeedItem,
  TribuneGiftItemView,
} from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';

const CATALOG = loadGrandstandConfig().tribuneGifts.items;

/** Bildirim/akış metni için hediye adı (bilinmeyen anahtar "hediye"). */
export function tribuneGiftName(giftKey: string): string {
  return CATALOG.find((item) => item.key === giftKey)?.name ?? 'hediye';
}

export function tribuneGiftEmoji(giftKey: string): string {
  return CATALOG.find((item) => item.key === giftKey)?.emoji ?? '';
}

/** "🥕 3 · 🧿 1" gibi kısa özet — katalog sırasıyla; hediye yoksa boş. */
export function horseGiftSummary(
  counts: Record<string, number> | undefined,
  items: readonly TribuneGiftItemView[],
): Array<{ key: string; count: number }> {
  if (!counts) return [];
  return items.filter((item) => (counts[item.key] ?? 0) > 0).map((item) => ({ key: item.key, count: counts[item.key]! }));
}

export function canSendTribuneGift(
  view: RaceTribuneGiftsView,
  item: TribuneGiftItemView,
  money: number | undefined,
): boolean {
  return view.open && view.sentToday < view.dailyLimit && money !== undefined && money >= item.price;
}

export function tribuneGiftBlockedReason(view: RaceTribuneGiftsView): string | null {
  if (!view.open) return 'Bu yarışa artık hediye gönderilemez.';
  if (view.recipients.length === 0) return 'Bu yarışta hediye gönderilebilecek bir oyuncu atı yok.';
  if (view.sentToday >= view.dailyLimit) return `Bugünkü hediye sınırına ulaştın (${view.dailyLimit}).`;
  return null;
}

/**
 * Canlı yayınla gelen hediyeyi akışa ekler (aynı hediye iki kez gelmez —
 * kendi gönderdiğin hem yanıtla hem yayınla gelir). Yeni en üstte.
 */
export function mergeTribuneFeed(
  feed: readonly TribuneGiftFeedItem[],
  event: TribuneGiftEvent | TribuneGiftFeedItem,
  limit: number,
): TribuneGiftFeedItem[] {
  if (feed.some((item) => item.tribuneGiftId === event.tribuneGiftId)) return [...feed];
  const item: TribuneGiftFeedItem = {
    tribuneGiftId: event.tribuneGiftId,
    giftKey: event.giftKey,
    horseId: event.horseId,
    horseName: event.horseName,
    senderDisplayName: event.senderDisplayName,
    createdAt: event.createdAt,
  };
  return [item, ...feed].slice(0, limit);
}

/** Canlı hediye gelince at başına sayacı artırır. */
export function bumpHorseCount(
  perHorse: RaceTribuneGiftsView['perHorse'],
  horseId: string,
  giftKey: string,
): RaceTribuneGiftsView['perHorse'] {
  const existing = perHorse.find((row) => row.horseId === horseId);
  if (!existing) return [...perHorse, { horseId, counts: { [giftKey]: 1 } }];
  return perHorse.map((row) =>
    row.horseId === horseId ? { horseId, counts: { ...row.counts, [giftKey]: (row.counts[giftKey] ?? 0) + 1 } } : row,
  );
}

/**
 * 17.10.2026 — hediye kutusu özeti ("🥕 ×3 · 🎀 ×1"); sayılar sunucudan.
 * Kutu boşsa `null` (panel "toplanacak hediye yok" yazar).
 */
export function inboxSummary(view: TribuneGiftInboxView): string | null {
  if (view.pendingCount === 0) return null;
  return view.pendingByGift
    .map((row) => `${tribuneGiftEmoji(row.giftKey) || tribuneGiftName(row.giftKey)} ×${row.count}`)
    .join(' · ');
}
