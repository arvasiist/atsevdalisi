/**
 * BAŞARIMLAR (03.10.2026, brief §24 "Achievements", §68).
 *
 * Görevlerle AYNI ilke: ilerleme SAYILMAZ, TÜRETİLİR (yaşam boyu pencere).
 * Ölçütler bilinçli olarak yalnızca OYUNCUYA BAĞLANABİLEN olgulardır:
 * yarış (koşturan oyuncu, migration 0063), alım (defter) ve seviye.
 * Antrenman/bakım bugün ATA bağlıdır (oyuncu sütunu yok) — at satın alarak
 * başkasının antrenmanıyla başarım açılmasın diye listede YOKTUR.
 */
export const ACHIEVEMENT_METRICS = [
  'races_entered',
  'race_wins',
  'top3_finishes',
  'horse_purchases',
  'player_level',
] as const;

export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export interface AchievementView {
  key: string;
  metric: AchievementMetric;
  target: number;
  /** Yaşam boyu değer (hedefi aşabilir; istemci kırpar). */
  progress: number;
  rewardMoney: number;
  claimed: boolean;
}

export interface AchievementBoardView {
  achievements: AchievementView[];
}

export interface AchievementClaimResult {
  rewardMoney: number;
  balanceAfter: number;
}

/** Herkese açık profilde görünen KAZANILMIŞ (ödülü alınmış) başarım. */
export interface ProfileAchievementView {
  key: string;
  metric: AchievementMetric;
  target: number;
  claimedAt: string;
}
