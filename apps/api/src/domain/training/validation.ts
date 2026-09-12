import type { TrainingIntensity, TrainingType } from '@at-sevdalisi/shared-types';

/**
 * `POST /horses/:id/train` (docs/API.md §4) gövde doğrulaması için TEK
 * doğruluk kaynağı — DTO (`api/training/dto/train-horse.dto.ts`) bu
 * sabitleri TEKRAR YAZMAZ, buradan içe aktarır (docs/CODING_CONVENTIONS.md
 * #6/7 "magic number yasak, config/sabit kullan" — `domain/horse/validation.ts`
 * ile AYNI desen).
 */
export const TRAINING_TYPES: readonly TrainingType[] = [
  'speed',
  'sprint',
  'stamina',
  'start',
  'cornering',
  'tempo',
  'rest',
];

export const TRAINING_INTENSITIES: readonly TrainingIntensity[] = ['low', 'medium', 'high'];

/** `config/training.config.json` → `durationMultiplier.unitMinutes` ile tutarlı alt sınır. */
export const MIN_TRAINING_DURATION_MINUTES = 15;

/**
 * KARAR (bu dilim, bilinçli): `config/training.config.json` bir üst sınır
 * TANIMLAMAZ — API katmanının aşırı/istismar amaçlı değerleri (örn.
 * 100000 dakika) reddetmesi için burada bir güvenlik sınırı tanımlanır.
 * İleride gerekirse `TrainingConfig`'e taşınabilir.
 */
export const MAX_TRAINING_DURATION_MINUTES = 120;

/** docs/API.md §4 örnek isteği `durationMinutes` GÖNDERMEZ — bu, o durumda kullanılan varsayılandır. */
export const DEFAULT_TRAINING_DURATION_MINUTES = 30;
