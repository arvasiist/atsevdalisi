import type { NotificationType } from '@at-sevdalisi/shared-types';

/**
 * `NotificationRepository` — bildirim okuma diliminin Application →
 * Infrastructure portu (brief §28, §42 PHASE 11).
 *
 * **BU PORT YALNIZCA OKUR VE OKUNDU İŞARETLER — YAZMAZ.** Bildirim
 * ÜRETMEK (`INSERT INTO notifications`) yalnızca `RaceInviteRepository.
 * saveInvite`ın yetkisindedir ve o, davet satırıyla AYNI transaction'da
 * yazar (bkz. o portun doc yorumu). Burada bir `create` metodu olsaydı,
 * "bildirimi kim üretir" sorusunun iki cevabı olurdu ve atomiklik kuralı
 * ilk dikkatsiz çağrıda delinirdi. PHASE 13'ün yeni üreticileri de aynı
 * kurala uyar: üreten use-case, kendi tablosunu ve bildirimi tek
 * transaction'da yazar.
 *
 * **BU PORT BİR PARA YOLU DEĞİLDİR:** `players` satırı güncellenmez.
 */
export interface NotificationRepository {
  /**
   * Oyuncunun bildirimleri, en YENİDEN eskiye, `limit` ile sınırlı.
   * Salt okunur — `withTransaction` GEREKMEZ (`findOverview` ile AYNI
   * gerekçe).
   */
  findByPlayerId(playerId: string, limit: number): Promise<NotificationRow[]>;

  /**
   * TEK bildirim, o oyuncuya aitse. Yoksa (ya da başkasınınsa) `null`.
   *
   * **NEDEN AYRI METOT (listeyi çekip içinde aramak yerine):** listeyi
   * `notificationsLimit` ile çekip aramak, sınırın DIŞINDA kalan eski bir
   * bildirimi "yok" sayardı — yani `POST .../:notificationId/read` eski bir
   * bildirim için yanlışlıkla 404 dönerdi. Sınırsız çekmek ise tüm
   * geçmişi okumak olurdu. Tek satırlık indeksli sorgu ikisini de çözer.
   */
  findById(playerId: string, notificationId: string): Promise<NotificationRow | null>;

  /**
   * Okunmamış bildirim SAYISI — `unreadCount` rozeti.
   *
   * **NEDEN AYRI SORGU (liste kırpılmış olsa bile):** liste `limit` ile
   * sınırlıdır; rozeti kırpılmış diziden saymak, 60 okunmamış bildirimi
   * olan bir oyuncuya 50 gösterirdi (bkz. `NotificationListResult` doc
   * yorumu). Kısmi indeks (`notifications_player_unread_idx`, migration
   * 0039) bu sorguyu tablo büyüdükçe KÜÇÜK tutar.
   */
  countUnread(playerId: string): Promise<number>;

  /**
   * TEK bildirimi okundu işaretler. Yalnızca satır o oyuncuya ait VE
   * `read_at IS NULL` ise yazar; aksi hâlde `null` döner.
   *
   * **NEDEN `read_at IS NULL` KOŞULU VAR:** zaten okunmuş bir bildirimi
   * yeniden işaretlemek, okunma ANINI ileri kaydırırdı — "ne zaman
   * okundu" bilgisi bozulurdu. `null` dönmesi çağıranda hata DEĞİLDİR:
   * uç nokta idempotenttir, istemci aynı bildirime iki kez tıklayabilir.
   *
   * `readAt` çağıranın verdiği andır (repository `now()` ÇAĞIRMAZ —
   * `markConversationRead` ile AYNI test edilebilirlik disiplini).
   */
  markRead(playerId: string, notificationId: string, readAt: Date): Promise<NotificationRow | null>;

  /**
   * Oyuncunun TÜM okunmamış bildirimlerini okundu işaretler; kaç satırın
   * güncellendiğini döner. Zaten okunmuş satırlara DOKUNMAZ (`read_at IS
   * NULL` filtresi) — `markRead` ile AYNI gerekçe.
   */
  markAllRead(playerId: string, readAt: Date): Promise<number>;
}

/**
 * `notifications` satırının Application katmanındaki karşılığı.
 *
 * `type` burada `NotificationType`tır: daraltma repository'de
 * `parseNotificationType` ile YAPILIR ve CHECK'e uymayan bir satır
 * listeye HİÇ GİRMEZ (bkz. o fonksiyonun doc yorumu). `payload` ise
 * serbest bir nesnedir — şekil sözleşmesi `NotificationPayloadByType`
 * ile TİP tarafında zorlanır, veritabanı yalnızca "geçerli JSON" der.
 */
export interface NotificationRow {
  notificationId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
