/**
 * Jokey AI karar ağacı — brief §60, `docs/RACE_ENGINE.md` §8. Pseudocode
 * birebir korunmuştur (öncelik sırası önemlidir):
 *
 * ```text
 * if stamina_low:                    reduce_pace()
 * if final_straight and sprint_available: push_for_finish()
 * if blocked:                        search_overtake_lane()
 * if opponent_close and risk_allowed: defend_position()
 * ```
 *
 * İlk sürüm brief'in kendi notuyla uyumlu olarak basit bir if/else karar
 * ağacıdır (Utility AI/Behavior Tree'ye taşınması ileride değerlendirilebilir
 * — brief §60 notu).
 */

import type { RiskLevel } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

export type JockeyDecision = 'reduce_pace' | 'push_for_finish' | 'search_overtake_lane' | 'defend_position' | 'hold';

export interface JockeyDecisionInput {
  runtimeStamina: number;
  /** [0,1] — segmentin yarış içindeki konumu (1 = bitiş). */
  positionFraction: number;
  /**
   * `runtimeStamina`, sprint için ayrılmış rezervin (`config.sprint.
   * staminaReserveThreshold`) üzerinde mi? Bu modül `sprint.ts`'in
   * config'ine bağımlı olmasın diye çağıran taraf (`race-engine.ts`)
   * tarafından önceden hesaplanıp geçirilir (temiz modül ayrımı).
   */
  sprintAvailable: boolean;
  /** Önündeki bir atla arası çok yakın mı (bkz. `overtaking.ts` standings). */
  isBoxedIn: boolean;
  /** Arkasındaki bir at kendisine çok mu yakın. */
  isBeingChased: boolean;
  riskLevel: RiskLevel;
}

export function decideJockeyAction(input: JockeyDecisionInput, config: RaceBalanceConfig['jockeyDecision']): JockeyDecision {
  if (input.runtimeStamina <= config.staminaLowThreshold) {
    return 'reduce_pace';
  }

  if (input.positionFraction >= config.finalStraightPositionFraction && input.sprintAvailable) {
    return 'push_for_finish';
  }

  if (input.isBoxedIn) {
    return 'search_overtake_lane';
  }

  if (input.isBeingChased && config.riskAllowedRiskLevels.includes(input.riskLevel)) {
    return 'defend_position';
  }

  return 'hold';
}
