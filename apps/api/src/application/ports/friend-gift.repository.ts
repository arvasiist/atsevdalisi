export const FRIEND_GIFT_REPOSITORY = Symbol('FRIEND_GIFT_REPOSITORY');

export interface FriendGiftPendingFacts {
  giftId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  amount: number;
  createdAt: Date;
}

export interface FriendGiftBoardFacts {
  collectedToday: number;
  pendingCount: number;
  pendingAmount: number;
  pending: FriendGiftPendingFacts[];
  friendCount: number;
  sentToday: number;
}

export interface FriendGiftBoardQuery {
  playerId: string;
  dayKey: string;
  dayStart: Date;
  expiryCutoff: Date;
  pendingLimit: number;
}

export interface FriendGiftSendAllInput {
  senderId: string;
  dayKey: string;
  amount: number;
  now: Date;
}

export interface FriendGiftCollectInput {
  playerId: string;
  dayStart: Date;
  expiryCutoff: Date;
  dailyCollectLimit: number;
  now: Date;
}

export type FriendGiftCollectOutcome =
  | {
      kind: 'ok';
      collected: number;
      amount: number;
      balanceAfter: number;
      remainingCollectsToday: number;
      stillPending: number;
    }
  | { kind: 'not_found' };

/**
 * DOSTLUK HEDİYESİ (08.10.2026). Gönderim para taşımaz (yalnızca satır);
 * toplama PARA YOLUDUR: oyuncu `FOR UPDATE` → günlük sınır kilit altında
 * sayılır → hediyeler işaretlenir → bakiye + `friend_gift_collect` defter
 * satırı TEK transaction'da.
 */
export interface FriendGiftRepository {
  board(query: FriendGiftBoardQuery): Promise<FriendGiftBoardFacts>;
  /** Uygun her arkadaşa bugünün hediyesi (zaten gönderilmişse atlanır). */
  sendToAllFriends(input: FriendGiftSendAllInput): Promise<{ sent: number; alreadySentToday: number }>;
  collect(input: FriendGiftCollectInput): Promise<FriendGiftCollectOutcome>;
}
