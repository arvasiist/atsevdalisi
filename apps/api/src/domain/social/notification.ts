/**
 * Bildirim domaini (brief §28 SOCIAL NOTIFICATIONS, §29 `Notification`,
 * §42 PHASE 11).
 *
 * Framework'süz saf TS — NestJS/ORM importu YOK (CLAUDE.md "KATMAN YÖNÜ
 * TEK YÖNLÜ"). Veritabanı erişimi `application/ports/` üzerinden yapılır.
 *
 * **ÜRETİCİLER (28.09.2026, PHASE 13):** `race_invite` (PHASE 11) +
 * `friend_request`, `friend_accepted`, `message_received` (PHASE 13).
 * `gift_received`, `race_starting`, `race_finished`, `prize_won` HÂLÂ
 * ÜRETİLMEZ — bunu "yapıldı" saymamak için PROJE_DURUMU.md §13.13'te
 * açıkça yazılıdır.
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

import type { NotificationPayloadByType } from '@at-sevdalisi/shared-types';

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
