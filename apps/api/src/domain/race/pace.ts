/** Pace sistemi (docs/ALGORITHMS.md §5, brief §20). */

import { clamp } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RacingStyle } from '@at-sevdalisi/shared-types';

export interface PaceEffect {
  /** Bu segmentte stamina tüketimine uygulanacak çarpan. */
  staminaConsumptionMultiplier: number;
  /** BaseAbility'ye eklenecek (segment performansı için) doğrudan puan bonusu. */
  performanceBonus: number;
}

/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — "geç aşama" (closer bonusunun
 * başladığı, front-runner bonusunun bittiği nokta) eskiden SABİT bir oran
 * (`positionFraction >= 0.75`, yarış mesafesinden TAMAMEN BAĞIMSIZ) idi.
 * Bu, brief'in "at kişiliği" kavramıyla (ör. "final 400m'de kapanır")
 * ÇELİŞİR: 1600m'lik bir pratik yarışta bu %25'lik dilim 400m'ye denk
 * gelir (isabetli), ama 3200m'lik uzun bir yarışta AYNI %25 dilim 800m'ye
 * çıkar (gerçekçi olmayan biçimde erken/geniş bir "final sprint" penceresi),
 * 1000m'lik bir sprintte ise sadece 250m'ye düşer (gerçekçi olmayan
 * biçimde geç/dar). Şimdi final düzlüğü METRE cinsinden SABİT bir hedef
 * (`paceConfig.finalStretchMeters`, config'te 400) etrafında hesaplanır ve
 * pist uzunluğuna göre bir ORANA çevrilir — segment sistemi artık pist
 * GEOMETRİSİNE (mesafeye) duyarlıdır (brief §52). [MIN_FRACTION,
 * MAX_FRACTION] kırpması, çok kısa (final düzlük neredeyse TÜM yarış
 * olmasın) veya çok uzun (final düzlük anlamsız derecede KISA bir an
 * olmasın) mesafelerde dejenere bir sonucu ÖNLER. 1600m'de (mevcut TEK
 * kullanılan mesafe, `PRACTICE_RACE_DISTANCE_METERS`) bu formül TAM
 * OLARAK eski `0.75` eşiğini üretir (400/1600 = 0.25) — yani bu değişiklik
 * BUGÜNKÜ hiçbir yarışın sonucunu DEĞİŞTİRMEZ, sadece gelecekte farklı
 * mesafeler kullanıldığında (ör. farklı pist uzunlukları) doğru şekilde
 * ÖLÇEKLENMESİNİ sağlar (bkz. `pace.spec.ts`).
 */
const MIN_FINAL_STRETCH_FRACTION = 0.1;
const MAX_FINAL_STRETCH_FRACTION = 0.4;

export function computeFinalStretchFraction(distanceMeters: number, paceConfig: RaceBalanceConfig['pace']): number {
  const rawFraction = paceConfig.finalStretchMeters / distanceMeters;
  return clamp(rawFraction, MIN_FINAL_STRETCH_FRACTION, MAX_FINAL_STRETCH_FRACTION);
}

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
  distanceMeters: number,
  paceConfig: RaceBalanceConfig['pace'],
): PaceEffect {
  const finalStretchFraction = computeFinalStretchFraction(distanceMeters, paceConfig);
  const isLateStage = positionFraction >= 1 - finalStretchFraction;

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
