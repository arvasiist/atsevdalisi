import type { CareActionType, FeedType } from '@at-sevdalisi/shared-types';
import { InvalidFeedTypeError } from './errors';

/**
 * `POST /horses/:id/care` ve `POST /horses/:id/feed` (docs/API.md §4)
 * gövde doğrulaması için TEK doğruluk kaynağı — DTO'lar
 * (`api/care/dto/*.ts`) bu sabitleri TEKRAR YAZMAZ, buradan içe aktarır
 * (`domain/training/validation.ts` ile AYNI desen).
 */
export const CARE_ACTION_TYPES: readonly CareActionType[] = ['groom', 'water', 'clean', 'vet', 'farrier', 'rest'];

/**
 * Somut yem kalemleri (bu turda DEĞİŞTİ — önceden soyut besin türleriydi).
 * Sıra EKRAN sırasıdır: bedava kalem (`saman`) önce, sonra elmasla alınanlar
 * artan fiyata göre. `feed-inventory` uç noktası kalemleri bu sırayla döner
 * (DB sırasına GÜVENİLMEZ, bkz. `postgres-feed-inventory.repository.ts`).
 */
export const FEED_TYPES: readonly FeedType[] = ['saman', 'arpa', 'mama', 'havuc', 'vitamin'];

/**
 * Kullanıcıdan gelen serbest bir değeri `FeedType`'a daraltır.
 *
 * DTO'daki `@IsIn(FEED_TYPES)` BURAYI GEÇERSİZ KILMAZ — CLAUDE.md'nin
 * "Kardeş tuzak" notu: esbuild altında DTO dekoratörleri sessizce atlanır,
 * bu yüzden domain katmanında BAĞIMSIZ bir doğrulama şarttır
 * (`domain/farm/validation.ts` `parseFacilityType` ile AYNI desen).
 */
export function parseFeedType(value: unknown): FeedType {
  if (typeof value !== 'string' || !(FEED_TYPES as readonly string[]).includes(value)) {
    throw new InvalidFeedTypeError(value);
  }
  return value as FeedType;
}
