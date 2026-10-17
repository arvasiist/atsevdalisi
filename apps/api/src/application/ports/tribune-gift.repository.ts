import type { TribuneGiftFeedItem, TribuneGiftInboxView } from '@at-sevdalisi/shared-types';

export const TRIBUNE_GIFT_REPOSITORY = Symbol('TRIBUNE_GIFT_REPOSITORY');

export interface SendTribuneGiftInput {
  raceId: string;
  horseId: string;
  senderId: string;
  giftKey: string;
  price: number;
  ownerAmount: number;
  dailyLimit: number;
  /** Oyun gününün başlangıcı — günlük sınır bu andan sayılır. */
  dayStart: Date;
  giftWindowHours: number;
  idempotencyKey: string | null;
  now: Date;
}

export interface SendTribuneGiftOutcome {
  tribuneGiftId: string;
  horseName: string;
  senderDisplayName: string;
  senderBalanceAfter: number;
  createdAt: Date;
}

export interface RaceTribuneGiftFacts {
  status: string;
  startTime: Date;
  recipients: Array<{ horseId: string; horseName: string; ownerDisplayName: string }>;
  perHorse: Array<{ horseId: string; giftKey: string; count: number }>;
  recent: TribuneGiftFeedItem[];
  sentToday: number;
}

export interface CollectTribuneGiftsOutcome {
  collected: number;
  amount: number;
  balanceAfter: number;
}

/**
 * TRİBÜN HEDİYESİ (08.10.2026) — PARA YOLU. `send` TEK transaction'da:
 * yarış (FOR SHARE) → katılım (alıcı = koşturan oyuncu) → iki oyuncu id
 * sırasıyla FOR UPDATE → engel → günlük sınır (kilit altında) → debit + defter
 * satırı + bildirim. 17.10.2026 (migration 0101): sahibin payı gönderimde
 * ÖDENMEZ, hediye kutusunda bekler; `collect` oyuncu `FOR UPDATE` altında
 * bekleyenleri işaretler ve TEK `tribune_gift_credit` satırı yazar.
 */
export interface TribuneGiftRepository {
  send(input: SendTribuneGiftInput): Promise<SendTribuneGiftOutcome>;
  /** `null` = oyuncu yok/silinmiş. */
  inbox(playerId: string, recentLimit: number): Promise<TribuneGiftInboxView | null>;
  collect(playerId: string, now: Date): Promise<CollectTribuneGiftsOutcome>;
  /** `null` = yarış yok. */
  findForRace(raceId: string, viewerId: string, dayStart: Date, recentLimit: number): Promise<RaceTribuneGiftFacts | null>;
}
