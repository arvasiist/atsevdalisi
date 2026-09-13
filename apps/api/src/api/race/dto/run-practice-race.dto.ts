import { IsIn, IsOptional } from 'class-validator';
import type { FinalStretchPlan, RacingStyle, RiskLevel, StartApproach } from '@at-sevdalisi/shared-types';
import { FINAL_STRETCH_PLANS, RACING_STYLES, RISK_LEVELS, START_APPROACHES } from '../../../domain/race/validation';

/**
 * `POST /horses/:id/practice-race` gövde şeması (docs/API.md §4).
 * `train-horse.dto.ts`/`perform-care-action.dto.ts` ile AYNI desen — bu
 * yalnızca FORMAT ön-kontrolüdür, gerçek doğrulama `domain/race/
 * entrant-snapshot.ts`'teki `assertValidRaceTactic` BAĞIMSIZ olarak da
 * yapar. Dört alanın DÖRDÜ de opsiyoneldir — verilmezse `DEFAULT_RACE_TACTIC`
 * kullanılır (docs/API.md §4 örnek isteği hiçbirini göndermez).
 */
export class RunPracticeRaceDto {
  @IsOptional()
  @IsIn(RACING_STYLES)
  racingStyle?: RacingStyle;

  @IsOptional()
  @IsIn(RISK_LEVELS)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsIn(START_APPROACHES)
  startApproach?: StartApproach;

  @IsOptional()
  @IsIn(FINAL_STRETCH_PLANS)
  finalStretchPlan?: FinalStretchPlan;
}
