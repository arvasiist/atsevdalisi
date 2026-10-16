/**
 * DOSTLUK HEDİYESİ (08.10.2026) — saf ekran mantığı. Kural sunucudadır
 * (tutar, günlük sınır, son kullanma); burası yalnızca metin ve düğme durumu.
 */
import type {
  FriendGiftBoardView,
  FriendGiftCollectResult,
  FriendGiftSendAllResult,
  AchievementView,
} from '@at-sevdalisi/shared-types';
import type { AchievementDefinitionConfig } from '@at-sevdalisi/game-config';

/** Bugün hediye gönderilmemiş arkadaş sayısı. */
export function friendsLeftToGift(board: FriendGiftBoardView): number {
  return board.unsentEligibleCount;
}

/** 16.10.2026 — gönderen öder: önizlemede alıcı varsa (bütçe + bakiye yetiyorsa) gönderilebilir. */
export function canSendToAll(board: FriendGiftBoardView): boolean {
  return board.nextRecipients.length > 0;
}

/** Şimdi basılırsa düşecek çip (sunucunun önizlemesinden; istemci tutar belirlemez). */
export function nextSendCost(board: FriendGiftBoardView): number {
  return board.nextRecipients.length * board.sendCost;
}

export function canCollect(board: FriendGiftBoardView): boolean {
  return board.pendingCount > 0 && board.remainingCollectsToday > 0;
}

export function sendAllHint(board: FriendGiftBoardView): string {
  if (board.friendCount === 0) return 'Henüz hediye gönderebileceğin bir arkadaşın yok.';
  if (board.unsentEligibleCount === 0) return 'Bugün bütün arkadaşlarına hediye gönderdin — yarın yine gönderebilirsin.';
  const budget = `Günlük gönderim bütçen: ${board.remainingSendBudget}/${board.dailySendBudget} çip.`;
  if (board.nextRecipients.length === 0) {
    return board.limitedBy === 'funds'
      ? `Hediye başına ${board.sendCost} çip gerekir — bakiyen yetmiyor.`
      : `Bugünkü gönderim bütçeni (${board.dailySendBudget} çip) kullandın — yarın yenilenir.`;
  }
  const count = board.nextRecipients.length;
  const rest =
    board.unsentEligibleCount > count
      ? ` ${board.unsentEligibleCount - count} arkadaşın ${board.limitedBy === 'funds' ? 'bakiye' : 'bütçe'} yüzünden bu sefer atlanır.`
      : '';
  return `${count} arkadaşına ${board.sendCost}'şer çip gider: toplam ${nextSendCost(board)} çip senden düşer. ${budget}${rest}`;
}

export function collectHint(board: FriendGiftBoardView): string {
  if (board.pendingCount === 0) return 'Bekleyen hediyen yok.';
  if (board.remainingCollectsToday === 0) {
    return `Bugünkü toplama sınırına ulaştın (${board.dailyCollectLimit}). ${board.pendingCount} hediye yarın toplanabilir.`;
  }
  const now = Math.min(board.pendingCount, board.remainingCollectsToday);
  return `${board.pendingCount} hediye seni bekliyor — şimdi ${now} tanesini toplayabilirsin.`;
}

const SKIP_REASON: Record<'budget_exhausted' | 'insufficient_funds', string> = {
  budget_exhausted: 'günlük bütçe doldu',
  insufficient_funds: 'bakiye yetmedi',
};

export function describeSendAll(result: FriendGiftSendAllResult): string {
  const refund = result.refunded > 0 ? ` Süresi dolan hediyelerinden ${result.refunded} çip iade edildi.` : '';
  const skipped = result.recipients.filter(
    (recipient) => recipient.status === 'budget_exhausted' || recipient.status === 'insufficient_funds',
  );
  const skippedText =
    skipped.length > 0
      ? ` ${skipped.length} arkadaş atlandı (${SKIP_REASON[skipped[0]!.status as keyof typeof SKIP_REASON]}).`
      : '';
  if (result.sent === 0) {
    const base =
      skipped.length > 0
        ? `Hediye gönderilemedi.${skippedText}`
        : result.alreadySentToday > 0
          ? 'Bugün bütün arkadaşlarına zaten hediye göndermiştin.'
          : 'Hediye gönderilecek arkadaş bulunamadı.';
    return `${base}${refund}`;
  }
  const names = result.recipients
    .filter((recipient) => recipient.status === 'sent')
    .slice(0, 5)
    .map((recipient) => recipient.displayName)
    .join(', ');
  return `🎁 ${result.sent} arkadaşına hediye gönderildi (${names}${result.sent > 5 ? '…' : ''}): −${result.cost} çip.${skippedText}${refund}`;
}

export function describeCollect(result: FriendGiftCollectResult): string {
  if (result.collected === 0) {
    return result.stillPending > 0 ? 'Bugünkü toplama sınırına ulaştın — kalanlar yarın.' : 'Toplanacak hediye yoktu.';
  }
  const rest = result.stillPending > 0 ? ` ${result.stillPending} hediye yarına kaldı.` : '';
  return `🎁 ${result.collected} hediye toplandı: +${result.amount} çip.${rest}`;
}

/**
 * "Her 5 arkadaşa 100 çip" — sıradaki arkadaş başarımı (config'ten). Ödül
 * Görevler → Başarımlar'dan alınır; burası yalnızca yol gösterir.
 */
export function nextFriendMilestone(
  friendCount: number,
  achievements: readonly AchievementDefinitionConfig[],
): { target: number; rewardMoney: number } | null {
  const next = achievements
    .filter((achievement) => achievement.metric === 'friend_count' && achievement.target > friendCount)
    .sort((a, b) => a.target - b.target)[0];
  return next ? { target: next.target, rewardMoney: next.rewardMoney } : null;
}

export type FriendMilestoneState = 'claimed' | 'claimable' | 'locked';

export interface FriendMilestone {
  key: string;
  target: number;
  rewardMoney: number;
  state: FriendMilestoneState;
}

/**
 * 16.10.2026 — brief §6.5: arkadaş ekranında "kazanılmış" (alınabilir) ile
 * "alınmış" ayrı görünür. Kaynak sunucunun başarım panosu (`GET /achievements`);
 * ilerleme ve ödül sunucuda hesaplanır, burada yalnızca durum etiketlenir.
 */
export function friendMilestones(achievements: readonly AchievementView[]): FriendMilestone[] {
  return achievements
    .filter((achievement) => achievement.metric === 'friend_count')
    .sort((a, b) => a.target - b.target)
    .map((achievement) => ({
      key: achievement.key,
      target: achievement.target,
      rewardMoney: achievement.rewardMoney,
      state: achievement.claimed ? 'claimed' : achievement.progress >= achievement.target ? 'claimable' : 'locked',
    }));
}
