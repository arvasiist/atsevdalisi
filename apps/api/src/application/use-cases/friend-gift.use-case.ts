import { Inject, Injectable } from '@nestjs/common';
import type {
  FriendGiftBoardView,
  FriendGiftCollectResult,
  FriendGiftSendAllResult,
} from '@at-sevdalisi/shared-types';
import { loadGiftConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PlayerNotFoundError } from '../../domain/player/errors';
import {
  friendGiftDay,
  friendGiftDayStart,
  friendGiftExpiryCutoff,
  remainingCollects,
} from '../../domain/social/friend-gift';
import { FRIEND_GIFT_REPOSITORY, type FriendGiftRepository } from '../ports/friend-gift.repository';

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
    };
  }

  async sendAll(playerId: string, now: Date = new Date()): Promise<FriendGiftSendAllResult> {
    return this.repository.sendToAllFriends({
      senderId: playerId,
      dayKey: friendGiftDay(now, TIMEZONE_OFFSET_MINUTES),
      amount: config.amount,
      now,
    });
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
