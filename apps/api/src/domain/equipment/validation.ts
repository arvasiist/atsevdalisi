import type { EquipmentType } from '@at-sevdalisi/shared-types';
import { InvalidEquipmentInputError } from './errors';

/**
 * `packages/shared-types/src/horse.ts` `EquipmentType` ile BİREBİR aynı
 * tutulmalıdır — `TRAINING_TYPES`'ın (`domain/training/validation.ts`)
 * `TrainingType` ile olan İKİLİ (domain + shared-types) tutarlılık
 * deseniyle AYNI gerekçe: DTO'nun `@IsIn(...)` doğrulaması bu diziyi
 * kullanır, migration 0028'in `CHECK` kısıtı ise VERİTABANI seviyesinde
 * AYNI beş değeri tekrar eder (üç katmanlı savunma — `docs/ARCHITECTURE.md`
 * §9.1 Hata 7 ile AYNI ruh).
 */
export const EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];

/** `Horse.quality`/diğer 0-100 kalite alanlarıyla AYNI ölçek. */
export const MIN_EQUIPMENT_QUALITY = 0;
export const MAX_EQUIPMENT_QUALITY = 100;

/** Aşırı uzun/boş bir isim girişini engeller — `InvalidHorseNameError`'ın kontrol ettiği alan uzunluğuyla AYNI kategori. */
export const MIN_EQUIPMENT_NAME_LENGTH = 1;
export const MAX_EQUIPMENT_NAME_LENGTH = 60;

/**
 * `docs/ARCHITECTURE.md` §9.1 Hata 7 savunması — `CreateHorseEquipmentDto`nun
 * `@IsIn(...)`/`@Min`/`@Max`/`@Length` kontrollerinin BAĞIMSIZ bir tekrarı
 * (bkz. `assertValidRaceTactic`, `entrant-snapshot.ts` ile AYNI desen).
 */
export function assertValidEquipmentInput(input: { equipmentType: EquipmentType; name: string; quality: number }): void {
  if (!EQUIPMENT_TYPES.includes(input.equipmentType)) {
    throw new InvalidEquipmentInputError(`Geçersiz ekipman tipi: "${String(input.equipmentType)}".`);
  }
  const trimmedName = input.name.trim();
  if (trimmedName.length < MIN_EQUIPMENT_NAME_LENGTH || trimmedName.length > MAX_EQUIPMENT_NAME_LENGTH) {
    throw new InvalidEquipmentInputError(
      `Ekipman adı ${MIN_EQUIPMENT_NAME_LENGTH}-${MAX_EQUIPMENT_NAME_LENGTH} karakter arasında olmalı.`,
    );
  }
  if (
    typeof input.quality !== 'number' ||
    Number.isNaN(input.quality) ||
    input.quality < MIN_EQUIPMENT_QUALITY ||
    input.quality > MAX_EQUIPMENT_QUALITY
  ) {
    throw new InvalidEquipmentInputError(`Ekipman kalitesi ${MIN_EQUIPMENT_QUALITY}-${MAX_EQUIPMENT_QUALITY} arasında olmalı.`);
  }
}
