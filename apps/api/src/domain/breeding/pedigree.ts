/**
 * Soy ağacı (Pedigree) ve doğum sağlık riski — docs/GENETICS.md §6-7,
 * database/migrations/0008_create_breeding_and_pedigree.
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { GeneticsConfig, HorseGrowthConfig } from '@at-sevdalisi/game-config';
import type { Pedigree } from '@at-sevdalisi/shared-types';
import { getLifeStage } from '../horse/age-curve';

/**
 * Bir atın bilinen atalarının ID kümesini toplar (kendisi + sire + dam +
 * grandSire + grandDam). `pedigrees` şeması yalnızca 2 nesil geriye
 * (büyük ebeveyn) kadar tuttuğundan, inbreeding kontrolü de bu derinlikle
 * sınırlıdır — docs/GENETICS.md §6'da "brief'te açıkça yazılmamıştır ama
 * gerçekçi bir sistem için gereklidir" notuyla belirtilen, bu projede
 * alınmış bir tasarım kararıdır.
 */
export function collectKnownAncestorIds(horseId: string, pedigree: Pedigree | null): Set<string> {
  const ids = new Set<string>([horseId]);
  if (pedigree) {
    if (pedigree.sireId) ids.add(pedigree.sireId);
    if (pedigree.damId) ids.add(pedigree.damId);
    if (pedigree.grandSireId) ids.add(pedigree.grandSireId);
    if (pedigree.grandDamId) ids.add(pedigree.grandDamId);
  }
  return ids;
}

export interface InbreedingCheckResult {
  detected: boolean;
  /** Ortak bulunan ata ID'leri (hiçbiri yoksa boş dizi). */
  sharedAncestorIds: string[];
  /** detected ise `config.inbreedingRiskMultiplier`, değilse 1.0. */
  factor: number;
}

/** İki ebeveynin bilinen soy ağaçlarında ortak bir ata olup olmadığını kontrol eder. */
export function checkInbreeding(
  mareId: string,
  marePedigree: Pedigree | null,
  stallionId: string,
  stallionPedigree: Pedigree | null,
  config: GeneticsConfig,
): InbreedingCheckResult {
  const mareAncestors = collectKnownAncestorIds(mareId, marePedigree);
  const stallionAncestors = collectKnownAncestorIds(stallionId, stallionPedigree);

  const sharedAncestorIds = [...mareAncestors].filter((id) => stallionAncestors.has(id));

  return {
    detected: sharedAncestorIds.length > 0,
    sharedAncestorIds,
    factor: sharedAncestorIds.length > 0 ? config.inbreedingRiskMultiplier : 1.0,
  };
}

/**
 * parent_age_factor: her ebeveynin yaşam evresine (bkz.
 * `HorseGrowthConfig.stages[].name`) karşılık gelen risk çarpanının
 * ortalaması (docs/GENETICS.md §6).
 */
export function calculateParentAgeFactor(
  mareAgeMonths: number,
  stallionAgeMonths: number,
  growthConfig: HorseGrowthConfig,
  geneticsConfig: GeneticsConfig,
): number {
  const mareStage = getLifeStage(mareAgeMonths, growthConfig).name;
  const stallionStage = getLifeStage(stallionAgeMonths, growthConfig).name;
  const mareFactor = geneticsConfig.parentAgeRiskMultipliers[mareStage] ?? 1;
  const stallionFactor = geneticsConfig.parentAgeRiskMultipliers[stallionStage] ?? 1;
  return (mareFactor + stallionFactor) / 2;
}

/** parent_health_factor: düşük ortalama sağlık → daha yüksek risk çarpanı. */
export function calculateParentHealthFactor(mareHealth: number, stallionHealth: number, config: GeneticsConfig): number {
  const averageHealth = (mareHealth + stallionHealth) / 2;
  return 1 + ((100 - averageHealth) / 100) * config.healthRiskWeight;
}

export interface BirthHealthRiskFactors {
  parentAgeFactor: number;
  inbreedingFactor: number;
  parentHealthFactor: number;
}

/**
 * birth_health_risk = base_risk × parent_age_factor × inbreeding_factor ×
 * parent_health_factor, [0, 1] aralığına sınırlanır (docs/GENETICS.md §6).
 */
export function calculateBirthHealthRisk(factors: BirthHealthRiskFactors, config: GeneticsConfig): number {
  const risk = config.baseBirthHealthRisk * factors.parentAgeFactor * factors.inbreedingFactor * factors.parentHealthFactor;
  return clamp(risk, 0, 1);
}

/**
 * Yeni tayın soy kaydını oluşturur. Basitleştirilmiş 2-nesil şema
 * (`grandSireId`/`grandDamId` — tek bir çift) gereği bir tasarım kararı
 * alınmıştır: `grandSireId` = aygırın babası (baba hattı büyükbaba),
 * `grandDamId` = kısrağın annesi (anne hattı büyükanne) — yarış atı
 * pedigrilerinde en sık referans verilen iki büyük ebeveyn bu ikilidir.
 * `bloodline`, önce aygırın (baba hattı geleneği), yoksa kısrağın kan
 * hattını devralır.
 */
export function createFoalPedigree(
  foalHorseId: string,
  mareId: string,
  marePedigree: Pedigree | null,
  stallionId: string,
  stallionPedigree: Pedigree | null,
): Pedigree {
  return {
    horseId: foalHorseId,
    sireId: stallionId,
    damId: mareId,
    grandSireId: stallionPedigree?.sireId ?? null,
    grandDamId: marePedigree?.damId ?? null,
    bloodline: stallionPedigree?.bloodline ?? marePedigree?.bloodline ?? null,
  };
}
