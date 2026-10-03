import { Inject, Injectable } from '@nestjs/common';
import type {
  AchievementBoardView,
  AchievementClaimResult,
  ProfileAchievementView,
} from '@at-sevdalisi/shared-types';
import { loadAchievementsConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { isAchievementMetric, resolveAchievement, type ResolvedAchievement } from '../../domain/achievements/achievements';
import {
  AchievementAlreadyClaimedError,
  AchievementNotCompletedError,
  AchievementNotFoundError,
} from '../../domain/achievements/errors';
import { ACHIEVEMENT_REPOSITORY, type AchievementRepository } from '../ports/achievement.repository';

const config = loadAchievementsConfig();
/** Alım ölçütünün asgari fiyatı görevlerle AYNI (tek eşik — ucuz el değiştirme sayılmaz). */
const HORSE_PURCHASE_MIN_PRICE = loadQuestsConfig().horsePurchaseMinPrice;

/** Ölçütü bilinen tanımlar (config doğrulaması `achievements.spec.ts`te kilitli). */
const DEFINITIONS: ResolvedAchievement[] = config.achievements.filter((achievement): achievement is ResolvedAchievement =>
  isAchievementMetric(achievement.metric),
);

/**
 * BAŞARIMLAR (03.10.2026, brief §24/§68). İstemci yalnızca "hangi başarım"
 * der; hedef, ödül ve ilerleme sunucudadır ve ödeme anında KİLİT ALTINDA
 * yeniden sayılır (CLAUDE.md kural 1).
 */
@Injectable()
export class AchievementUseCase {
  constructor(@Inject(ACHIEVEMENT_REPOSITORY) private readonly repository: AchievementRepository) {}

  async board(playerId: string, now: Date = new Date()): Promise<AchievementBoardView> {
    const [progress, claimed] = await Promise.all([
      this.repository.progress(
        playerId,
        DEFINITIONS.map((definition) => definition.metric),
        HORSE_PURCHASE_MIN_PRICE,
        now,
      ),
      this.repository.claimedKeys(playerId),
    ]);
    return {
      achievements: DEFINITIONS.map((definition, index) => ({
        key: definition.key,
        metric: definition.metric,
        target: definition.target,
        progress: progress[index] ?? 0,
        rewardMoney: definition.rewardMoney,
        claimed: claimed.has(definition.key),
      })),
    };
  }

  async claim(playerId: string, rawKey: unknown, now: Date = new Date()): Promise<AchievementClaimResult> {
    const definition = resolveAchievement(rawKey, config);
    if (definition === null) throw new AchievementNotFoundError();
    const outcome = await this.repository.claim({
      playerId,
      achievementKey: definition.key,
      metric: definition.metric,
      target: definition.target,
      rewardMoney: definition.rewardMoney,
      horsePurchaseMinPrice: HORSE_PURCHASE_MIN_PRICE,
      now,
    });
    switch (outcome.kind) {
      case 'paid':
        return { rewardMoney: outcome.rewardMoney, balanceAfter: outcome.balanceAfter };
      case 'not_completed':
        throw new AchievementNotCompletedError(outcome.progress, definition.target);
      case 'already_claimed':
        throw new AchievementAlreadyClaimedError();
      case 'not_found':
        throw new AchievementNotFoundError();
    }
  }

  /**
   * Herkese açık profil: kazanılmış başarımlar. Config'ten kaldırılmış bir
   * anahtar profilde GÖSTERİLMEZ (tanımı olmayan rozet anlamsızdır) ama
   * talep satırı ve defter kaydı kalır.
   */
  async forProfile(playerId: string): Promise<ProfileAchievementView[]> {
    const byKey = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));
    const claimed = await this.repository.claimedForProfile(playerId, config.profileLimit);
    return claimed.flatMap((row) => {
      const definition = byKey.get(row.key);
      return definition
        ? [{ key: row.key, metric: definition.metric, target: definition.target, claimedAt: row.claimedAt.toISOString() }]
        : [];
    });
  }
}
