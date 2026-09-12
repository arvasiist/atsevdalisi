/**
 * Jokey (Jockey) — brief §13, docs/ALGORITHMS.md §12 (jokey-at uyumu).
 *
 * Bu modül iki şeyi üretir:
 *  1. `calculateJockeySkillComposite` — jockeys tablosundaki tekil yetenek
 *     alanlarını (startSkill/tacticalSkill/...) tek bir 0-100 puana indirger.
 *     Bu puan, `domain/race/base-ability.ts`'in zaten beklediği
 *     `RaceEntrantSnapshot.jockeySkillComposite` alanını besler (FAZ 1'de
 *     bu alan var olan ama henüz hiçbir üreticisi olmayan bir girdiydi —
 *     race-engine'e gerçek bağlama FAZ 5/wiring aşamasına bırakılmıştır,
 *     burada sadece hesaplama fonksiyonu sağlanır).
 *  2. `calculateJockeyHorseCompatibility` — bir at-jokey ikilisinin
 *     uyumluluğu (brief §13).
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { JockeyConfig } from '@at-sevdalisi/game-config';
import type { Jockey, RacingStyle } from '@at-sevdalisi/shared-types';
import { JockeyAlreadyOwnedError } from './errors';

/** docs/ALGORITHMS.md §12 girdisi olan at tarafı özellikler (gizli statlar dahil). */
export interface JockeyCompatibilityHorseInput {
  /** horse.temperament, 0-100 (gizli stat, brief §8.2) — yüksek = daha "ateşli"/zor idare edilen at. */
  temperament: number;
  racingStyle: RacingStyle;
}

export interface JockeyCompatibilityInput {
  horse: JockeyCompatibilityHorseInput;
  jockey: Pick<Jockey, 'horseControl' | 'tacticalSkill' | 'sprintSkill' | 'trackKnowledge' | 'experience'>;
  /**
   * Bu at-jokey ikilisinin geçmiş yarışlarındaki ortalama performance_score
   * (0-100). Hiç ortak geçmişleri yoksa `null` — `config.neutralHistoryScore`
   * kullanılır (docs/ALGORITHMS.md §12 previous_pair_history_component).
   */
  previousPairAveragePerformance: number | null;
}

/**
 * `skillCompositeWeights` ile ağırlıklı toplam — `RaceEntrantSnapshot.
 * jockeySkillComposite` için (bkz. dosya başı açıklaması).
 */
export function calculateJockeySkillComposite(
  jockey: Pick<
    Jockey,
    'startSkill' | 'tacticalSkill' | 'sprintSkill' | 'horseControl' | 'riskManagement' | 'trackKnowledge'
  >,
  config: JockeyConfig,
): number {
  const w = config.skillCompositeWeights;
  return (
    jockey.startSkill * w.startSkill +
    jockey.tacticalSkill * w.tacticalSkill +
    jockey.sprintSkill * w.sprintSkill +
    jockey.horseControl * w.horseControl +
    jockey.riskManagement * w.riskManagement +
    jockey.trackKnowledge * w.trackKnowledge
  );
}

/**
 * horse_temperament_component: atın "sakinliği" (100 - temperament) ile
 * jokeyin horseControl becerisinin ortalaması — ne kadar ateşli bir atsa,
 * o kadar yüksek horseControl gerektirir; sakin bir at her jokeyle daha
 * kolay uyum sağlar.
 */
function calculateTemperamentComponent(horse: JockeyCompatibilityHorseInput, jockey: JockeyCompatibilityInput['jockey']): number {
  const calmness = 100 - horse.temperament;
  return clamp((calmness + jockey.horseControl) / 2, 0, 100);
}

/**
 * jockey_style_component: atın tercih ettiği yarış tarzına (bkz.
 * `domain/race/pace.ts` `RacingStyle`) en çok katkı sağlayan jokey
 * becerisi kullanılır — front_runner: pist bilgisi (erken pozisyon almak
 * için), closer: sprint becerisi (son düzlük atağı), tracker/mid_pack:
 * taktik becerisi (dengeli konumlanma).
 */
function calculateStyleComponent(horse: JockeyCompatibilityHorseInput, jockey: JockeyCompatibilityInput['jockey']): number {
  switch (horse.racingStyle) {
    case 'front_runner':
      return jockey.trackKnowledge;
    case 'closer':
      return jockey.sprintSkill;
    default:
      return jockey.tacticalSkill;
  }
}

function calculateExperienceComponent(jockey: JockeyCompatibilityInput['jockey'], config: JockeyConfig): number {
  return clamp((jockey.experience / config.experienceForMaxScore) * 100, 0, 100);
}

/**
 * compatibility = horse_temperament_component + jockey_style_component +
 * experience_component + previous_pair_history_component
 * (docs/ALGORITHMS.md §12) — burada `compatibilityWeights` ile ağırlıklı
 * toplam olarak uygulanır (toplamı 1.0), sonuç 0-100 ölçeğindedir.
 */
export function calculateJockeyHorseCompatibility(input: JockeyCompatibilityInput, config: JockeyConfig): number {
  const w = config.compatibilityWeights;

  const temperamentComponent = calculateTemperamentComponent(input.horse, input.jockey);
  const styleComponent = calculateStyleComponent(input.horse, input.jockey);
  const experienceComponent = calculateExperienceComponent(input.jockey, config);
  const historyComponent = input.previousPairAveragePerformance ?? config.neutralHistoryScore;

  return clamp(
    temperamentComponent * w.temperament +
      styleComponent * w.style +
      experienceComponent * w.experience +
      historyComponent * w.history,
    0,
    100,
  );
}

/** Jokey zaten bir oyuncuya aitse (`ownerId !== null`) kiralanamaz. */
export function assertJockeyAvailableForHire(jockey: Pick<Jockey, 'id' | 'ownerId'>): void {
  if (jockey.ownerId !== null) {
    throw new JockeyAlreadyOwnedError(jockey.id);
  }
}

/** Bir jokeyi kiralar (brief §13) — sadece `ownerId`'yi atar, saf bir dönüşümdür. */
export function hireJockey(jockey: Jockey, ownerId: string, now: Date = new Date()): Jockey {
  assertJockeyAvailableForHire(jockey);
  return { ...jockey, ownerId, updatedAt: now.toISOString() };
}
