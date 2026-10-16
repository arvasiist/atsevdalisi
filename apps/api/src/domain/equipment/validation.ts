import type { EquipmentType } from '@at-sevdalisi/shared-types';

/**
 * `packages/shared-types/src/horse.ts` `EquipmentType` ile BİREBİR aynı
 * tutulmalıdır — `TRAINING_TYPES`'ın (`domain/training/validation.ts`)
 * `TrainingType` ile olan İKİLİ (domain + shared-types) tutarlılık
 * deseniyle AYNI gerekçe: DTO'nun `@IsIn(...)` doğrulaması bu diziyi
 * kullanır (08.10.2026'dan beri katalog doğrulaması), migration 0028'in `CHECK` kısıtı ise VERİTABANI seviyesinde
 * AYNI beş değeri tekrar eder (üç katmanlı savunma — `docs/ARCHITECTURE.md`
 * §9.1 Hata 7 ile AYNI ruh).
 */
export const EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];

/** `Horse.quality`/diğer 0-100 kalite alanlarıyla AYNI ölçek. */
export const MIN_EQUIPMENT_QUALITY = 0;
export const MAX_EQUIPMENT_QUALITY = 100;

/** Katalog kalemi adının sınırları (08.10.2026'dan beri ad katalogdan gelir; `validateEquipmentConfig` denetler). */
export const MIN_EQUIPMENT_NAME_LENGTH = 1;
export const MAX_EQUIPMENT_NAME_LENGTH = 60;
