import type { Currency } from '@at-sevdalisi/shared-types';

/**
 * `GiftRepository` — Hediye gönderimi diliminin Application →
 * Infrastructure portu (proje sahibinin açık talebi, 27.09.2026 — üç
 * parçanın üçüncüsü: "hediye gönderimi").
 *
 * **BU PORT BİR PARA YOLUDUR** ve bu yüzden `SocialRepository`'den AYRI
 * durur (bkz. o portun "BU PORT BİR PARA YOLU DEĞİLDİR" notu — iki dilim
 * bilinçli olarak ayrıldı). Kendi transaction'ını SAHİPLENİR:
 * `MarketPurchaseRepository.executePurchase` ile AYNI gerekçe — İKİ
 * `players` satırı AYNI transaction'da kilitlenip güncelleneceği ve AYNI
 * transaction'da İKİ `economy_transactions` satırı yazılacağı için bu işi
 * ne `PlayerRepository` ne `SocialRepository` üstlenebilir.
 *
 * **NEDEN `PlayerRepository.updateTwoWithLock` KULLANILMADI:** o metot
 * `{buyer, seller, result}` döner ve **defter kaydı YAZMAZ** (bkz. kendi
 * doc yorumu); hediye ise transfer başına İKİ ledger satırı
 * (`gift_send_debit` / `gift_send_credit`) gerektirir. Bu yüzden piyasa
 * alımındaki gibi adanmış bir koordinatör port tercih edildi.
 *
 * **Hediye bir SINK değil TRANSFER'dir:** tribün bileti
 * (`GRANDSTAND_REPOSITORY.purchaseTicket`) tek satır yazıp parayı
 * ekonomiden ÇIKARIR; burada para İKİ oyuncu arasında yer değiştirir —
 * toplam arz değişmez (brief §1'in "ana para birimi" muhasebe ilkesi).
 *
 * **Ön koşul: KABUL EDİLMİŞ ARKADAŞLIK.** Bu, portun kendi içinde (yazma
 * transaction'ının İÇİNDE, kilitli satırlarla) doğrulanır — çağıran
 * use-case'in ön kontrolü yalnızca anlaşılır bir erken hata içindir.
 */
export interface GiftRepository {
  /**
   * Hediyeyi TEK bir transaction'da gerçekleştirir. Sıra (deadlock'tan
   * kaçınmak için — `updateTwoWithLock`/`executePurchase` ile AYNI global
   * ilke):
   *   1. İKİ `players` satırı id'lerin SÖZLÜKSEL sırasına göre
   *      `SELECT ... FOR UPDATE` (gönderen + alıcı; aynı anda TEK kilit
   *      sırası).
   *   2. `friendships` satırı (kilit ALINMAZ — düz okuma; gerekçe
   *      implementasyonda).
   *   3. Günlük hediye SAYIMI (`created_at >= now() - ($2 * interval '1
   *      hour')`) — gönderenin satırı ZATEN kilitli olduğundan aynı
   *      gönderenin eşzamanlı istekleri bu kilit üzerinden SERİLEŞİR.
   *   4. Domain kapıları: `assertNotSelfGift`, `assertValidGiftAmount`,
   *      `resolveGiftCurrency`, `assertGiftAllowedByFriendship`,
   *      `assertUnderDailyGiftLimit` ve `transfer` (`domain/economy/wallet.ts`).
   *   5. İKİ `players` UPDATE + `gift_sends` INSERT + İKİ
   *      `economy_transactions` INSERT.
   *
   * Herhangi bir adım hata fırlatırsa `withTransaction` ROLLBACK yapar:
   * ne bakiye değişir ne defter satırı yazılır.
   */
  sendGift(input: SendGiftInput): Promise<SendGiftExecutionResult>;

  /**
   * Oyuncunun hediyeleri (gelen + giden), en YENİDEN eskiye. Salt okunur
   * — `withTransaction` GEREKMEZ (`SocialRepository.findInbox` ile AYNI
   * gerekçe).
   */
  listGifts(playerId: string, limit: number): Promise<GiftFacts[]>;
}

/**
 * `GiftRepository.sendGift` girdisi.
 *
 * `minAmount`/`maxAmount`/`dailyLimit`/`dailyWindowHours`/`allowedCurrencies`
 * ÇAĞIRAN tarafından config'ten (`config/gift.config.json`) doldurulur —
 * port `game-config`'e bağımlı OLMAZ (uygulama katmanı da framework
 * config'ine değil, düz değerlere bakar; `GrandstandRepository.purchaseTicket`'ın
 * `price`/`currency` alanlarıyla AYNI desen).
 *
 * **`dailyWindowHours` portun GİRDİSİNDEDİR (repository'nin içinde sabit
 * DEĞİL):** sorguya gömülü bir `interval '24 hours'` sihirli sayı olurdu
 * (CLAUDE.md "SİHİRLİ SAYI YOK") ve "günlük limit"in kaç saat demek olduğu
 * oyun dengesi kararıdır, şema gerçeği değil.
 */
export interface SendGiftInput {
  senderId: string;
  recipientId: string;
  currency: Currency;
  /** İŞARETSİZ, pozitif tam sayı — yön `senderId`/`recipientId` ile bellidir. */
  amount: number;
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  dailyWindowHours: number;
  allowedCurrencies: readonly string[];
  /** `IdempotencyInterceptor`'ın header'ından — ledger satırlarında iz olarak tutulur. */
  idempotencyKey: string | null;
}

/**
 * `GiftRepository.sendGift` sonucu.
 *
 * **`recipientBalance` BİLİNÇLİ OLARAK YOKTUR** (piyasa alımındaki
 * `sellerBalance`'ın aksine): hediye alan oyuncu, bakiyesini GÖNDERENE
 * göstermeyi kabul etmemiştir. Bkz. `packages/shared-types/src/gift.ts`
 * `SendGiftResult` doc yorumu.
 */
export interface SendGiftExecutionResult {
  giftId: string;
  /** Gönderenin hediyeden SONRAKİ kendi bakiyesi. */
  senderBalance: { money: number; gems: number };
  /** Alıcının yalnızca GÖRÜNÜR alanları (`SocialPlayerView` — para/gems GİZLİ). */
  recipient: GiftCounterpartyFacts;
}

/** Hediye satırında karşı tarafın taşınan alanları — `SocialPlayerFacts` ile AYNI küme. */
export interface GiftCounterpartyFacts {
  playerId: string;
  displayName: string;
  level: number;
}

/** `gift_sends` satırı + karşı tarafın JOIN'den gelen görünür alanları. */
export interface GiftFacts {
  giftId: string;
  /**
   * Sunucuda TÜRETİLİR (`sender_id = $1` ise `outgoing`) — istemciye
   * "ben mi gönderdim" sorusunu sormak, iki kaynaklı bir doğruluk
   * üretirdi (`FriendRequestFacts.direction` ile AYNI ilke).
   */
  direction: 'incoming' | 'outgoing';
  counterparty: GiftCounterpartyFacts;
  currency: Currency;
  amount: number;
  createdAt: Date;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const GIFT_REPOSITORY = Symbol('GIFT_REPOSITORY');
