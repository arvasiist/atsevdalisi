import { describe, expect, it } from 'vitest';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import type { FriendGiftBoardView } from '@at-sevdalisi/shared-types';
import {
  canCollect,
  canSendToAll,
  collectHint,
  describeCollect,
  describeSendAll,
  friendMilestones,
  friendsLeftToGift,
  nextFriendMilestone,
  nextSendCost,
  sendAllHint,
} from '../../../src/features/social/friend-gift';

const friend = (n: number) => ({ playerId: `p${n}`, username: `u${n}`, displayName: `Dost ${n}` });

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
    sendCost: 2,
    dailySendBudget: 20,
    spentToday: 0,
    remainingSendBudget: 20,
    nextRecipients: [friend(1), friend(2), friend(3)],
    unsentEligibleCount: 3,
    limitedBy: 'none',
    ...overrides,
  };
}

describe('dostluk hediyesi paneli', () => {
  it('gönderim (gönderen öder): maliyet ve alıcılar sunucunun önizlemesinden; gidecek kimse yoksa düğme kapalı', () => {
    expect(canSendToAll(board())).toBe(true);
    expect(nextSendCost(board())).toBe(6);
    expect(sendAllHint(board())).toContain('toplam 6 çip senden düşer');
    expect(friendsLeftToGift(board({ unsentEligibleCount: 2 }))).toBe(2);
    const done = board({ sentToday: 3, unsentEligibleCount: 0, nextRecipients: [] });
    expect(canSendToAll(done)).toBe(false);
    expect(sendAllHint(done)).toContain('yarın');
    expect(canSendToAll(board({ friendCount: 0, nextRecipients: [], unsentEligibleCount: 0 }))).toBe(false);
    const broke = board({ nextRecipients: [], limitedBy: 'funds' });
    expect(canSendToAll(broke)).toBe(false);
    expect(sendAllHint(broke)).toContain('bakiyen yetmiyor');
    const spent = board({ nextRecipients: [], limitedBy: 'budget', spentToday: 20, remainingSendBudget: 0 });
    expect(sendAllHint(spent)).toContain('bütçeni');
    // Bütçe 1 kişiye yetiyor: kalanların atlanacağı önceden söylenir.
    expect(sendAllHint(board({ nextRecipients: [friend(1)], limitedBy: 'budget' }))).toContain('2 arkadaşın bütçe');
  });

  it('toplama: bekleyen yoksa ya da günlük sınır dolduysa düğme kapalı', () => {
    expect(canCollect(board())).toBe(false);
    expect(canCollect(board({ pendingCount: 2, pendingAmount: 20 }))).toBe(true);
    expect(canCollect(board({ pendingCount: 2, remainingCollectsToday: 0 }))).toBe(false);
    expect(collectHint(board({ pendingCount: 25, remainingCollectsToday: 20 }))).toContain('20 tanesini');
    expect(collectHint(board({ pendingCount: 5, remainingCollectsToday: 0 }))).toContain('yarın');
  });

  it('sonuç metinleri: kişi başı sonuç, maliyet, atlananlar ve iade', () => {
    const base = { cost: 0, refunded: 0, balanceAfter: 100, recipients: [] as never[] };
    expect(
      describeSendAll({
        ...base,
        sent: 2,
        alreadySentToday: 0,
        cost: 4,
        recipients: [
          { ...friend(1), status: 'sent' },
          { ...friend(2), status: 'sent' },
          { ...friend(3), status: 'budget_exhausted' },
        ],
      }),
    ).toMatch(/2 arkadaşına.*−4 çip.*1 arkadaş atlandı \(günlük bütçe doldu\)/);
    expect(describeSendAll({ ...base, sent: 0, alreadySentToday: 2 })).toContain('zaten');
    expect(
      describeSendAll({ ...base, sent: 0, alreadySentToday: 0, recipients: [{ ...friend(1), status: 'insufficient_funds' }] }),
    ).toContain('bakiye yetmedi');
    expect(describeSendAll({ ...base, sent: 0, alreadySentToday: 1, refunded: 4 })).toContain('4 çip iade');
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

describe('arkadaş başarımları — kazanılmış / alınmış ayrımı (brief §6.5)', () => {
  it('sunucu panosundan durum: alındı, alınabilir, kilitli', () => {
    const view = (target: number, progress: number, claimed: boolean) => ({
      key: `friends-${target}`,
      metric: 'friend_count' as const,
      target,
      progress,
      rewardMoney: 100,
      claimed,
    });
    const states = friendMilestones([view(10, 7, false), view(5, 7, true), view(15, 7, false)]);
    expect(states.map((milestone) => [milestone.target, milestone.state])).toEqual([
      [5, 'claimed'],
      [10, 'locked'],
      [15, 'locked'],
    ]);
    expect(friendMilestones([view(5, 5, false)])[0]!.state).toBe('claimable');
  });
});
