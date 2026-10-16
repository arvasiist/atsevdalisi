/**
 * 16.10.2026 — üst bar zilinin okunmamış rozeti (brief §13). Sayının kaynağı
 * sunucunun `unreadCount`udur (istemci listeden saymaz); bu dosya yalnızca
 * gösterimi biçimler. Saf — test DOM'suz koşar.
 */
export const UNREAD_BADGE_MAX = 9;

/** Rozet metni: 0 → gösterilmez (`null`), 1..9 → sayı, fazlası "9+". */
export function formatUnreadBadge(unread: number): string | null {
  if (!(unread > 0)) return null;
  return unread > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(Math.floor(unread));
}

/** Ekran okuyucu etiketi: "Bildirimler (3 okunmamış)". */
export function notificationsAriaLabel(label: string, unread: number): string {
  return unread > 0 ? `${label} (${unread} okunmamış)` : label;
}
