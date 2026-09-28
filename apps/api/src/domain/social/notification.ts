/**
 * Bildirim domaini (brief §28 SOCIAL NOTIFICATIONS, §29 `Notification`,
 * §42 PHASE 11).
 *
 * Framework'süz saf TS — NestJS/ORM importu YOK (CLAUDE.md "KATMAN YÖNÜ
 * TEK YÖNLÜ"). Veritabanı erişimi `application/ports/` üzerinden yapılır.
 *
 * **BU TURDA YALNIZCA `race_invite` ÜRETİLİR.** Sekiz türün tamamı burada
 * tanımlıdır çünkü `notifications.type` CHECK'i (migration 0039) ile bu
 * liste BİREBİR olmak zorundadır; kayma `notification-types.spec.ts` ile
 * denetlenir. Kalan yedi türün ÜRETİCİSİ (arkadaşlık isteği kabul edildi,
 * hediye geldi, mesaj geldi, yarış başlıyor/bitti, ödül kazandın) PHASE
 * 13'ün işidir — bugün `INSERT INTO notifications` yazan TEK yol
 * `send-race-invite`tir. Bunu "yapıldı" saymamak için PROJE_DURUMU.md
 * §13.11'de açıkça yazılıdır.
 */

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
