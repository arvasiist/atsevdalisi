/**
 * Arkadaşlık + mesajlaşma görünümleri (proje sahibinin açık talebi,
 * 27.09.2026: "arkadaşlık + mesajlaşma").
 *
 * `grandstand.ts` ile AYNI ilke: bu tipler API yanıtının GERÇEK şeklidir;
 * sayfa/bileşen seviyesinde elle kopyalanmış arayüzler KULLANILMAZ.
 */

/** `friendships.status` — DB CHECK kısıtıyla (`migration 0033`) birebir aynı liste. */
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Sosyal ekranda gösterilen oyuncu özeti. `PlayerSummary`'nin TAMAMI
 * BİLİNÇLİ olarak taşınmaz: `money`/`gems` gibi alanlar başka bir oyuncu
 * için GİZLİDİR (bkz. AUDIT_REPORT.md Bulgu S4 — yalnızca kendi
 * bakiyenizi görebilirsiniz).
 */
export interface SocialPlayerView {
  playerId: string;
  displayName: string;
  level: number;
}

/** Kabul edilmiş bir arkadaşlık. */
export interface FriendView extends SocialPlayerView {
  friendshipId: string;
  /** Arkadaşlığın KABUL edildiği an (`friendships.responded_at`). */
  friendsSince: string;
}

/**
 * Bekleyen bir arkadaşlık isteği.
 *
 * `direction` alanı, sunucunun `requested_by_id` alanından türettiği
 * yöndür: `incoming` = bana geldi (yanıtlayabilirim), `outgoing` = ben
 * gönderdim (yalnızca bekleyebilirim). İstemci iki listeyi bu alanla
 * ayırmak zorunda KALMAZ — sunucu zaten ayrı dizilerde döner — ama her
 * satırın kendi yönünü taşıması, tek bir listede gösterim için ve test
 * doğrulamaları için gereklidir.
 */
export interface FriendRequestView extends SocialPlayerView {
  requestId: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

/**
 * Sosyal ekranın TEK istekte dönen tüm verisi. Üç ayrı uç nokta yerine
 * tek bir "özet" uç noktası bilinçli bir tercihtir: ekran açıldığında
 * kullanıcı üçüne birden bakar, üç ayrı istek gereksiz gecikme ve kısmi
 * yükleme durumları üretirdi.
 */
export interface SocialOverviewView {
  friends: FriendView[];
  incomingRequests: FriendRequestView[];
  outgoingRequests: FriendRequestView[];
  /** Bana gelen, henüz OKUNMAMIŞ mesaj sayısı (`read_at IS NULL`). */
  unreadMessageCount: number;
}

/** Bir doğrudan mesaj. */
export interface DirectMessageView {
  messageId: string;
  senderId: string;
  recipientId: string;
  /**
   * Gönderenin görünen adı — sohbet ekranı bunu göstermek için ikinci bir
   * oyuncu isteği ATMAZ (bkz. `SocialPlayerView`'in "tüm alanlar taşınmaz"
   * notu: yalnızca görünen ad ve seviye paylaşılır).
   */
  senderDisplayName: string;
  body: string;
  createdAt: string;
  /** `null` = okunmadı. Zaman damgası (`direct_messages.read_at`) — boolean değil. */
  readAt: string | null;
}

/**
 * `DELETE /players/:id/friends/:friendId` sonucu.
 *
 * **NEDEN GÖVDE VAR (204 NO CONTENT DEĞİL):** istemcinin `request()`
 * yardımcısı (`apps/web/src/lib/api-client.ts`) HER yanıtta
 * `response.json()` çağırır; gövdesiz bir 204 burada "Unexpected end of
 * JSON input" ile patlardı. Gövdesiz yanıt bu kod tabanında BAŞKA HİÇBİR
 * uç noktada yoktur — yeni bir desen icat etmek yerine, silinen satırın
 * kimliği döner: istemci satırı listeden OPTİMİSTİK olarak çıkarabilir ve
 * "hangi satırı sildim" sorusunu cevaplayabilir.
 */
export interface RemoveFriendResult {
  friendId: string;
}

/** Arkadaşlık isteğini yanıtlamanın sonucu (`accept` veya `reject`). */
export interface RespondFriendRequestResult {
  friendshipId: string;
  status: FriendshipStatus;
  /** `accept` ise yeni arkadaş; `reject` ise isteği gönderen oyuncu. */
  player: SocialPlayerView;
}
