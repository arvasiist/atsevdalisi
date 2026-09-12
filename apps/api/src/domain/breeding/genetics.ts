/**
 * Genetik kalıtım — saf matematik (brief §28, docs/ALGORITHMS.md §10,
 * docs/GENETICS.md §3-5). Bu dosya HİÇBİR at/pedigree kavramı bilmez;
 * sadece sayı üretir. At/pedigree orkestrasyonu `breeding.ts`'tedir.
 *
 * Determinizm: brief §18 ve GENETICS.md §8 "aynı seed ile aynı ebeveyn
 * çifti → aynı tay sonucu" kuralı gereği, `Math.random()` KULLANILMAZ —
 * çağıran taraf `createSeededRandom` ile üretilmiş bir `rng` fonksiyonu
 * geçirir (bkz. `@at-sevdalisi/shared-types`).
 */

import { clamp, seededRange } from '@at-sevdalisi/shared-types';
import type { GeneticsConfig } from '@at-sevdalisi/game-config';

export interface InheritanceSplit {
  inheritanceA: number;
  inheritanceB: number;
}

/**
 * inheritance_A = random(0.35, 0.65), inheritance_B = 1 - inheritance_A
 * (docs/GENETICS.md §3). Her stat için AYRI bir `rng` çağrısıyla (yani
 * ayrı bir seed namespace'iyle) üretilmelidir — böylece bir tay bazı
 * özelliklerde anneye, bazılarında babaya daha yakın çıkabilir.
 */
export function generateInheritanceSplit(rng: () => number, config: GeneticsConfig): InheritanceSplit {
  const inheritanceA = seededRange(rng, config.inheritanceRange[0], config.inheritanceRange[1]);
  return { inheritanceA, inheritanceB: 1 - inheritanceA };
}

/**
 * mutation = clamp(random(-mutationRange, +mutationRange), mutationBounds)
 * (docs/GENETICS.md §4). `mutationBounds` simetrik kabul edilip hem
 * örnekleme aralığı hem de nihai sınır olarak kullanılır (config'te ayrı
 * bir "mutationRange" alanı yoktur — brief'in pseudocode'u tek bir sınırı
 * iki kez adlandırmış olarak yorumlanmıştır; `clamp` burada savunma amaçlı
 * bir güvenlik ağıdır).
 */
export function calculateMutation(rng: () => number, config: GeneticsConfig): number {
  const [min, max] = config.mutationBounds;
  return clamp(seededRange(rng, min, max), min, max);
}

/**
 * child_stat = parent_A_stat × inheritance_A + parent_B_stat × inheritance_B
 * + mutation, [0, 100] aralığına sınırlanır.
 */
export function calculateChildStat(
  parentAStat: number,
  parentBStat: number,
  split: InheritanceSplit,
  mutation: number,
): number {
  return clamp(parentAStat * split.inheritanceA + parentBStat * split.inheritanceB + mutation, 0, 100);
}

/**
 * child_potential ≤ average(parent_potentials) × maxPotentialGainOverParents
 * (docs/GENETICS.md §5). Potansiyele de (küçük) bir mutasyon payı
 * uygulanır — brief §89 İlke 7 "genetik tamamen deterministik değildir".
 */
export function calculateChildPotential(
  parentAPotential: number,
  parentBPotential: number,
  mutation: number,
  config: GeneticsConfig,
): number {
  const averagePotential = (parentAPotential + parentBPotential) / 2;
  const cap = averagePotential * config.maxPotentialGainOverParents;
  const raw = averagePotential + mutation;
  return clamp(Math.min(raw, cap), 0, 100);
}
