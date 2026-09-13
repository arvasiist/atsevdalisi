import type { CareableHealthView } from '@at-sevdalisi/shared-types';

/**
 * `HorseHealthRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), `application/ports/horse-stats.repository.ts`
 * ile AYNI desen. `horse_health` (migration 0003) `HorseHealth`'in TAM
 * şeklini tutar (brief §7) ama bu port BİLİNÇLİ olarak yalnızca
 * `CareableHealthView` alt kümesini (injuryRisk/recoveryRate/
 * jointCondition/weightCondition) okur/yazar — `health`/`muscleCondition`/
 * `respiratoryCondition`/`lastVetCheck` alanları bu dilimde (Bakım) hiç
 * DOKUNULMAYAN, ileride "veteriner kontrolü detaylı sonuç" gibi ayrı bir
 * özelliğin (brief §29, §34) kapsamına giren alanlardır — bkz.
 * `domain/care/care.ts` `CareableHealth` ile AYNI gerekçe.
 */
export interface HorseHealthRepository {
  findCareableHealth(horseId: string): Promise<CareableHealthView | null>;
  updateCareableFields(horseId: string, health: CareableHealthView): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_HEALTH_REPOSITORY = Symbol('HORSE_HEALTH_REPOSITORY');
