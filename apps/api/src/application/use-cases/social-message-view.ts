import type { DirectMessageView } from '@at-sevdalisi/shared-types';
import type { DirectMessageRow } from '../ports/social.repository';

/**
 * `DirectMessageRow` (Date) → `DirectMessageView` (ISO metin) dönüşümü.
 *
 * **Neden TEK bir dosyada:** `GetConversationUseCase` ve `GetInboxUseCase`
 * aynı satır tipini döndürür. Dönüşümü iki dosyada kopyalamak, iki uç
 * noktanın zamanla FARKLI şekiller döndürmesine açık kapı bırakırdı —
 * `SocialOverviewView`'in gerekçesiyle AYNI ilke (tek şekil, tek yer).
 */
export function toDirectMessageView(row: DirectMessageRow): DirectMessageView {
  return {
    messageId: row.messageId,
    senderId: row.senderId,
    recipientId: row.recipientId,
    senderDisplayName: row.senderDisplayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    // `null` KORUNUR (boş metne çevrilmez): "okunmadı" ile "okundu ama
    // zamanı bilinmiyor" farkı istemcide kaybolmasın diye.
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
  };
}
