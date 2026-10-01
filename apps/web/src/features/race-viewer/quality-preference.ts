/**
 * KALİTE TERCİHİ (01.10.2026, 3D adım 10) — saf mantık.
 *
 * Oyuncu "Otomatik" ya da sabit bir kademe seçer. Otomatikte kademe cihaz
 * algılamasından (`detectQualityTier`) başlar ve kare hızı düştükçe çalışma
 * anında en fazla `maxAutoDowngrades` kez bir alt kademeye iner. Sabit
 * seçimde otomatik düşürme YOKTUR — oyuncunun seçimi ezilmez.
 */

import type { QualityTier } from './quality-tier';

export type QualityPreference = 'auto' | QualityTier;

export const QUALITY_TIERS_ASCENDING: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export const QUALITY_PREFERENCE_LABELS: Record<QualityPreference, string> = {
  auto: 'Otomatik',
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  ultra: 'Ultra',
};

export function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || QUALITY_TIERS_ASCENDING.includes(value as QualityTier);
}

export function resolveQualityTier(
  preference: QualityPreference,
  detected: QualityTier,
  autoDowngrades: number,
  maxAutoDowngrades: number,
): QualityTier {
  if (preference !== 'auto') return preference;
  const steps = Math.max(0, Math.min(autoDowngrades, maxAutoDowngrades));
  const index = QUALITY_TIERS_ASCENDING.indexOf(detected);
  return QUALITY_TIERS_ASCENDING[Math.max(0, index - steps)]!;
}
