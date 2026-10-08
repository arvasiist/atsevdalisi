import { describe, expect, it } from 'vitest';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import type { FriendGiftBoardView } from '@at-sevdalisi/shared-types';
import {
  canCollect,
  canSendToAll,
  collectHint,
  describeCollect,
  describeSendAll,
  friendsLeftToGift,
  nextFriendMilestone,
  sendAllHint,
} from '../../../src/features/social/friend-gift';

/** 08.10.2026 — dostluk hediyesi panelinin saf metin/durum mantığı. */
function board(overrides: Partial<FriendGiftBoardView> = {}): FriendGiftBoardView {
  return {
    amount: 10,
    dailyCollectLimit: 20,
    collectedToday: 0,
    remainingCollectsToday: 20,
    pendingCount: 0,
    pendingAmount: 0,
    pending: [],
    friendCount: 3,
    sentToday: 0,
    ...overrides,
  };
}

describe('dostluk hediyesi paneli', () => {
  it('gönderim: arkadaş yoksa ya da bugün hepsine gönderildiyse düğme kapalı', () => {
    expect(canSendToAll(board())).toBe(true);
    expect(friendsLeftToGift(board({ sentToday: 1 }))).toBe(2);
    expect(canSendToAll(board({ sentToday: 3 }))).toBe(false);
    expect(canSendToAll(board({ friendCount: 0 }))).toBe(false);
    expect(sendAllHint(board())).toContain("10'ar çip");
    expect(sendAllHint(board({ sentToday: 3 }))).toContain('yarın');
  });

  it('toplama: bekleyen yoksa ya da günlük sınır dolduysa düğme kapalı', () => {
    expect(canCollect(board())).toBe(false);
    expect(canCollect(board({ pendingCount: 2, pendingAmount: 20 }))).toBe(true);
    expect(canCollect(board({ pendingCount: 2, remainingCollectsToday: 0 }))).toBe(false);
    expect(collectHint(board({ pendingCount: 25, remainingCollectsToday: 20 }))).toContain('20 tanesini');
    expect(collectHint(board({ pendingCount: 5, remainingCollectsToday: 0 }))).toContain('yarın');
  });

  it('sonuç metinleri', () => {
    expect(describeSendAll({ sent: 2, alreadySentToday: 0 })).toContain('2 arkadaşına');
    expect(describeSendAll({ sent: 0, alreadySentToday: 2 })).toContain('zaten');
    expect(
      describeCollect({ collected: 3, amount: 30, balanceAfter: 130, remainingCollectsToday: 17, stillPending: 0 }),
    ).toContain('+30 çip');
    expect(
      describeCollect({ collected: 0, amount: 0, balanceAfter: 100, remainingCollectsToday: 0, stillPending: 4 }),
    ).toContain('yarın');
  });

  it('sıradaki arkadaş başarımı config\'ten: her 5 arkadaşa 100 çip', () => {
    const achievements = loadAchievementsConfig().achievements;
    expect(nextFriendMilestone(0, achievements)).toEqual({ target: 5, rewardMoney: 100 });
    expect(nextFriendMilestone(5, achievements)).toEqual({ target: 10, rewardMoney: 100 });
    const friendTargets = achievements.filter((item) => item.metric === 'friend_count').map((item) => item.target);
    expect(friendTargets.every((target) => target % 5 === 0)).toBe(true);
    expect(nextFriendMilestone(Math.max(...friendTargets), achievements)).toBeNull();
  });
});
