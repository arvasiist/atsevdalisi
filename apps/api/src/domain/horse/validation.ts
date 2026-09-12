/**
 * At ismi doğrulama kuralları. `domain/player/validation.ts` ile aynı desen:
 * sınırlar burada `export const` olarak tanımlanır, ileride bir DTO
 * (`@Length`) eklenirse AYNI sabitleri buradan içe aktarır (tek doğruluk
 * kaynağı, docs/CODING_CONVENTIONS.md #6/7 "magic number yasak").
 */

import { InvalidHorseNameError } from './errors';

export const HORSE_NAME_MIN_LENGTH = 2;
export const HORSE_NAME_MAX_LENGTH = 24;

export function validateHorseName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < HORSE_NAME_MIN_LENGTH || trimmed.length > HORSE_NAME_MAX_LENGTH) {
    throw new InvalidHorseNameError(
      `At ismi ${HORSE_NAME_MIN_LENGTH}-${HORSE_NAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
}
