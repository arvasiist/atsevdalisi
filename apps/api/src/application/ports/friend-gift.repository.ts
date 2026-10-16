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
  /** Bugün hediyeye harcanan çip (`sender_paid` toplamı). */
  spentToday: number;
  balance: number;
  /** Bugün henüz hediye gönderilmemiş uygun arkadaşlar (gönderim sırasıyla). */
  unsent: FriendGiftRecipientFacts[];
}

export interface FriendGiftRecipientFacts {
  playerId: string;
  username: string;
  displayName: string;
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
  dailySendBudget: number;
  /** Bu andan eski, toplanmamış ÖDENMİŞ hediyeler gönderene iade edilir. */
  expiryCutoff: Date;
  now: Date;
}

export type FriendGiftSendAllOutcome =
  | {
      kind: 'ok';
      sent: FriendGiftRecipientFacts[];
      alreadySent: FriendGiftRecipientFacts[];
      skipped: FriendGiftRecipientFacts[];
      limitedBy: 'none' | 'budget' | 'funds';
      cost: number;
      refunded: number;
      balanceAfter: number;
    }
  | { kind: 'not_found' };

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
  sendToAllFriends(input: FriendGiftSendAllInput): Promise<FriendGiftSendAllOutcome>;
  collect(input: FriendGiftCollectInput): Promise<FriendGiftCollectOutcome>;
}
