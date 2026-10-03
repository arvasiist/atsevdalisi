import type { LeaderboardPeriod } from '@at-sevdalisi/shared-types';
import { questWindow, type QuestWindow } from '../quests/quests';

/**
 * Sıralama dönemi penceresi (02.10.2026, Faz 11) — saf. Haftalık pencere
 * görevlerle AYNI fonksiyondur (`questWindow`); aylık pencere aynı saat
 * diliminde ayın 1'inde 00:00'da başlar. Dönem bitince sıralama yeni
 * pencereyle kendiliğinden "sıfırlanır" — hiçbir veri silinmez.
 */
export function periodWindow(
  period: LeaderboardPeriod,
  now: Date,
  calendar: { timezoneOffsetMinutes: number; weekStartsOn: number },
): QuestWindow {
  if (period === 'weekly') return questWindow('weekly', now, calendar);
  const offsetMs = calendar.timezoneOffsetMinutes * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - offsetMs;
  const end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - offsetMs;
  return { start: new Date(start), end: new Date(end) };
}

export function isLeaderboardPeriod(value: unknown): value is LeaderboardPeriod {
  return value === 'weekly' || value === 'monthly';
}
