/** Mesafe kategorileri (docs/ALGORITHMS.md §8, brief §62). */

import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

export type DistanceCategory = 'short' | 'middle' | 'long';

export function getDistanceCategory(
  distanceMeters: number,
  distanceConfig: RaceBalanceConfig['distance'],
): DistanceCategory {
  if (distanceMeters <= distanceConfig.shortMaxMeters) {
    return 'short';
  }
  if (distanceMeters <= distanceConfig.middleMaxMeters) {
    return 'middle';
  }
  return 'long';
}

/**
 * `distanceWeightAdjustments`, `baseAbilityWeights` ile birebir aynı
 * anahtarları paylaşmayabilir (örn. `startSpeed`/`sprint`/`endurance` henüz
 * BaseAbility'nin bir parçası değildir — bkz. `base-ability.ts` notu).
 * Bu fonksiyon yalnızca gerçekten örtüşen anahtarları uygular; örtüşmeyenler
 * ileride segment bazlı alt-stat modeli eklenince devreye girecektir.
 */
export function applyDistanceWeightAdjustments(
  baseWeights: RaceBalanceConfig['baseAbilityWeights'],
  category: DistanceCategory,
  adjustments: RaceBalanceConfig['distanceWeightAdjustments'],
): RaceBalanceConfig['baseAbilityWeights'] {
  const delta = adjustments[category];
  const adjusted = { ...baseWeights };

  for (const [key, value] of Object.entries(delta)) {
    if (key in adjusted) {
      const weightKey = key as keyof RaceBalanceConfig['baseAbilityWeights'];
      adjusted[weightKey] = adjusted[weightKey] + value;
    }
  }

  return adjusted;
}
