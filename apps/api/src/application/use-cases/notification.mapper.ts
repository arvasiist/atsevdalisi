import type { NotificationPayloadByType, NotificationView } from '@at-sevdalisi/shared-types';
import type { NotificationRow } from '../ports/notification.repository';

/**
 * `NotificationRow` → `NotificationView` (brief §28, §42 PHASE 11).
 *
 * **BURADAKİ CAST BİLİNÇLİ VE TEK YERDEDİR.** `payload` veritabanında
 * JSONB'dir; şeması yalnızca TİP tarafında (`NotificationPayloadByType`)
 * yaşar, veritabanı "geçerli JSON"dan fazlasını garanti etmez. Bu yüzden
 * `Record<string, unknown>` → `NotificationPayloadByType[K]` geçişi
 * kaçınılmazdır. Kaçınılmaz olan bu geçişi TEK bir fonksiyona hapsetmek,
 * onu çağrı yerlerine dağıtmaktan iyidir: şekil sözleşmesi değiştiğinde
 * (ör. `race_invite` payload'ına yeni bir alan eklendiğinde) bakılacak
 * yer BURASIDIR.
 *
 * **NEDEN `as unknown as`:** `Record<string, unknown>` ile dar bir nesne
 * tipi arasında doğrudan atama yapılamaz (indeks imzası eksik alanları
 * garanti etmez). Çift cast, tip sistemini "ben sözleşmeyi biliyorum"
 * diyerek geçmektir — ve bunun SORUMLULUĞU yukarıdaki paragrafta açıkça
 * kabul edilmiştir. Alternatif (her tür için elle alan alan doğrulama)
 * sekiz tür için seksen satırlık bir şema doğrulayıcı yazmak olurdu; bu
 * ölçekte kazancı, kaybettiği okunurluğa değmez.
 *
 * `readAt`/`createdAt` dönüşümü ZORUNLUDUR: JSON'da `Date` yoktur
 * (`packages/shared-types/src/chat.ts` başlığındaki AYNI uyarı).
 */
export function toNotificationView(row: NotificationRow): NotificationView {
  return {
    notificationId: row.notificationId,
    type: row.type,
    payload: row.payload as unknown as NotificationPayloadByType[typeof row.type],
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  } as NotificationView;
}
