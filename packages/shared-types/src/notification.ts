/**
 * Bildirim altyapısı + yarış daveti (brief §16 RACE INVITE, §28 SOCIAL
 * NOTIFICATIONS, §29 `Notification`/`RaceInvite`).
 *
 * `chat.ts`/`social.ts` ile AYNI ilke: bu tipler hem API'nin (HTTP yanıtı +
 * WebSocket yayını) hem `apps/web`'in paylaştığı SÖZLEŞMEDİR.
 *
 * **NEDEN SEKİZ TÜRÜN TAMAMI BURADA — üreticisi olmasa bile:** brief §28
 * sekiz tür sayar ve `notifications.type` CHECK'i (migration 0039) bu
 * listeyle BİREBİR olmak zorundadır. Yalnızca üretilen türü tanımlamak,
 * CHECK ile tip arasında sessiz bir kayma bırakırdı — `config` doğrulamasında
 * kaçındığımız tuzağın AYNISI (bkz. `domain/race/prize.ts` `validateRaceTiers`
 * doc yorumu). Bu turda (PHASE 11) YALNIZCA `race_invite` ÜRETİLİR; kalan
 * yedi türün üreticisi PHASE 13'ün işidir (bkz. PROJE_DURUMU.md §13.11).
 */

import type { Currency } from './currency';

/** `notifications.type` CHECK'i (migration 0039) ile birebir aynı liste. */
export const NOTIFICATION_TYPES = [
  'friend_request',
  'friend_accepted',
  'race_invite',
  'gift_received',
  'message_received',
  'race_starting',
  'race_finished',
  'prize_won',
  'auction_outbid',
  'auction_won',
  'auction_sold',
  'auction_unsold',
  'auction_refunded',
  'tribune_gift_received',
  'listing_expired',
  'club_invite',
  'race_cancelled',
  'stud_service',
  'friend_gift_received',
  'gift_sent',
  'referral_reward',
  // 16.10.2026 — çiftleştirme merkezi (brief §4–§5).
  'breeding_offer_received',
  'breeding_offer_answered',
  'foal_born',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Her bildirim türünün `payload` şekli.
 *
 * **NEDEN AYRI BİR EŞLEME (payload'ı `unknown` bırakmak yerine):** istemci
 * bir bildirime tıkladığında "nereye gideceğim" sorusunu payload'dan
 * cevaplar (davet → lobi, hediye → cüzdan, mesaj → sohbet). `unknown`
 * bırakmak bu kararı her çağrı yerinde bir tip daraltmasına çevirirdi.
 *
 * `displayName` alanları JOIN'den gelir ve TEKRARLANIR (payload'da hem
 * `playerId` hem `displayName` vardır): istemcinin her bildirim satırı için
 * ikinci bir `GET /players/:id` atması N+1 olurdu — `RaceChatMessageView.
 * username` ile AYNI gerekçe.
 */
export interface NotificationPayloadByType {
  friend_request: { requestId: string; playerId: string; displayName: string };
  friend_accepted: { friendshipId: string; playerId: string; displayName: string };
  race_invite: {
    inviteId: string;
    raceId: string;
    raceName: string;
    inviterId: string;
    inviterDisplayName: string;
  };
  gift_received: {
    giftSendId: string;
    playerId: string;
    displayName: string;
    currency: Currency;
    amount: number;
  };
  message_received: { messageId: string; playerId: string; displayName: string; preview: string };
  race_starting: { raceId: string; raceName: string; startTime: string };
  race_finished: { raceId: string; raceName: string; finishPosition: number };
  prize_won: { raceId: string; raceName: string; amount: number };
  // 02.10.2026 — müzayede (`amount` her zaman pozitif; yönü tür söyler).
  /** Teklifin geçildi; `amount` iade edilen tutar. */
  auction_outbid: { listingId: string; horseName: string; amount: number; minimumNextBid: number };
  /** Müzayedeyi kazandın; at ahırında. */
  auction_won: { listingId: string; horseId: string; horseName: string; amount: number };
  /** Atın satıldı; `amount` hesabına geçen tutar. */
  auction_sold: { listingId: string; horseName: string; amount: number };
  /** Müzayede teklifsiz ya da satış gerçekleşmeden bitti; at sende kaldı. */
  auction_unsold: { listingId: string; horseName: string };
  /** Kazandığın müzayedede satış gerçekleşemedi; emanetin iade edildi. */
  auction_refunded: { listingId: string; horseName: string; amount: number };
  /** 08.10.2026 — tribünden atına hediye geldi; `amount` hesabına geçen pay. */
  tribune_gift_received: {
    tribuneGiftId: string;
    raceId: string;
    raceName: string;
    horseId: string;
    horseName: string;
    giftKey: string;
    playerId: string;
    displayName: string;
    amount: number;
    /** 17.10.2026 — pay hediye kutusunda bekliyor (toplanınca hesaba geçer). Eski bildirimlerde yok = gönderimde ödenmişti. */
    collectRequired?: boolean;
  };
  /** 08.10.2026 — sabit fiyatlı ilanın süresi doldu; at satılmadı, sende. */
  listing_expired: { listingId: string; horseId: string; horseName: string; price: number };
  /** 09.10.2026 — bir kulüp subayı/lideri seni kulübüne davet etti. */
  club_invite: { inviteId: string; clubId: string; clubName: string; inviterId: string; inviterName: string };
  /**
   * 15.10.2026 (Aşama 3) — yarış katılımın iptal edildi. `refundedAmount`
   * DEFTERE yazılan iade (0 = ödenmiş ücret yoktu, ör. `on_start` masasında
   * bakiyesi yetmeyen). Yarışın kendisi iptal olmamış olabilir (`not_ready`,
   * `insufficient_funds`: yarış diğerleriyle koşar).
   */
  race_cancelled: { raceId: string; raceName: string; reason: RaceCancelledReason; refundedAmount: number };
  /**
   * 15.10.2026 — aygırın başka bir oyuncunun kısrağıyla tay verdi; `amount`
   * hesabına geçen damızlık payı (`studFeeOwnerSharePercent`, 0 olabilir).
   */
  /** 16.10.2026'dan beri DÖLLENME anında gelir: `pairId` = gebelik, `foalId` = doğacak tayın ayrılmış kimliği. */
  stud_service: { pairId: string; stallionId: string; stallionName: string; foalId: string; amount: number };
  /**
   * 16.10.2026 — bir arkadaşın sana çip hediyesi gönderdi (brief §6.4); çip
   * hesaba "Tüm hediyeleri topla" ile geçer (`/friends`).
   */
  friend_gift_received: { giftId: string; senderId: string; senderUsername: string; senderName: string; amount: number };
  /** 16.10.2026 — gönderdiğin çip transferi tamamlandı (sosyal brief §8). */
  gift_sent: {
    giftSendId: string;
    playerId: string;
    displayName: string;
    currency: 'money' | 'gems';
    amount: number;
    balanceAfter: number;
  };
  /**
   * 16.10.2026 — davet ödülü hesabına geçti. `role`: `inviter` (davet eden) /
   * `invitee` (davetle gelen); `otherName` karşı tarafın görünen adı.
   */
  referral_reward: { referralId: string; role: 'inviter' | 'invitee'; otherName: string; amount: number };
  /** Aygır sahibine: kısrak sahibi teklif gönderdi (ücret emanette). */
  breeding_offer_received: {
    offerId: string;
    stallionId: string;
    stallionName: string;
    mareName: string;
    fromName: string;
    fee: number;
  };
  /** Kısrak sahibine: teklif kabul edildi / reddedildi / iptal oldu / süresi doldu. */
  breeding_offer_answered: {
    offerId: string;
    stallionName: string;
    mareName: string;
    status: 'accepted' | 'rejected' | 'cancelled' | 'expired';
    outcome: 'conceived' | 'not_conceived' | null;
    refundedAmount: number;
  };
  /** Tay doğdu (gebeliğin sahibine). */
  foal_born: { pregnancyId: string; foalId: string; foalName: string; mareName: string };
}

/**
 * `race_cancelled` sebebi: `not_enough_players` (asgari gerçek oyuncu sayısı
 * dolmadı — yarış iptal), `not_ready` (başlangıçta hazır değildin),
 * `insufficient_funds` (`on_start` masasında bedeli karşılayamadın),
 * `admin` (yönetici yarışı iptal etti).
 */
export const RACE_CANCELLED_REASONS = ['not_enough_players', 'not_ready', 'insufficient_funds', 'admin'] as const;
export type RaceCancelledReason = (typeof RACE_CANCELLED_REASONS)[number];

/**
 * Tek bir bildirim — `type`e göre AYRIKLAŞTIRILMIŞ (discriminated) birlik.
 *
 * Bu, `payload`ın türe göre DOĞRU şekilde daralmasını sağlar: `type ===
 * 'race_invite'` kontrolünden sonra `payload.inviteId` tip güvenli biçimde
 * erişilebilir. Düz bir `{ type: NotificationType; payload: ... }` yazmak,
 * istemciyi her kullanımda elle daraltmaya zorlardı.
 */
export type NotificationView = {
  [K in NotificationType]: {
    notificationId: string;
    type: K;
    payload: NotificationPayloadByType[K];
    /** `null` = okunmadı. Zaman damgası — boolean değil (`readAt` disiplini). */
    readAt: string | null;
    /** ISO 8601. */
    createdAt: string;
  };
}[NotificationType];

/**
 * `GET /players/:id/notifications` yanıtı.
 *
 * `unreadCount` AYRI bir alandır (istemci `notifications.filter(...)` ile
 * kendisi saymaz): liste `limit` ile KIRPILMIŞTIR, yani kırpılmış bir
 * diziden sayılan rozet yanlış olurdu — 60 okunmamış bildirimi olan bir
 * oyuncu, 50 satırlık listede 50 görürdü.
 */
export interface NotificationListResult {
  notifications: NotificationView[];
  unreadCount: number;
}

/**
 * `POST /players/:id/notifications/read-all` yanıtı.
 *
 * **NEDEN BURADA (Application katmanında değil):** bu, `apps/web`'in
 * OKUDUĞU bir sözleşmedir — `RespondFriendRequestResult`/`RemoveFriendResult`
 * ile AYNI sınıf. Application katmanında kalsaydı istemci ya tipi
 * ÇOĞALTMAK ya da `unknown`'a düşmek zorunda kalırdı.
 *
 * **NEDEN `markedCount` DÖNER (204 yerine):** `RemoveFriendResult` ile AYNI
 * gerekçe — istemcinin `request()` yardımcısı HER ZAMAN `response.json()`
 * çağırır, yani gövdesiz bir yanıt istemcide hata üretir. Ayrıca sayı,
 * istemciye "rozeti kaça düşüreyim" sorusunun cevabını verir: yarış
 * koşulunda arada gelen bir bildirim rozeti 0 yapmamalıdır.
 */
export interface MarkAllNotificationsReadResult {
  /** Gerçekten okundu işaretlenen satır sayısı. */
  markedCount: number;
}

/**
 * `race_invites.status` CHECK'i (migration 0039) ile birebir aynı liste.
 *
 * `expired` bu turda HİÇBİR ZAMAN yazılmaz (zamanlayıcı yok — bkz.
 * `domain/social/invite.ts` doc yorumu); sözlükte durmasının sebebi,
 * yarışı başlamış bir davetin yanıtlanamamasıdır: davet SİLİNMEZ, durumu
 * değişir. Şu an bu durum `respond` çağrısında 409 ile reddedilir.
 */
export type RaceInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/**
 * Bir yarış daveti.
 *
 * `raceName` ve `inviterDisplayName` JOIN'den gelir — brief §16'nın istediği
 * cümle ("Ömer seni At Sevdalısı Cup yarışına davet etti.") TAM OLARAK bu
 * iki alanla kurulur; istemcinin ikinci bir istek atmasına gerek kalmaz.
 */
export interface RaceInviteView {
  inviteId: string;
  raceId: string;
  raceName: string;
  inviterId: string;
  inviterDisplayName: string;
  inviteeId: string;
  status: RaceInviteStatus;
  createdAt: string;
  /** `null` = henüz yanıtlanmadı (`status === 'pending'`). */
  respondedAt: string | null;
}

/**
 * Daveti yanıtlamanın sonucu (`accept` veya `decline`).
 *
 * **`accept` YARIŞA KATILMAK DEĞİLDİR — bilinçli.** Katılım bir ATA ve bir
 * giriş ücretine bağlıdır (`POST /races/:id/join` gövdesi `horseId` ister);
 * davetin gövdesinde at yoktur ve olamaz, çünkü hangi atın koşacağı
 * oyuncunun kararıdır. Bu yüzden `accept` yalnızca "daveti kabul ettim"
 * der; istemci sonra lobiye gidip atını seçer. Brief §16'nın `[JOIN]`
 * düğmesi bu iki adımı TEK kullanıcı akışında birleştirir, ama sunucuda
 * iki ayrı işlem olarak kalır — para yolu (giriş ücreti) İKİNCİ bir yerden
 * geçmez, tek yol (`JoinRaceUseCase`) olarak kalır (CLAUDE.md kural 7).
 */
export interface RespondRaceInviteResult {
  inviteId: string;
  status: RaceInviteStatus;
}
