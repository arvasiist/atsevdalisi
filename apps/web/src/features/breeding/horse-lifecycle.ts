import type { PublicHorse } from '@at-sevdalisi/shared-types';

/**
 * 15.10.2026 — S5 yaşam döngüsü: yaş metni ve "emekli et" düğmesinin
 * görünürlüğü. Saf yardımcılar; kural sunucudadır (yaş `ageMonths` olarak
 * sunucudan gelir, emeklilik kapıları `POST /horses/:id/retire`te).
 */

const MONTHS_PER_YEAR = 12;

/** Oyun yaşını okunur metne çevirir: 48 → "4 yaş", 51 → "4 yaş 3 ay", 7 → "7 aylık". */
export function formatHorseAge(ageMonths: number): string {
  const months = Math.max(0, Math.floor(ageMonths));
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const rest = months % MONTHS_PER_YEAR;
  if (years === 0) return `${rest} aylık`;
  return rest === 0 ? `${years} yaş` : `${years} yaş ${rest} ay`;
}

/**
 * Düğme yalnızca emekli olmayan ve oyuncunun SON yarış atı olmayan atta
 * gösterilir (sunucu da `LAST_RACING_HORSE` ile reddeder — bu yalnızca kolaylık).
 */
export function canOfferRetirement(horse: PublicHorse, allHorses: readonly PublicHorse[]): boolean {
  if (horse.status === 'retired') return false;
  return allHorses.some((other) => other.id !== horse.id && other.status !== 'retired');
}

export const RETIREMENT_CONFIRM_MESSAGE =
  'Emeklilik GERİ ALINAMAZ: at bir daha yarışamaz ve antrenman yapamaz, yalnızca damızlık yapar. Emekli edilsin mi?';
