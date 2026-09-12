/**
 * Final sprint mekaniği — brief §16 Aşama 6 ("acceleration, sprint, kalan
 * stamina, taktik karar, jokey skill, courage"). `domain/race/pace.ts`'teki
 * closer "geç aşama" bonusundan FARKLIDIR: pace bonusu yarış stiline bağlı
 * pasif bir eğilimken, sprint bonusu `domain/race/jockey-decisions.ts`'in
 * o segment için AKTİF OLARAK `push_for_finish` kararı vermesini gerektirir
 * ve kalan stamina ile jokey becerisine göre ölçeklenir — stamina'yı iyi
 * yöneten bir jokeye somut bir ödül verir.
 */

import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { JockeyDecision } from './jockey-decisions';

/**
 * `decision !== 'push_for_finish'` ise her zaman 0 döner (karar ağacı zaten
 * `sprintAvailable` kontrolünden geçmeden bu kararı vermez — buradaki
 * `runtimeStamina` eşiği ikinci bir savunma hattıdır).
 */
export function deriveSprintBonus(
  runtimeStamina: number,
  decision: JockeyDecision,
  jockeySkillComposite: number,
  config: RaceBalanceConfig['sprint'],
): number {
  if (decision !== 'push_for_finish' || runtimeStamina < config.staminaReserveThreshold) {
    return 0;
  }

  const staminaFactor = runtimeStamina / 100;
  const skillFactor = jockeySkillComposite / 100;
  return config.bonusMultiplier * staminaFactor * skillFactor;
}
