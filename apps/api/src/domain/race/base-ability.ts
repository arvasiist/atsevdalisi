/**
 * BaseAbility formülü (docs/ALGORITHMS.md §2, brief §17). Bu, atın/jokeyin
 * o yarış için "donmuş" (RaceEntrantSnapshot) değerlerinden türetilen tek
 * bir taban performans puanıdır (~0-100 ölçeğinde); yarış sırasında segment
 * bazlı modifier'lar (§5 Pace, §7 Environment, §3 Random) buna uygulanır.
 */

import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';

/**
 * `tactic` bileşeni: brief'te BaseAbility'nin bir parçası olarak listelenir,
 * ancak dinamik taktik etkisi zaten Pace sistemi (ALGORITHMS.md §5) ve
 * Overtaking (§6) üzerinden ayrıca modellenir. Tam bir "taktik-uygunluk"
 * modeli (jokey deneyimi, pist/mesafe/rakip bağlamına göre) FAZ 5'e
 * bırakıldığından (bkz. docs/RACE_ENGINE.md §8 notu), burada nötr bir
 * taban değer kullanılır — ileride jockey domain'i eklenince gerçek bir
 * hesaplamayla değiştirilecektir.
 */
const NEUTRAL_TACTIC_SCORE = 50;

export function computeBaseAbility(
  snapshot: RaceEntrantSnapshot,
  weights: RaceBalanceConfig['baseAbilityWeights'],
): number {
  // trackCompatibility: snapshot'ta ayrı bir alan yok; brief §62'deki
  // surface/distance uyumu bileşenlerinin ortalaması olarak temsil edilir.
  const trackCompatibility = (snapshot.surfaceCompatibility + snapshot.distanceCompatibility) / 2;

  return (
    snapshot.speed * weights.speed +
    snapshot.stamina * weights.stamina +
    snapshot.acceleration * weights.acceleration +
    snapshot.fitness * weights.fitness +
    NEUTRAL_TACTIC_SCORE * weights.tactic +
    snapshot.jockeySkillComposite * weights.jockey +
    trackCompatibility * weights.trackCompatibility +
    snapshot.morale * weights.morale +
    snapshot.form * weights.form
  );
}
