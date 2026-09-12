/** Pace sistemi (docs/ALGORITHMS.md §5, brief §20). */

import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RacingStyle } from '@at-sevdalisi/shared-types';

export interface PaceEffect {
  /** Bu segmentte stamina tüketimine uygulanacak çarpan. */
  staminaConsumptionMultiplier: number;
  /** BaseAbility'ye eklenecek (segment performansı için) doğrudan puan bonusu. */
  performanceBonus: number;
}

/** Yarışın son %-kaçlık bölümü "geç aşama" (closer bonus, final sprint) sayılır. */
const LATE_STAGE_THRESHOLD = 0.75;

/**
 * `racingStyle`'a ve segmentin yarış içindeki konumuna (0=start, 1=finish)
 * göre pace etkisini hesaplar. "Önde git" erken avantaj + yüksek stamina
 * maliyeti taşır; "geriden gel" stamina tasarrufu + geç aşama bonusu taşır
 * (brief §20, §89 İlke 1: "sadece en yüksek rating kazanmaz").
 *
 * **FAZ 5 notu:** bu fonksiyon eskiden stil bazlı sabit bir `trafficRisk`
 * (bloklanma olasılığı) de döndürüyordu; bu, gerçek pozisyon/kulvar
 * farkındalıklı bir modelle (`domain/race/overtaking.ts`) DEĞİŞTİRİLMİŞTİR
 * — bkz. `docs/ALGORITHMS.md` §6 "Uygulama notu (FAZ 5)". Bloklanma artık
 * atların BİRBİRİNE GÖRE gerçek zaman farkına bakılarak belirlenir, salt
 * yarış stiline değil.
 */
export function derivePaceEffect(
  racingStyle: RacingStyle,
  positionFraction: number,
  paceConfig: RaceBalanceConfig['pace'],
): PaceEffect {
  const isLateStage = positionFraction >= LATE_STAGE_THRESHOLD;

  if (racingStyle === 'front_runner') {
    return {
      staminaConsumptionMultiplier: paceConfig.frontRunnerStaminaMultiplier,
      performanceBonus: isLateStage ? 0 : paceConfig.frontRunnerPositionBonus,
    };
  }

  if (racingStyle === 'closer') {
    return {
      staminaConsumptionMultiplier: paceConfig.closerStaminaMultiplier,
      performanceBonus: isLateStage ? paceConfig.closerLateStageBonus : 0,
    };
  }

  // 'tracker' ve 'mid_pack': front_runner ile closer arasında, nötr bir profil.
  return {
    staminaConsumptionMultiplier: 1,
    performanceBonus: 0,
  };
}
