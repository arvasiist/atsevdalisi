import type { TribuneGiftFeedItem } from '@at-sevdalisi/shared-types';

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

/**
 * TRİBÜN HEDİYESİ (08.10.2026) — PARA YOLU. `send` TEK transaction'da:
 * yarış (FOR SHARE) → katılım (alıcı = koşturan oyuncu) → iki oyuncu id
 * sırasıyla FOR UPDATE → engel → günlük sınır (kilit altında) → debit +
 * credit + iki defter satırı + bildirim.
 */
export interface TribuneGiftRepository {
  send(input: SendTribuneGiftInput): Promise<SendTribuneGiftOutcome>;
  /** `null` = yarış yok. */
  findForRace(raceId: string, viewerId: string, dayStart: Date, recentLimit: number): Promise<RaceTribuneGiftFacts | null>;
}
