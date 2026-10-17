import type { CosmeticEquipmentType, EquipmentType, PerformanceEquipmentType } from '@at-sevdalisi/shared-types';

/**
 * `packages/shared-types/src/horse.ts` `EquipmentType` ile BİREBİR aynı
 * tutulmalıdır — `TRAINING_TYPES`'ın (`domain/training/validation.ts`)
 * `TrainingType` ile olan İKİLİ (domain + shared-types) tutarlılık
 * deseniyle AYNI gerekçe: DTO'nun `@IsIn(...)` doğrulaması bu diziyi
 * kullanır (08.10.2026'dan beri katalog doğrulaması), migration 0028'in `CHECK` kısıtı ise VERİTABANI seviyesinde
 * AYNI beş değeri tekrar eder (üç katmanlı savunma — `docs/ARCHITECTURE.md`
 * §9.1 Hata 7 ile AYNI ruh).
 */
export const PERFORMANCE_EQUIPMENT_TYPES: readonly PerformanceEquipmentType[] = [
  'saddle',
  'bridle',
  'horseshoe',
  'blinkers',
  'leg_wraps',
];

/** 16.10.2026 (migration 0096) — kozmetik aksesuarlar; yarışa etkisi YOK, aşınmaz. */
export const COSMETIC_EQUIPMENT_TYPES: readonly CosmeticEquipmentType[] = ['halter', 'blanket', 'nameplate', 'collectible'];

export const EQUIPMENT_TYPES: readonly EquipmentType[] = [...PERFORMANCE_EQUIPMENT_TYPES, ...COSMETIC_EQUIPMENT_TYPES];

export function isCosmeticEquipmentType(type: string): boolean {
  return (COSMETIC_EQUIPMENT_TYPES as readonly string[]).includes(type);
}

/** Yalnızca nal zemine özel olabilir; değerler `RaceSurface` ile aynı. */
export const EQUIPMENT_SURFACES = ['grass', 'dirt', 'synthetic'] as const;
export const EQUIPMENT_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

/** `Horse.quality`/diğer 0-100 kalite alanlarıyla AYNI ölçek. */
export const MIN_EQUIPMENT_QUALITY = 0;
export const MAX_EQUIPMENT_QUALITY = 100;

/** Katalog kalemi adının sınırları (08.10.2026'dan beri ad katalogdan gelir; `validateEquipmentConfig` denetler). */
export const MIN_EQUIPMENT_NAME_LENGTH = 1;
export const MAX_EQUIPMENT_NAME_LENGTH = 60;
