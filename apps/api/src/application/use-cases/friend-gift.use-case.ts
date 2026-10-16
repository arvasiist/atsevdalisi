import { Inject, Injectable } from '@nestjs/common';
import type {
  FriendGiftBoardView,
  FriendGiftCollectResult,
  FriendGiftRecipientStatus,
  FriendGiftSendAllResult,
} from '@at-sevdalisi/shared-types';
import { loadGiftConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PlayerNotFoundError } from '../../domain/player/errors';
import {
  friendGiftDay,
  friendGiftDayStart,
  friendGiftExpiryCutoff,
  planFriendGiftSend,
  remainingCollects,
} from '../../domain/social/friend-gift';
import {
  FRIEND_GIFT_REPOSITORY,
  type FriendGiftBoardFacts,
  type FriendGiftRepository,
} from '../ports/friend-gift.repository';

const config = loadGiftConfig().friendGift;
/** Oyunun TEK takvim saat dilimi (görevler, haftalık sıralama ile aynı). */
const TIMEZONE_OFFSET_MINUTES = loadQuestsConfig().timezoneOffsetMinutes;

/**
 * DOSTLUK HEDİYESİ (08.10.2026). İstemci yalnızca "hepsine gönder" ve
 * "topla" der; tutar, günlük sınır ve son kullanma config'ten okunur.
 */
@Injectable()
export class FriendGiftUseCase {
  constructor(@Inject(FRIEND_GIFT_REPOSITORY) private readonly repository: FriendGiftRepository) {}

  async board(playerId: string, now: Date = new Date()): Promise<FriendGiftBoardView> {
    const facts = await this.repository.board({
      playerId,
      dayKey: friendGiftDay(now, TIMEZONE_OFFSET_MINUTES),
      dayStart: friendGiftDayStart(now, TIMEZONE_OFFSET_MINUTES),
      expiryCutoff: friendGiftExpiryCutoff(now, config.expiryDays),
      pendingLimit: config.pendingListLimit,
    });
    return {
      amount: config.amount,
      dailyCollectLimit: config.dailyCollectLimit,
      collectedToday: facts.collectedToday,
      remainingCollectsToday: remainingCollects(facts.collectedToday, config.dailyCollectLimit),
      pendingCount: facts.pendingCount,
      pendingAmount: facts.pendingAmount,
      pending: facts.pending.map((gift) => ({
        giftId: gift.giftId,
        sender: { playerId: gift.senderId, username: gift.senderUsername, displayName: gift.senderDisplayName },
        amount: gift.amount,
        createdAt: gift.createdAt.toISOString(),
      })),
      friendCount: facts.friendCount,
      sentToday: facts.sentToday,
      ...this.sendPreview(facts),
    };
  }

  /** Önizleme gönderimle AYNI kuralı (`planFriendGiftSend`) ve sırayı kullanır. */
  private sendPreview(facts: FriendGiftBoardFacts) {
    const plan = planFriendGiftSend({
      amount: config.amount,
      dailySendBudget: config.dailySendBudget,
      spentToday: facts.spentToday,
      balance: facts.balance,
      candidates: facts.unsent.length,
    });
    return {
      sendCost: config.amount,
      dailySendBudget: config.dailySendBudget,
      spentToday: facts.spentToday,
      remainingSendBudget: plan.remainingBudget,
      nextRecipients: facts.unsent.slice(0, plan.maxRecipients),
      unsentEligibleCount: facts.unsent.length,
      limitedBy: plan.limitedBy,
    };
  }

  async sendAll(playerId: string, now: Date = new Date()): Promise<FriendGiftSendAllResult> {
    const outcome = await this.repository.sendToAllFriends({
      senderId: playerId,
      dayKey: friendGiftDay(now, TIMEZONE_OFFSET_MINUTES),
      amount: config.amount,
      dailySendBudget: config.dailySendBudget,
      expiryCutoff: friendGiftExpiryCutoff(now, config.expiryDays),
      now,
    });
    if (outcome.kind === 'not_found') throw new PlayerNotFoundError(playerId);
    const skippedStatus: FriendGiftRecipientStatus =
      outcome.limitedBy === 'funds' ? 'insufficient_funds' : 'budget_exhausted';
    return {
      sent: outcome.sent.length,
      alreadySentToday: outcome.alreadySent.length,
      cost: outcome.cost,
      refunded: outcome.refunded,
      balanceAfter: outcome.balanceAfter,
      recipients: [
        ...outcome.sent.map((friend) => ({ ...friend, status: 'sent' as const })),
        ...outcome.alreadySent.map((friend) => ({ ...friend, status: 'already_sent' as const })),
        ...outcome.skipped.map((friend) => ({ ...friend, status: skippedStatus })),
      ],
    };
  }

  async collect(playerId: string, now: Date = new Date()): Promise<FriendGiftCollectResult> {
    const outcome = await this.repository.collect({
      playerId,
      dayStart: friendGiftDayStart(now, TIMEZONE_OFFSET_MINUTES),
      expiryCutoff: friendGiftExpiryCutoff(now, config.expiryDays),
      dailyCollectLimit: config.dailyCollectLimit,
      now,
    });
    if (outcome.kind === 'not_found') throw new PlayerNotFoundError(playerId);
    return {
      collected: outcome.collected,
      amount: outcome.amount,
      balanceAfter: outcome.balanceAfter,
      remainingCollectsToday: outcome.remainingCollectsToday,
      stillPending: outcome.stillPending,
    };
  }
}
