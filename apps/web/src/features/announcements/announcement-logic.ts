import type { AnnouncementView } from '@at-sevdalisi/shared-types';

/**
 * Duyuru şeridi kararları (02.10.2026, Faz 11-A) — saf. Kapatılan duyuru
 * kimlikleri tarayıcıda tutulur (kişisel tercih; sunucuya gitmez). Liste
 * sınırlı tutulur ki eski kimlikler birikmesin.
 */
export const DISMISSED_STORAGE_KEY = 'atSevdalisi.dismissedAnnouncements';
export const DISMISSED_MAX = 50;

export function visibleAnnouncements(all: AnnouncementView[], dismissed: readonly string[]): AnnouncementView[] {
  const hidden = new Set(dismissed);
  return all.filter((item) => !hidden.has(item.id));
}

export function addDismissed(dismissed: readonly string[], id: string): string[] {
  return [id, ...dismissed.filter((existing) => existing !== id)].slice(0, DISMISSED_MAX);
}

export function parseDismissed(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Önem sırası: bakım > uyarı > bilgi (aynı düzeyde sunucu sırası korunur). */
const LEVEL_PRIORITY: Record<AnnouncementView['level'], number> = { maintenance: 0, warning: 1, info: 2 };

/**
 * 10.10.2026 — şerit kapalıyken YALNIZCA en önemli duyuru tek satır görünür;
 * kalanlar "N duyuru daha" ile açılır. Eskiden her duyuru tam genişlik bir
 * kart oluyordu ve 5 duyuruda 3D sahne ekranın altına itiliyordu.
 */
export function announcementStripLayout(
  visible: readonly AnnouncementView[],
  expanded: boolean,
): { shown: AnnouncementView[]; hiddenCount: number } {
  const ordered = visible
    .map((item, index) => ({ item, index }))
    .sort((a, b) => LEVEL_PRIORITY[a.item.level] - LEVEL_PRIORITY[b.item.level] || a.index - b.index)
    .map((entry) => entry.item);
  if (expanded || ordered.length <= 1) return { shown: ordered, hiddenCount: 0 };
  return { shown: ordered.slice(0, 1), hiddenCount: ordered.length - 1 };
}
