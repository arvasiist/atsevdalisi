import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import type {
  AttachReferralResult,
  ClaimReferralRewardsResult,
  ReferralOverviewView,
  ReferralStatus,
} from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { questWindow } from '../../domain/quests/quests';
import { ReferralCodeNotFoundError } from '../../domain/social/errors';
import {
  canAttachReferral,
  normalizeReferralCode,
  qualifyReferral,
  referralCodeFromBytes,
  referralRewardAllowance,
} from '../../domain/social/referral';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { REFERRAL_REPOSITORY, type ReferralRepository } from '../ports/referral.repository';

const MS_PER_HOUR = 3_600_000;
const CALENDAR = loadQuestsConfig();

/**
 * 16.10.2026 — sosyal brief §7: davet kodu/bağlantısı, davetliyi bağlama ve
 * ödül. Kurallar saf `domain/social/referral.ts`te; para yolu depoda tek
 * transaction. Gün sınırı oyunun tek takvim saat dilimi (`quests`).
 */
@Injectable()
export class ReferralUseCase {
  constructor(
    @Inject(REFERRAL_REPOSITORY) private readonly referrals: ReferralRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async overview(playerId: string, now: Date = new Date()): Promise<ReferralOverviewView> {
    const referral = this.config.referral;
    await this.referrals.getOrCreateCode(playerId, () => this.newCode());
    const dayStart = questWindow('daily', now, CALENDAR).start;
    const facts = await this.referrals.findOverview(playerId, referral, now, dayStart);
    if (facts === null) throw new PlayerNotFoundError(playerId);

    let allowance = referralRewardAllowance(referral, facts.rewardedCount, facts.rewardedToday);
    // En eski bekleyen önce ödenir (depodaki sırayla aynı) — liste yeniden eskiye sıralı.
    const oldestFirst = [...facts.rows].reverse();
    const statusById = new Map<string, ReferralStatus>();
    for (const row of oldestFirst) {
      if (row.rewardedAt !== null) {
        statusById.set(row.referralId, 'rewarded');
        continue;
      }
      if (!qualifyReferral(row, referral.conditions).qualified) {
        statusById.set(row.referralId, 'pending');
      } else if (allowance > 0) {
        allowance -= 1;
        statusById.set(row.referralId, 'ready');
      } else {
        statusById.set(row.referralId, 'capped');
      }
    }
    const rows = facts.rows.map((row) => {
      const qualification = qualifyReferral(row, referral.conditions);
      return {
        referralId: row.referralId,
        invitee: row.invitee,
        joinedAt: row.joinedAt.toISOString(),
        status: statusById.get(row.referralId) ?? 'pending',
        emailVerified: qualification.emailVerified,
        finishedRaces: qualification.finishedRaces,
        requiredRaces: qualification.requiredRaces,
        emailRequired: qualification.emailRequired,
        rewardedAt: row.rewardedAt?.toISOString() ?? null,
        inviterReward: row.inviterReward,
      };
    });
    const canAttach = facts.invitedBy === null && canAttachReferral(facts.accountCreatedAt, now, referral.attachWindowHours);
    return {
      code: facts.code,
      rewards: { ...referral.rewards },
      conditions: { ...referral.conditions },
      maxRewardedPerInviter: referral.maxRewardedPerInviter,
      maxRewardedPerInviterPerDay: referral.maxRewardedPerInviterPerDay,
      rewardedCount: facts.rewardedCount,
      rewardedToday: facts.rewardedToday,
      claimableCount: rows.filter((row) => row.status === 'ready').length,
      referrals: rows,
      invitedBy: facts.invitedBy,
      canAttach,
      attachDeadline: canAttach
        ? new Date(facts.accountCreatedAt.getTime() + referral.attachWindowHours * MS_PER_HOUR).toISOString()
        : null,
    };
  }

  async attach(playerId: string, rawCode: unknown, now: Date = new Date()): Promise<AttachReferralResult> {
    const code = normalizeReferralCode(rawCode);
    if (code === null) throw new ReferralCodeNotFoundError();
    const inviter = await this.referrals.attach({
      inviteeId: playerId,
      code,
      now,
      attachWindowHours: this.config.referral.attachWindowHours,
    });
    return { inviter };
  }

  async claim(playerId: string, now: Date = new Date()): Promise<ClaimReferralRewardsResult> {
    return this.referrals.claimRewards({
      inviterId: playerId,
      config: this.config.referral,
      now,
      dayStart: questWindow('daily', now, CALENDAR).start,
    });
  }

  private newCode(): string {
    const length = this.config.referral.codeLength;
    return referralCodeFromBytes(randomBytes(length), length);
  }
}
