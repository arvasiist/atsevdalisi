import type { FacilityType } from '@at-sevdalisi/shared-types';
import { InvalidFacilityTypeError } from './errors';

/**
 * Çiftlik tesislerinin ÇALIŞMA ZAMANI listesi. `FacilityType` union'ı
 * derleme zamanında tüm geçerli değerleri garanti eder ama bir union'ın
 * runtime karşılığı YOKTUR — DTO doğrulaması, domain doğrulaması ve
 * "çiftlik özeti"nin tesis listesi için bu diziye ihtiyaç vardır (AYNI
 * desen: `domain/equipment/validation.ts` → `EQUIPMENT_TYPES`,
 * `domain/care/validation.ts` → `CARE_ACTION_TYPES`).
 *
 * SIRA BİLİNÇLİDİR: arayüz tesisleri bu sırayla gösterir ve bu sıra
 * `config/farm.config.json`'daki sırayla aynıdır (yani "ucuz/erken inşa
 * edilen" tesisler önce gelir, en pahalı olan `breeding_center` sonda).
 */
export const FACILITY_TYPES: readonly FacilityType[] = [
  'paddock',
  'training_track',
  'vet_center',
  'farrier_area',
  'breeding_center',
  'warehouse',
  'staff_building',
];

/**
 * Dışarıdan (HTTP yol parametresi, JSON gövdesi) gelen HAM bir değeri
 * `FacilityType`'a daraltır; geçersizse `InvalidFacilityTypeError` fırlatır.
 *
 * NEDEN DOMAIN'DE: CLAUDE.md'nin "Kardeş tuzak" notu — `@IsIn` gibi
 * class-validator dekoratörleri esbuild altında (Vitest) SESSİZCE atlanır.
 * DTO'daki `@IsIn(FACILITY_TYPES)` yalnızca ilk savunma hattıdır; gerçek
 * kontrol buradadır ve HTTP katmanından bağımsız olarak HER ZAMAN koşar.
 */
export function parseFacilityType(value: unknown): FacilityType {
  if (typeof value !== 'string' || !(FACILITY_TYPES as readonly string[]).includes(value)) {
    throw new InvalidFacilityTypeError(value);
  }
  return value as FacilityType;
}
