/**
 * DOSTLUK HEDİYESİ (08.10.2026) — saf ekran mantığı. Kural sunucudadır
 * (tutar, günlük sınır, son kullanma); burası yalnızca metin ve düğme durumu.
 */
import type {
  FriendGiftBoardView,
  FriendGiftCollectResult,
  FriendGiftSendAllResult,
} from '@at-sevdalisi/shared-types';
import type { AchievementDefinitionConfig } from '@at-sevdalisi/game-config';

/** Bugün hediye gönderilmemiş arkadaş sayısı. */
export function friendsLeftToGift(board: FriendGiftBoardView): number {
  return Math.max(0, board.friendCount - board.sentToday);
}

export function canSendToAll(board: FriendGiftBoardView): boolean {
  return friendsLeftToGift(board) > 0;
}

export function canCollect(board: FriendGiftBoardView): boolean {
  return board.pendingCount > 0 && board.remainingCollectsToday > 0;
}

export function sendAllHint(board: FriendGiftBoardView): string {
  if (board.friendCount === 0) return 'Henüz hediye gönderebileceğin bir arkadaşın yok.';
  const left = friendsLeftToGift(board);
  if (left === 0) return 'Bugün bütün arkadaşlarına hediye gönderdin — yarın yine gönderebilirsin.';
  return `${left} arkadaşına ${board.amount}'ar çip gider. Senden hiçbir şey düşmez.`;
}

export function collectHint(board: FriendGiftBoardView): string {
  if (board.pendingCount === 0) return 'Bekleyen hediyen yok.';
  if (board.remainingCollectsToday === 0) {
    return `Bugünkü toplama sınırına ulaştın (${board.dailyCollectLimit}). ${board.pendingCount} hediye yarın toplanabilir.`;
  }
  const now = Math.min(board.pendingCount, board.remainingCollectsToday);
  return `${board.pendingCount} hediye seni bekliyor — şimdi ${now} tanesini toplayabilirsin.`;
}

export function describeSendAll(result: FriendGiftSendAllResult): string {
  if (result.sent === 0) {
    return result.alreadySentToday > 0
      ? 'Bugün bütün arkadaşlarına zaten hediye göndermiştin.'
      : 'Hediye gönderilecek arkadaş bulunamadı.';
  }
  return `🎁 ${result.sent} arkadaşına hediye gönderildi.`;
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
