import type { UUID } from './common';
import type { Horse } from './horse';

/**
 * brief §11 Bakım Sistemi. `@at-sevdalisi/game-config`'in `CareActionType`'ı
 * ile AYNI değer kümesi — KASITLI bir tekrar (shared-types bağımlılıksızdır,
 * `@at-sevdalisi/game-config`'e bağımlı OLAMAZ; `TrainingType`/
 * `TrainingIntensity`'nin `config/training.config.json`'daki karşılığıyla
 * AYNI ilişkiyle birebir aynı desen, bkz. `horse.ts`).
 */
export type CareActionType = 'groom' | 'water' | 'clean' | 'vet' | 'farrier' | 'rest';

/** brief §12 Besleme — `@at-sevdalisi/game-config`'in `FeedType`'ı ile AYNI değer kümesi. */
export type FeedType = 'standard' | 'energy' | 'protein' | 'recovery' | 'performance';

/**
 * `HorseHealth`'in bakım eylemlerinden etkilenen alt kümesi — bkz.
 * `domain/care/care.ts` `CareableHealth` ile AYNI şekil (domain tipi
 * doğrudan shared-types'a SIZDIRILMAZ, bkz. docs/ARCHITECTURE.md §4).
 */
export interface CareableHealthView {
  injuryRisk: number;
  recoveryRate: number;
  jointCondition: number;
  weightCondition: number;
}

/** `POST /horses/{id}/care` yanıtı (docs/API.md §4). */
export interface PerformCareActionResult {
  horseId: UUID;
  actionType: CareActionType;
  newVitals: Pick<Horse, 'health' | 'fitness' | 'fatigue' | 'energy' | 'morale'>;
  newHealth: CareableHealthView;
}

/** `POST /horses/{id}/feed` yanıtı (docs/API.md §4). */
export interface FeedHorseResult {
  horseId: UUID;
  feedType: FeedType;
  newVitals: Pick<Horse, 'health' | 'fitness' | 'fatigue' | 'energy' | 'morale'>;
  newHealth: CareableHealthView;
}
