/**
 * Runtime (yarış-içi) yorgunluk — brief'in FAZ 5 kapsamında ayrı bir madde
 * olarak listelediği "Fatigue". FAZ 1'deki `preRaceFatigueFactor` (yarış
 * ÖNCESİ, `horses.fatigue` alanından gelen STATİK bir değer) ile
 * KARIŞTIRILMAMALIDIR: bu modül yarış SIRASINDA, segment segment BİRİKEN
 * dinamik bir yorgunluğu modeller — "stamina" (anlık enerji rezervi, ani
 * tükenince sert bir ceza verir) ile "fatigue" (yavaşça biriken aşınma,
 * performansı kademeli olarak düşürür) farklı iki mekanizmadır.
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { JockeyDecision } from './jockey-decisions';

/** `reduce_pace` kararı, yorgunluk birikimini `reducePaceAccumulationMultiplier` kadar yavaşlatır. */
export function accumulateRuntimeFatigue(
  currentFatigue: number,
  decision: JockeyDecision,
  config: RaceBalanceConfig['fatigue'],
): number {
  const multiplier = decision === 'reduce_pace' ? config.reducePaceAccumulationMultiplier : 1;
  return clamp(currentFatigue + config.accumulationPerSegment * multiplier, 0, config.maxRuntimeFatigue);
}

/** Biriken yorgunluğun bu segmentteki performans puanından düşülecek karşılığı. */
export function deriveFatiguePerformancePenalty(runtimeFatigue: number, config: RaceBalanceConfig['fatigue']): number {
  return runtimeFatigue * config.performancePenaltyPerFatiguePoint;
}
