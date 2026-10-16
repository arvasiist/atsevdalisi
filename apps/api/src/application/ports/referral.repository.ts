import type { ReferralConfig } from '@at-sevdalisi/game-config';
import type { SocialPlayerFacts } from './social.repository';

export const REFERRAL_REPOSITORY = Symbol('REFERRAL_REPOSITORY');

/** Bir davet satırı + davetlinin ilerleme ham verisi (ödül koşulu bunlardan türetilir). */
export interface ReferralRowFacts {
  referralId: string;
  invitee: SocialPlayerFacts;
  joinedAt: Date;
  rewardedAt: Date | null;
  inviterReward: number | null;
  emailVerified: boolean;
  finishedRaces: number;
  inviteeDeleted: boolean;
  blockedBetween: boolean;
}

export interface ReferralOverviewFacts {
  code: string;
  accountCreatedAt: Date;
  rows: ReferralRowFacts[];
  rewardedCount: number;
  rewardedToday: number;
  invitedBy: (SocialPlayerFacts & { rewarded: boolean }) | null;
}

export interface ReferralClaimOutcome {
  claimed: number;
  amount: number;
  balanceAfter: number;
  capped: number;
}

/**
 * 16.10.2026 — davet sistemi deposu. Para yolu (`claimRewards`) tek
 * transaction: davet satırları → oyuncular (kimlik sırasıyla) `FOR UPDATE`,
 * koşul + tavan KİLİT ALTINDA yeniden denetlenir, iki tarafa defter satırı +
 * bildirim aynı transaction'da.
 */
export interface ReferralRepository {
  /** Oyuncunun kodu; yoksa `makeCode` ile üretilip yazılır (çakışmada yeniden dener). */
  getOrCreateCode(playerId: string, makeCode: () => string): Promise<string>;
  findOverview(playerId: string, config: ReferralConfig, now: Date, dayStart: Date): Promise<ReferralOverviewFacts | null>;
  /**
   * Davetliyi koda bağlar. Kuralları KİLİT ALTINDA uygular (davetli satırı
   * `FOR UPDATE`): kod var, kendisi değil, pencere açık, zaten bağlı değil,
   * aralarında engel yok. Davet edenin görünür alanlarını döner.
   */
  attach(input: { inviteeId: string; code: string; now: Date; attachWindowHours: number }): Promise<SocialPlayerFacts>;
  claimRewards(input: { inviterId: string; config: ReferralConfig; now: Date; dayStart: Date }): Promise<ReferralClaimOutcome>;
  /** Arkadaşlık kapısı istisnası: iki oyuncu arasında (herhangi yönde) davet bağı var mı. */
  areReferralPair(aId: string, bId: string): Promise<boolean>;
}
