/**
 * HİPODROM EKRANI (16.10.2026, brief §9) — saf yardımcılar. Veri sunucunun
 * `GET /hippodromes` kataloğudur (saatler sunucuda hesaplanır); açık yarışlar
 * `GET /races` satırlarıdır. Burada yalnızca gruplama ve metin vardır.
 */
import type { HippodromeLevelKey, HippodromeView, RaceLobbyListItem } from '@at-sevdalisi/shared-types';

export const HIPPODROME_LEVEL_LABELS: Record<HippodromeLevelKey, string> = {
  local: 'Yerel',
  regional: 'Bölgesel',
  national: 'Ulusal',
  international: 'Uluslararası',
};

/** ISO ülke kodu → bayrak (Unicode bölge harfleri; dosya değil). */
export function countryFlag(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) return '';
  return String.fromCodePoint(...[...countryCode].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function prestigeStars(prestige: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(prestige)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/** Ülkeye göre gruplar (katalog sırası korunur). */
export function groupHippodromesByCountry(
  hippodromes: readonly HippodromeView[],
): Array<{ country: string; countryCode: string; hippodromes: HippodromeView[] }> {
  const groups: Array<{ country: string; countryCode: string; hippodromes: HippodromeView[] }> = [];
  for (const hippodrome of hippodromes) {
    const group = groups.find((candidate) => candidate.countryCode === hippodrome.countryCode);
    if (group) group.hippodromes.push(hippodrome);
    else groups.push({ country: hippodrome.country, countryCode: hippodrome.countryCode, hippodromes: [hippodrome] });
  }
  return groups;
}

/** "her 30 dakikada" / "her 6 saatte" / "haftada bir". */
export function describeCadence(intervalMinutes: number): string {
  if (intervalMinutes === 10080) return 'haftada bir';
  if (intervalMinutes === 1440) return 'günde bir';
  if (intervalMinutes % 60 === 0) return `her ${intervalMinutes / 60} saatte bir`;
  return `her ${intervalMinutes} dakikada bir`;
}

/** Bu pistteki, henüz başlamamış açık lobi yarışları (başlangıca göre). */
export function openRacesAt(
  races: readonly RaceLobbyListItem[],
  hippodromeKey: string,
  now: Date,
): RaceLobbyListItem[] {
  return races
    .filter((race) => race.hippodrome === hippodromeKey && Date.parse(race.startTime) > now.getTime())
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}
