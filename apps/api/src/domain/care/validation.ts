import type { CareActionType, FeedType } from '@at-sevdalisi/shared-types';

/**
 * `POST /horses/:id/care` ve `POST /horses/:id/feed` (docs/API.md §4)
 * gövde doğrulaması için TEK doğruluk kaynağı — DTO'lar
 * (`api/care/dto/*.ts`) bu sabitleri TEKRAR YAZMAZ, buradan içe aktarır
 * (`domain/training/validation.ts` ile AYNI desen).
 */
export const CARE_ACTION_TYPES: readonly CareActionType[] = ['groom', 'water', 'clean', 'vet', 'farrier', 'rest'];

export const FEED_TYPES: readonly FeedType[] = ['standard', 'energy', 'protein', 'recovery', 'performance'];
