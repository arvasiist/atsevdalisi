/**
 * ATIN DURUMU → 3D DAVRANIŞ (01.10.2026). Saf fonksiyon; DOM/three yok.
 *
 * Veritabanındaki gerçek değerler (enerji, yorgunluk, moral, sağlık, durum)
 * bir "ruh hâline" çevrilir; ruh hâli `config/horse-presence.config.json`
 * içindeki animasyon parametrelerini seçer. Öncelik sırası en ciddi olandan
 * başlar: sakat > hasta > yorgun > durgun (düşük moral) > enerjik > nötr.
 *
 * Bilinçli eksik: brief'in "STRESS HIGH → huzursuz" maddesi için oyunda bir
 * stres değeri YOK; uydurulmadı. Böyle bir alan eklenirse buraya bir ruh
 * hâli olarak girer.
 */

import type { HorsePresenceConfig, HorsePresenceMoodParams } from '@at-sevdalisi/game-config';
import type { Horse } from '@at-sevdalisi/shared-types';

export type HorseMood = keyof HorsePresenceConfig['moods'];

export interface HorseDemeanor extends HorsePresenceMoodParams {
  mood: HorseMood;
}

export type HorseVitalsForDemeanor = Pick<
  Horse,
  'health' | 'energy' | 'fatigue' | 'morale' | 'status'
>;

export function deriveHorseMood(
  horse: HorseVitalsForDemeanor,
  config: HorsePresenceConfig,
): HorseMood {
  const t = config.thresholds;
  if (horse.status === 'injured') return 'injured';
  if (horse.health < t.lowHealth) return 'unwell';
  if (horse.energy < t.lowEnergy || horse.fatigue > t.highFatigue) return 'tired';
  if (horse.morale < t.lowMorale) return 'calm';
  if (horse.energy >= t.highEnergy && horse.morale >= t.highMorale) return 'energetic';
  return 'neutral';
}

export function deriveHorseDemeanor(
  horse: HorseVitalsForDemeanor,
  config: HorsePresenceConfig,
): HorseDemeanor {
  const mood = deriveHorseMood(horse, config);
  return { mood, ...config.moods[mood] };
}

/** Ekranda gösterilecek kısa açıklama. */
export const HORSE_MOOD_LABELS: Record<HorseMood, string> = {
  energetic: 'Enerjik',
  neutral: 'Sakin ve dengeli',
  calm: 'Durgun',
  tired: 'Yorgun',
  unwell: 'Keyifsiz',
  injured: 'Sakat',
};
