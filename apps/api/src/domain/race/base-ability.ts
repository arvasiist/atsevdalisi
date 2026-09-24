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
 * Overtaking (§6) üzerinden ayrıca modellenir. Burada nötr bir taban değer
 * kullanılır.
 *
 * **FAZ 5 notu:** bu değer HALA nötrdür ve BİLİNÇLİ olarak öyle
 * bırakılmıştır. FAZ 5, brief §60 jokey AI karar ağacını (`jockey-
 * decisions.ts`) SEGMENT BAZINDA, dinamik bir mekanizma olarak ekledi —
 * bu, BaseAbility'nin STATİK `tactic` bileşeninden ayrı bir katmandır.
 * `jockeySkillComposite`'i tekrar buraya (bir de `tactic` ağırlığı altında)
 * eklemek, aynı jokey yeteneğini iki farklı ağırlıkla iki kez saymak
 * olurdu (zaten `w_jockey` ile ayrı bir bileşendir) — bu yüzden
 * yapılmamıştır.
 */
const NEUTRAL_TACTIC_SCORE = 50;

/**
 * `carriedWeight` bileşeni: R4 — Carried Weight, SADECE at vücut ağırlığı
 * alt-faktörü (bkz. `domain/race/carried-weight.ts`'in doc yorumu — jokey/
 * handikap/ekipman ağırlığı BİLİNÇLİ olarak kapsam dışı). `weights.tactic`
 * `0.10`'dan `0.05`'e düşürülüp açılan `0.05`'lik bütçe buna verildi
 * (bkz. `race.config.json` `baseAbilityWeights`, toplam HALA 1.00) —
 * `tactic`'in kendisi zaten HER zaman sabit `NEUTRAL_TACTIC_SCORE` (50)
 * döndüğü için (yukarıdaki doc yorumu) bu değişiklik BaseAbility'nin
 * GERÇEK varyansını artırdı, önceki davranışı bozmadı.
 */
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
    snapshot.form * weights.form +
    snapshot.weightCompatibility * weights.carriedWeight
  );
}
