/**
 * Bildirim domaini (brief §28 SOCIAL NOTIFICATIONS, §29 `Notification`,
 * §42 PHASE 11).
 *
 * Framework'süz saf TS — NestJS/ORM importu YOK (CLAUDE.md "KATMAN YÖNÜ
 * TEK YÖNLÜ"). Veritabanı erişimi `application/ports/` üzerinden yapılır.
 *
 * **ÜRETİCİLER — SEKİZİNİN SEKİZİ DE VAR (28.09.2026).** `race_invite`
 * (PHASE 11) + `friend_request`, `friend_accepted`, `message_received`,
 * `gift_received` (PHASE 13) + `race_finished`, `prize_won` (§13.14,
 * ödül dağıtımıyla aynı transaction) + **`race_starting`** (PHASE 1,
 * `race-lock.scheduler.ts`). Sonuncusu uzun süre eksikti çünkü gereken şey
 * bir uç nokta değil bir ZAMANLAYICIYDI: "yarış başladı" bildirimini bir
 * oyuncunun kendi eliyle tetiklemesi anlamsız olurdu.
 *
 * Sekiz türün tamamı burada tanımlıdır çünkü `notifications.type` CHECK'i
 * (migration 0039) ile bu liste BİREBİR olmak zorundadır; kayma
 * `notification-types.spec.ts` ile denetlenir.
 *
 * **KURAL — üreten repository, birincil satırı ve bildirimi AYNI
 * transaction'da yazar** (bkz. `NotificationRepository` port doc yorumu).
 * Bu yüzden `build*Payload` fonksiyonları burada, çağıranın elinde olan
 * alanları alır: repository, satırı yazdığı transaction içinde karşı
 * tarafın `display_name`ini okur ve payload'ı KURAR — iki ayrı yerde
 * kurulan bir payload, kaçınılmaz olarak ayrışırdı.
 */

import type { Currency, NotificationPayloadByType } from '@at-sevdalisi/shared-types';

/**
 * Geçerli bildirim türleri — `notifications.type` CHECK'i (migration 0039)
 * ile BİREBİR aynı olmak zorundadır.
 *
 * Sıra, `packages/shared-types/src/notification.ts` → `NOTIFICATION_TYPES`
 * ile AYNIdır; ikisi arasındaki kayma `notification-types.spec.ts` ile
 * yakalanır. `as const` şarttır: aksi hâlde `NotificationType` `string`
 * olur ve tip daraltması kaybolur.
 */
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
 * Veritabanından gelen serbest metni `NotificationType`a daraltır.
 *
 * **NEDEN GEREKLİ:** `payload`/`type` sütunları veritabanından `string`
 * olarak gelir ve CHECK kısıtı çalışma anında garanti verse de TypeScript
 * bunu BİLMEZ. Doğrudan `as NotificationType` yazmak, CHECK'in ileride
 * gevşetilmesi hâlinde sessizce yanlış tür üretirdi (satır okunur, istemci
 * tanımadığı bir `type` alır, hiçbir yerde hata çıkmaz). Bu fonksiyon o
 * durumda `null` döner ve çağıran satırı ATLAR.
 *
 * Sessiz atlama bilinçlidir: bilinmeyen türdeki bir bildirim yüzünden
 * TÜM listeyi 500 yapmak, tek bir bozuk satırı bütün ekranı karartmaya
 * çevirirdi.
 */
export function parseNotificationType(value: unknown): NotificationType | null {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value as string)
    ? (value as NotificationType)
    : null;
}

/**
 * `payload`ın bir nesne olduğunu doğrular.
 *
 * JSONB sütunu teorik olarak `null`, dizi ya da sayı da içerebilir (CHECK
 * yalnızca "geçerli JSON" der). `payload`ı olduğu gibi istemciye göndermek,
 * `NotificationView`ın sözleşmesini çalışma anında çiğnerdi. Bozuk payload
 * `{}`a düşer — `parseNotificationType` ile AYNI ilke: tek bozuk satır
 * listeyi düşürmez.
 */
export function normalizeNotificationPayload(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Kırpılmış mesaj ÖNİZLEMESİ — `message_received` bildiriminin `preview`
 * alanı (brief §28, §42 PHASE 13).
 *
 * **NEDEN KIRPILIR:** bkz. `SocialConfig.notificationPreviewLength` doc
 * yorumu. Sınır PARAMETREDİR, sabit değil — CLAUDE.md kural 6.
 *
 * **`Array.from` ŞARTTIR, `body.slice` DEĞİL:** `slice` UTF-16 kod
 * birimleri üzerinde çalışır ve bir vekil çiftin (surrogate pair) ORTASINDAN
 * kesebilir. Kesilen yarım çift `�` olarak görünür — istemciye bozuk
 * metin gitmesi, kırpmanın kendisinden daha kötüdür. `Array.from` kod
 * NOKATLARINA ayırır (emoji tek eleman olur).
 *
 * **Üç nokta KIRPILDIĞINDA eklenir, her zaman değil:** sığan bir mesaja
 * `…` eklemek "burada devamı var" yalanı olurdu.
 *
 * **Yeni satırlar KORUNUR** (boşluğa çevrilmez): önizleme düz metindir,
 * HTML'e basılmaz; istemci satır sonlarını istediği gibi işler.
 */
export function buildMessagePreview(body: string, maxLength: number): string {
  // Bozuk config'e karşı: 0/negatif bir sınır HER mesajı `'…'` yapardı.
  const limit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : body.length;
  const points = Array.from(body);
  if (points.length <= limit) return body;
  return `${points.slice(0, limit).join('')}…`;
}

/**
 * Bildirim `payload`larını ÜRETEN saf fonksiyonlar.
 *
 * **NEDEN AYRI FONKSİYONLAR (repository içinde nesne kurmak yerine):**
 * `payload` şekli `NotificationPayloadByType` ile sözleşmedir. Repository
 * içinde satır içi bir nesne kurmak, alan adının orada sessizce kaymasına
 * izin verirdi (ör. `displayName` → `name`); oysa bu fonksiyonlar dönüş
 * tipini AÇIKÇA `NotificationPayloadByType[...]` diye bildirir ve kayma
 * DERLEME hatası olur.
 *
 * **`payload`da HEM `playerId` HEM `displayName` vardır:** istemci her
 * bildirim satırı için ikinci bir `GET /players/:id` atmasın diye — şekil
 * sözleşmesinin kendi doc yorumundaki N+1 gerekçesi.
 *
 * `playerId` HER ZAMAN **KARŞI TARAFTIR** (bildirimi ÜRETEN değil): bildirim
 * zaten üretildiği oyuncunun satırıdır, `playerId` "kim yaptı" sorusunun
 * cevabıdır. İstemci "X sana arkadaşlık isteği gönderdi" cümlesini tam
 * olarak bu alandan kurar.
 */
export function buildFriendRequestPayload(input: {
  requestId: string;
  playerId: string;
  displayName: string;
}): NotificationPayloadByType['friend_request'] {
  return { requestId: input.requestId, playerId: input.playerId, displayName: input.displayName };
}

export function buildFriendAcceptedPayload(input: {
  friendshipId: string;
  playerId: string;
  displayName: string;
}): NotificationPayloadByType['friend_accepted'] {
  return {
    friendshipId: input.friendshipId,
    playerId: input.playerId,
    displayName: input.displayName,
  };
}

/**
 * `gift_received` — hediye ALANA yazılır (PARA YOLU, PHASE 13).
 *
 * **`playerId`/`displayName` GÖNDERENİ tanımlar**, alıcıyı değil — bu
 * dosyanın genel kuralı (`playerId` HER ZAMAN karşı taraftır). İstemci
 * "Ömer sana 500 Çip gönderdi" cümlesini tam olarak buradan kurar.
 *
 * **`amount` İŞARETSİZDİR** (`gift_sends.amount` gibi): yön satırın
 * kendisindedir ve bu bildirim zaten yalnızca ALANA yazılır. Negatif bir
 * miktar göndermek, istemciye "500 Çip kaybettin" dedirtirdi.
 *
 * `currency` payload'a KONUR: "500" tek başına belirsizdir (Çip mi
 * Elmas mı) ve istemcinin bunu tahmin etmesi, sunucunun bildiği bir şeyi
 * istemciye sormak olurdu.
 */
export function buildGiftReceivedPayload(input: {
  giftSendId: string;
  playerId: string;
  displayName: string;
  currency: Currency;
  amount: number;
}): NotificationPayloadByType['gift_received'] {
  return {
    giftSendId: input.giftSendId,
    playerId: input.playerId,
    displayName: input.displayName,
    currency: input.currency,
    amount: input.amount,
  };
}

export function buildMessageReceivedPayload(input: {
  messageId: string;
  playerId: string;
  displayName: string;
  preview: string;
}): NotificationPayloadByType['message_received'] {
  return {
    messageId: input.messageId,
    playerId: input.playerId,
    displayName: input.displayName,
    preview: input.preview,
  };
}

/**
 * `race_starting` — yarış KİLİTLENDİĞİ anda (`scheduled → locking`) o
 * yarışın GERÇEK katılımcılarına yazılır (brief §42 PHASE 1, 28.09.2026).
 *
 * **BU TÜRÜN ÜRETİCİSİ UZUN SÜRE YOKTU — ve yokluğunun sebebi bir KOD
 * eksikliği DEĞİL, bir ALTYAPI eksikliğiydi.** Diğer yedi türün aksine bu
 * bildirim "bir uç noktadan çağrılır" biçiminde modellenemezdi: bir
 * oyuncunun kendi eliyle "yarış başladı" bildirimini tetiklemesi anlamsız
 * olurdu (kendine haber vermek). Gereken şey, BAŞLANGIÇ ANINDA tetiklenen
 * bir işti — yani bir zamanlayıcı. `race-lock.scheduler.ts` (migration
 * 0042) o zamanlayıcıdır ve bu fonksiyon onun ürettiği payload'ı kurar.
 *
 * **`startTime` PAYLOAD'DA TAŞINIR** çünkü istemcinin "ne zaman başladı"
 * sorusunu yarış kaydından ayrıca sorması (N+1) gerekmesin —
 * `race_invite`in `raceName`i taşımasıyla AYNI gerekçe.
 *
 * **`race_finished` İLE AYNI "karşı taraf yok" KURALI:** burada da
 * `playerId`/`displayName` YOKTUR; bildirimin konusu yarışın kendisidir.
 */
export function buildRaceStartingPayload(input: {
  raceId: string;
  raceName: string;
  startTime: Date;
}): NotificationPayloadByType['race_starting'] {
  return {
    raceId: input.raceId,
    raceName: input.raceName,
    // ISO 8601 — `NotificationView.createdAt` ile AYNI gösterim. `Date`
    // nesnesi JSONB'ye yazılırken `toISOString()`e düşerdi ama bunu
    // ÖRTÜK bırakmak, payload'ı okuyan istemci için sözleşmeyi
    // "JSON.stringify ne yaparsa"ya bağlardı.
    startTime: input.startTime.toISOString(),
  };
}

/**
 * `race_finished` — yarış KOŞTUKTAN sonra, o yarışa katılan HER oyuncuya
 * yazılır (PARA YOLU, §42 PHASE 13.14).
 *
 * **BU TÜRDE `playerId`/`displayName` YOKTUR — ve bu bilinçlidir.** Bu
 * dosyanın genel kuralı ("`playerId` her zaman karşı taraftır") SOSYAL
 * türler içindir: orada anlatılacak bir karşı taraf vardır. Burada ise
 * bildirimin konusu yarışın KENDİSİDİR; "kim yaptı" sorusunun cevabı
 * yoktur ve olmayan bir alanı `null` ile doldurmak, sözleşmeyi
 * `NotificationPayloadByType`'ta `string` yazıp pratikte boş bırakmak
 * olurdu. `NotificationPayloadByType['race_finished']` şekli ZATEN böyle
 * tanımlıdır (packages/shared-types/src/notification.ts).
 *
 * **`finishPosition` GÖRECELİ DEĞİL MUTLAK SIRADIR** (1 = kazanan).
 * Bildirim alıcıya özel olduğundan, alıcının kendi sırası yazılır —
 * istemcinin "kaçıncı oldum" cevabını başka bir uçtan hesaplaması
 * gerekmez. Beraberlikte sıra `race_entries.finish_position`'dan AYNEN
 * okunur (motor deterministik olduğundan beraberlik varsa bile sabittir).
 */
export function buildRaceFinishedPayload(input: {
  raceId: string;
  raceName: string;
  finishPosition: number;
}): NotificationPayloadByType['race_finished'] {
  return {
    raceId: input.raceId,
    raceName: input.raceName,
    finishPosition: input.finishPosition,
  };
}

/**
 * `prize_won` — ödül KAZANAN oyunculara yazılır (PARA YOLU, §42 PHASE
 * 13.14). Kazanmayan katılımcı bu bildirimi ALMAZ: sıfır ödüllü bir
 * "kazandınız" bildirimi, istemciye 0 Çip gösteren bir satır bırakırdı.
 *
 * **`amount` İŞARETSİZDİR** (`buildGiftReceivedPayload` ile AYNI gerekçe):
 * yön satırın kendisindedir ve bu bildirim yalnızca KAZANANA yazılır.
 * Negatif bir miktar, istemciye "ödül kaybettin" dedirtirdi.
 *
 * **`currency` YOKTUR:** ödül her zaman oyun içi ana para birimidir ve
 * `prize_won` sözleşmesi (packages/shared-types) onu taşımaz. `gift_received`
 * iki para birimi arasında seçim yapabildiği için `currency` taşımak
 * ZORUNDAYDI; burada böyle bir belirsizlik yoktur.
 */
export function buildPrizeWonPayload(input: {
  raceId: string;
  raceName: string;
  amount: number;
}): NotificationPayloadByType['prize_won'] {
  return { raceId: input.raceId, raceName: input.raceName, amount: input.amount };
}
