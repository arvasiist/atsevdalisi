/**
 * ATIN KİŞİLİĞİ (08.10.2026) — `horse_stats`ın altı gizli özelliği
 * (migration 0003) için saf kurallar. Önceden yalnızca `temperament` motora
 * bağlıydı (`domain/race/temperament.ts`); diğer beşi YALNIZCA kalıtımla
 * taşınıyor, hiçbir şeyi değiştirmiyordu ve her başlangıç atı 50'de
 * doğuyordu.
 *
 * Üç iş:
 *   (1) DOĞUŞ — yeni at (başlangıç atı + ırk mağazası) `birth.traits`taki
 *       özellikleri `neutral ± spread` içinde, AT KİMLİĞİNDEN determinist
 *       alır (`Math.random` YOK). `temperament` listede YOK: motora girer,
 *       doğuşta nötr kalır (denge raporu onu nötr dağılımla ölçtü).
 *   (2) ETKİ — yalnızca MOTOR DIŞI yol (antrenman): odak → kazanç, stres
 *       dayanımı → yorgunluk, itaat → sakatlık olasılığı, rekabetçilik →
 *       yoğunluğa göre kazanç (yoğunda artı, hafifte eksi — ve tersi).
 *       `neutral` değer TAM no-op'tur (eski atlar ve SQL fikstürleri değişmez).
 *   (3) ETİKET — `describePersonality` sayılardan türetir; istemci yalnızca
 *       (özellik, uç) çiftini görür, sayıyı değil. `courage` bugün yalnızca
 *       etikettedir (motordaki geçiş cesareti risk seviyesinden gelir).
 */

import type { HorsePersonalityConfig } from '@at-sevdalisi/game-config';
import {
  clamp,
  createSeededRandom,
  type HiddenHorseTraitKey,
  type HorsePersonalityView,
  type TrainingIntensity,
} from '@at-sevdalisi/shared-types';

export const PERSONALITY_TRAIT_KEYS: readonly HiddenHorseTraitKey[] = [
  'temperament',
  'focus',
  'courage',
  'competitiveness',
  'stressResistance',
  'obedience',
];

/** `horse_stats` sütun adları — kapalı küme, kullanıcı girdisi DEĞİL. */
export const PERSONALITY_TRAIT_COLUMNS: Readonly<Record<HiddenHorseTraitKey, string>> = {
  temperament: 'temperament',
  focus: 'focus',
  courage: 'courage',
  competitiveness: 'competitiveness',
  stressResistance: 'stress_resistance',
  obedience: 'obedience',
};

export type PersonalityTraits = Record<HiddenHorseTraitKey, number>;

const TRAIT_MIN = 0;
const TRAIT_MAX = 100;

/** Yeni atın doğuş kişiliği: yalnızca `birth.traits`, tam sayı, at kimliğinden determinist. */
export function deriveBirthPersonality(
  horseId: string,
  config: HorsePersonalityConfig,
): Partial<PersonalityTraits> {
  const rng = createSeededRandom(`${horseId}:personality`);
  const result: Partial<PersonalityTraits> = {};
  for (const trait of PERSONALITY_TRAIT_KEYS) {
    // Sıra sabit: listede olmayan özellik de bir zar tüketir, böylece birth
    // listesine özellik eklemek diğerlerinin değerini kaydırmaz.
    const roll = rng();
    if (!config.birth.traits.includes(trait)) continue;
    const value = config.neutral + (roll * 2 - 1) * config.birth.spread;
    result[trait] = clamp(Math.round(value), TRAIT_MIN, TRAIT_MAX);
  }
  return result;
}

export interface PersonalityTrainingEffects {
  /** Stat kazancına çarpan (odak × rekabetçilik/yoğunluk). */
  gainMultiplier: number;
  /** POZİTİF yorgunluk artışına çarpan (dinlenmenin azaltmasına uygulanmaz). */
  fatigueMultiplier: number;
  /** Sakatlık olasılığına çarpan. */
  injuryRiskMultiplier: number;
}

function deviation(traits: Partial<PersonalityTraits>, trait: HiddenHorseTraitKey, neutral: number): number {
  const value = traits[trait];
  return value === undefined || !Number.isFinite(value) ? 0 : value - neutral;
}

function multiplier(perPoint: number, delta: number): number {
  // Taban 0: config ne kadar sert olursa olsun çarpan eksiye düşmez.
  return Math.max(0, 1 + perPoint * delta);
}

export function computePersonalityTrainingEffects(
  traits: Partial<PersonalityTraits>,
  intensity: TrainingIntensity,
  config: HorsePersonalityConfig,
): PersonalityTrainingEffects {
  const { effects, neutral } = config;
  const focus = multiplier(effects.focusTrainingGainPerPoint, deviation(traits, 'focus', neutral));
  const drive = multiplier(
    effects.competitivenessIntensityGainPerPoint[intensity] ?? 0,
    deviation(traits, 'competitiveness', neutral),
  );
  return {
    gainMultiplier: focus * drive,
    fatigueMultiplier: multiplier(
      effects.stressResistanceFatiguePerPoint,
      deviation(traits, 'stressResistance', neutral),
    ),
    injuryRiskMultiplier: multiplier(effects.obedienceInjuryRiskPerPoint, deviation(traits, 'obedience', neutral)),
  };
}

/**
 * Etiket: eşiği aşan özellikler, nötrden uzaklığa göre (eşitlikte sabit
 * özellik sırası) en fazla `maxLabels` tane. Hiçbiri yoksa boş = "Dengeli".
 */
export function describePersonality(
  traits: Partial<PersonalityTraits>,
  config: HorsePersonalityConfig,
): HorsePersonalityView {
  const { highThreshold, lowThreshold, maxLabels } = config.labels;
  interface Marked {
    trait: HiddenHorseTraitKey;
    pole: 'high' | 'low';
    distance: number;
    order: number;
  }
  const marked: Marked[] = [];
  PERSONALITY_TRAIT_KEYS.forEach((trait, order) => {
    const value = traits[trait];
    if (value === undefined || !Number.isFinite(value)) return;
    if (value >= highThreshold) marked.push({ trait, pole: 'high', distance: value - config.neutral, order });
    else if (value <= lowThreshold) marked.push({ trait, pole: 'low', distance: config.neutral - value, order });
  });
  marked.sort((a, b) => b.distance - a.distance || a.order - b.order);
  return { traits: marked.slice(0, maxLabels).map(({ trait, pole }) => ({ trait, pole })) };
}

/** API açılışında ve testte: bozuk config ile kişilik sessizce bozulmasın. */
export function validateHorsePersonalityConfig(config: HorsePersonalityConfig): string[] {
  const problems: string[] = [];
  const { neutral, birth, labels, effects } = config;
  if (!(neutral > TRAIT_MIN && neutral < TRAIT_MAX)) problems.push('neutral 0-100 arasında olmalı.');
  if (!(birth.spread >= 0 && neutral - birth.spread >= TRAIT_MIN && neutral + birth.spread <= TRAIT_MAX)) {
    problems.push('birth.spread nötrden 0-100 dışına taşmamalı.');
  }
  for (const trait of birth.traits) {
    if (!PERSONALITY_TRAIT_KEYS.includes(trait)) problems.push(`birth.traits bilinmeyen özellik: "${trait}".`);
  }
  if (birth.traits.includes('temperament')) {
    problems.push('temperament doğuşta çeşitlenmez (motora girer; denge ölçümü nötr dağılımla yapıldı).');
  }
  if (!(labels.lowThreshold < neutral && neutral < labels.highThreshold)) {
    problems.push('labels: lowThreshold < neutral < highThreshold olmalı.');
  }
  if (!(Number.isInteger(labels.maxLabels) && labels.maxLabels >= 1)) problems.push('labels.maxLabels ≥ 1 tam sayı olmalı.');
  for (const trait of PERSONALITY_TRAIT_KEYS) {
    const text = labels.traits[trait];
    if (!text?.high?.label || !text?.low?.label) problems.push(`labels.traits.${trait} high/low etiketi eksik.`);
  }
  // En uç değerde bile çarpan pozitif kalmalı (aksi hâlde taban 0'a yaslanır).
  const extremes: Array<[string, number]> = [
    ['focusTrainingGainPerPoint', effects.focusTrainingGainPerPoint],
    ['stressResistanceFatiguePerPoint', effects.stressResistanceFatiguePerPoint],
    ['obedienceInjuryRiskPerPoint', effects.obedienceInjuryRiskPerPoint],
    ...Object.entries(effects.competitivenessIntensityGainPerPoint).map(
      ([intensity, value]) => [`competitivenessIntensityGainPerPoint.${intensity}`, value] as [string, number],
    ),
  ];
  const maxDeviation = Math.max(neutral - TRAIT_MIN, TRAIT_MAX - neutral);
  for (const [name, perPoint] of extremes) {
    if (!Number.isFinite(perPoint) || Math.abs(perPoint) * maxDeviation >= 1) {
      problems.push(`effects.${name} uç değerde çarpanı sıfıra/eksiye düşürüyor.`);
    }
  }
  return problems;
}
