import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { TrainingIntensity, TrainingType } from '@at-sevdalisi/shared-types';
import {
  MAX_TRAINING_DURATION_MINUTES,
  MIN_TRAINING_DURATION_MINUTES,
  TRAINING_INTENSITIES,
  TRAINING_TYPES,
} from '../../../domain/training/validation';

/**
 * `POST /horses/:id/train` gövde şeması (docs/API.md §4). `register-player.dto.ts`
 * ile AYNI desen — bu yalnızca FORMAT ön-kontrolüdür, gerçek iş kuralları
 * (hazır olma, sakatlık vb.) `domain/training/training.ts`'te BAĞIMSIZ
 * olarak yine çalışır. Sınır değerleri burada TEKRAR sabit sayı olarak
 * YAZILMAZ — `domain/training/validation.ts`'ten içe aktarılır.
 */
export class TrainHorseDto {
  @IsIn(TRAINING_TYPES)
  type!: TrainingType;

  @IsIn(TRAINING_INTENSITIES)
  intensity!: TrainingIntensity;

  /** Verilmezse `DEFAULT_TRAINING_DURATION_MINUTES` kullanılır (docs/API.md §4 örneği bu alanı göndermez). */
  @IsOptional()
  @IsInt()
  @Min(MIN_TRAINING_DURATION_MINUTES)
  @Max(MAX_TRAINING_DURATION_MINUTES)
  durationMinutes?: number;
}
