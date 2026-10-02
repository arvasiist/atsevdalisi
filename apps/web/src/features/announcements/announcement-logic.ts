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
