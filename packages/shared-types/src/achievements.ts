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
  /** 08.10.2026 — kabul edilmiş arkadaş sayısı (ANLIK değer, oyuncu satırı gibi). */
  'friend_count',
  /** 16.10.2026 (brief §10) — yaşam boyu kariyer puanı (kademe ödülleri). */
  'career_points',
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
