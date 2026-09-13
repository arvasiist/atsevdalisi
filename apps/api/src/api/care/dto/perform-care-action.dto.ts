import { IsIn } from 'class-validator';
import type { CareActionType } from '@at-sevdalisi/shared-types';
import { CARE_ACTION_TYPES } from '../../../domain/care/validation';

/**
 * `POST /horses/:id/care` gövde şeması (docs/API.md §4). `train-horse.dto.ts`
 * ile AYNI desen — bu yalnızca FORMAT ön-kontrolüdür, gerçek doğrulama
 * `domain/care/care.ts`'te BAĞIMSIZ olarak da yapılır (bkz.
 * `docs/ARCHITECTURE.md` §9.1 Hata 7).
 */
export class PerformCareActionDto {
  @IsIn(CARE_ACTION_TYPES)
  actionType!: CareActionType;
}
