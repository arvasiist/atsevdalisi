import { IsIn, IsOptional, IsString } from 'class-validator';
import type { FinalStretchPlan, RacingStyle, RiskLevel, StartApproach } from '@at-sevdalisi/shared-types';
import { FINAL_STRETCH_PLANS, RACING_STYLES, RISK_LEVELS, START_APPROACHES } from '../../../domain/race/validation';

/**
 * `POST /horses/:id/practice-race` gövde şeması (docs/API.md §4).
 * `train-horse.dto.ts`/`perform-care-action.dto.ts` ile AYNI desen — bu
 * yalnızca FORMAT ön-kontrolüdür, gerçek doğrulama `domain/race/
 * entrant-snapshot.ts`'teki `assertValidRaceTactic` BAĞIMSIZ olarak da
 * yapar. Taktik alanlarının DÖRDÜ de opsiyoneldir — verilmezse
 * `DEFAULT_RACE_TACTIC` kullanılır (docs/API.md §4 örnek isteği hiçbirini
 * göndermez).
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

  /**
   * Proje sahibinin açık talebi (27.09.2026) — "bir yarışta 8/10/12/14/16
   * at koşabilsin". Hangi kademede (giriş ücreti + alan büyüklüğü) koşulacağını
   * seçer (`config/economy.config.json` → `raceTiers[].id`).
   *
   * DİKKAT — BURADA `@IsIn([...])` KULLANILMAZ ve kullanılamaz: kademe
   * kimlikleri DERLEME ZAMANINDA bilinmeyen bir config dosyasından gelir,
   * `@IsIn` ise statik bir dizi ister. Kimlikleri burada elle yazmak
   * (ikinci bir doğruluk kaynağı) tam da kaçınılan şeydir. Bu yüzden
   * burada yalnızca TİP kontrolü yapılır (`@IsString`), GERÇEK kontrol
   * `RunPracticeRaceUseCase`'te config'e karşı yapılır ve geçersizse
   * `INVALID_RACE_TIER` (400) döner — esbuild altında DTO doğrulamasının
   * atlanabildiği gerçeği (bkz. CLAUDE.md) bu tasarımı zorunlu kılar.
   */
  @IsOptional()
  @IsString()
  tierId?: string;
}
