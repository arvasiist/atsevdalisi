/**
 * At ismi doğrulama kuralları. `domain/player/validation.ts` ile aynı desen:
 * sınırlar burada `export const` olarak tanımlanır, ileride bir DTO
 * (`@Length`) eklenirse AYNI sabitleri buradan içe aktarır (tek doğruluk
 * kaynağı, docs/CODING_CONVENTIONS.md #6/7 "magic number yasak").
 */

import { InvalidHorseNameError } from './errors';

export const HORSE_NAME_MIN_LENGTH = 2;
export const HORSE_NAME_MAX_LENGTH = 24;

/**
 * Parametre `unknown`'dır (yalnızca `string` değil) — CLAUDE.md "Kardeş
 * tuzak": Vitest/esbuild altında DTO dekoratörleri atlanır, yani bir uç
 * noktadan gelen ham gövde değeri buraya `number`/`object` olarak
 * ulaşabilir. İmza `string` kalsaydı `name.trim` çağrısı bir `TypeError`
 * fırlatır ve istemci 400 yerine **500** görürdü. Tip kontrolü artık bu
 * fonksiyonun İÇİNDEDİR (tek doğruluk kaynağı), böylece `unknown` kabul
 * eden use-case'ler ayrıca bir guard yazmak zorunda kalmaz.
 *
 * **Doğrulanmış ve `trim()`'lenmiş ismi DÖNER** (`void` değil): böylece
 * çağıran taraf ikinci bir `trim()` yazmaz ve `unknown` bir değeri
 * `string`'e daraltmak için tip iddiası (`as string`) kullanmak zorunda
 * kalmaz — dönüş tipi `string` olduğu için daraltma DERLEYİCİ tarafından
 * yapılır. Mevcut çağıranlar (`createStarterHorse`) dönüş değerini yok
 * sayar; davranışları değişmez.
 */
export function validateHorseName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new InvalidHorseNameError(
      `At ismi ${HORSE_NAME_MIN_LENGTH}-${HORSE_NAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
  const trimmed = name.trim();
  if (trimmed.length < HORSE_NAME_MIN_LENGTH || trimmed.length > HORSE_NAME_MAX_LENGTH) {
    throw new InvalidHorseNameError(
      `At ismi ${HORSE_NAME_MIN_LENGTH}-${HORSE_NAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
  return trimmed;
}
