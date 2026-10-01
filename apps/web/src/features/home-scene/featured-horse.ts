import type { PublicHorse } from '@at-sevdalisi/shared-types';

/** Öne çıkan at: en yüksek kaliteli olan (eşitlikte en yüksek seviye). Ana sayfa vitrini ve kart AYNI kuralı kullanır. */
export function pickFeaturedHorse(horses: readonly PublicHorse[]): PublicHorse | null {
  if (horses.length === 0) return null;
  return [...horses].sort((a, b) => b.quality - a.quality || b.level - a.level)[0] ?? null;
}
