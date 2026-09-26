import { IsIn, IsNumber, IsString, Length, Max, Min } from 'class-validator';
import type { EquipmentType } from '@at-sevdalisi/shared-types';
import {
  EQUIPMENT_TYPES,
  MAX_EQUIPMENT_NAME_LENGTH,
  MAX_EQUIPMENT_QUALITY,
  MIN_EQUIPMENT_NAME_LENGTH,
  MIN_EQUIPMENT_QUALITY,
} from '../../../domain/equipment/validation';

/**
 * `POST /horses/:id/equipment` gövde şeması (docs/API.md §4) —
 * `train-horse.dto.ts` ile AYNI desen: yalnızca FORMAT ön-kontrolüdür,
 * gerçek iş kuralı doğrulaması `domain/equipment/validation.ts`'teki
 * `assertValidEquipmentInput`'ta BAĞIMSIZ olarak yine çalışır (bkz.
 * `docs/ARCHITECTURE.md` §9.1 Hata 7).
 */
export class CreateHorseEquipmentDto {
  @IsIn(EQUIPMENT_TYPES)
  equipmentType!: EquipmentType;

  @IsString()
  @Length(MIN_EQUIPMENT_NAME_LENGTH, MAX_EQUIPMENT_NAME_LENGTH)
  name!: string;

  @IsNumber()
  @Min(MIN_EQUIPMENT_QUALITY)
  @Max(MAX_EQUIPMENT_QUALITY)
  quality!: number;
}
