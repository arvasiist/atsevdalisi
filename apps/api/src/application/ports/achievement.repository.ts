import type { AchievementMetric, ProfileAchievementView } from '@at-sevdalisi/shared-types';

export const ACHIEVEMENT_REPOSITORY = Symbol('ACHIEVEMENT_REPOSITORY');

export interface AchievementClaimInput {
  playerId: string;
  achievementKey: string;
  metric: AchievementMetric;
  target: number;
  rewardMoney: number;
  horsePurchaseMinPrice: number;
  now: Date;
}

export type AchievementClaimOutcome =
  | { kind: 'paid'; rewardMoney: number; balanceAfter: number }
  | { kind: 'not_completed'; progress: number }
  | { kind: 'already_claimed' }
  | { kind: 'not_found' };

export interface AchievementRepository {
  /** Her ölçüt için oyuncunun yaşam boyu değeri (aynı sırayla). */
  progress(playerId: string, metrics: AchievementMetric[], horsePurchaseMinPrice: number, now: Date): Promise<number[]>;
  claimedKeys(playerId: string): Promise<Set<string>>;
  /** İlerleme KİLİT ALTINDA yeniden sayılır; para + defter + talep satırı tek transaction. */
  claim(input: AchievementClaimInput): Promise<AchievementClaimOutcome>;
  /** Herkese açık profil için kazanılmış başarımlar (anahtar + tarih), en yeni önce. */
  claimedForProfile(playerId: string, limit: number): Promise<Array<{ key: string; claimedAt: Date }>>;
}

export type { ProfileAchievementView };
