/**
 * HESAP SİLME KURALLARI (02.10.2026, migration 0059) — saf.
 *
 * Silme, parası EMANETTE olan bir oyuncu için REDDEDİLİR: müzayedede lider
 * teklif, teklif almış kendi müzayedesi, açık yarış katılımı, süren
 * kontrollü yarış, eşleşmiş PvP maçı. Bunlar para yolunu yarıda keserdi
 * (iade/ödeme anonim bir hesaba ya da hiçbir yere düşerdi). Oyuncu önce
 * bunları bitirir. Diğer üyesi olan kulübün lideri önce liderliği devreder.
 */
export const ACCOUNT_DELETION_BLOCKERS = [
  'auction_leading_bid',
  'auction_with_bids',
  'open_race_entry',
  'interactive_race_running',
  'pvp_match_active',
  'club_leader_with_members',
] as const;

export type AccountDeletionBlocker = (typeof ACCOUNT_DELETION_BLOCKERS)[number];

/** Silinmiş oyuncunun görünen adı — kişisel bilgi taşımaz. */
export const DELETED_DISPLAY_NAME = 'Silinmiş oyuncu';

/** Benzersiz ve kişisel bilgi taşımayan kullanıcı adı (eski ad serbest kalır). */
export function deletedUsername(playerId: string): string {
  return `silinmis_${playerId.replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Onay: oyuncu kendi kullanıcı adını yazmalıdır (yanlış hesabı yanlışlıkla
 * silmeyi önler). Büyük/küçük harf ve kenar boşluğu tolere edilir.
 */
export function isDeletionConfirmed(rawConfirm: unknown, username: string): boolean {
  return typeof rawConfirm === 'string' && rawConfirm.trim().toLowerCase() === username.toLowerCase();
}

/** Oyuncuya gösterilen engel açıklamaları (sunucu mesajı ve ekran AYNI metni kullanır). */
export const ACCOUNT_DELETION_BLOCKER_LABELS: Record<AccountDeletionBlocker, string> = {
  auction_leading_bid: 'bir müzayedede önde giden teklifin var (paran emanette)',
  auction_with_bids: 'teklif almış bir müzayeden açık',
  open_race_entry: 'henüz koşulmamış bir yarışa kayıtlısın (yarıştan ayrıl ya da bitmesini bekle)',
  interactive_race_running: 'süren bir kontrollü yarışın var',
  pvp_match_active: 'süren bir eşleşmeli maçın var',
  club_leader_with_members: 'üyesi olan bir kulübün liderisin (önce liderliği devret)',
};
