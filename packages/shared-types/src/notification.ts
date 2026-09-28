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
}

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
