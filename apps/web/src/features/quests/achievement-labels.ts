/**
 * BAŞARIM METİNLERİ (03.10.2026) — saf veri. Hedef ve ödül sunucudan gelir;
 * ad ölçüt + hedeften üretilir (config'e başlık eklemek, sunucu ile istemcinin
 * ayrı kopyalarını doğururdu).
 */
import type { AchievementMetric } from '@at-sevdalisi/shared-types';

const FIRST_TITLES: Partial<Record<AchievementMetric, string>> = {
  races_entered: 'İlk yarış',
  race_wins: 'İlk zafer',
  top3_finishes: 'İlk kürsü',
  horse_purchases: 'İlk at alımı',
};

const COUNT_TITLES: Record<AchievementMetric, (target: number) => string> = {
  races_entered: (n) => `${n} yarış`,
  race_wins: (n) => `${n} zafer`,
  top3_finishes: (n) => `${n} kez ilk üç`,
  horse_purchases: (n) => `${n} at alımı`,
  player_level: (n) => `Seviye ${n}`,
};

export function achievementTitle(metric: AchievementMetric, target: number): string {
  if (target === 1) {
    const first = FIRST_TITLES[metric];
    if (first) return first;
  }
  return COUNT_TITLES[metric](target);
}

/** "3/25" — ilerleme hedefi aşsa da hedefte kırpılır. */
export function achievementProgressText(progress: number, target: number): string {
  return `${Math.min(progress, target)}/${target}`;
}
