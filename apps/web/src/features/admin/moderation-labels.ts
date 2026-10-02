import type { AnnouncementLevel, AssignableRole, SanctionKind } from '@at-sevdalisi/shared-types';

/** Kapalı kümeler — sunucuya yeni değer eklenirse derleme kırılır. */
export const ROLE_LABELS: Record<AssignableRole, string> = {
  player: 'Oyuncu',
  moderator: 'Moderatör',
  admin: 'Yönetici',
};

export const SANCTION_LABELS: Record<SanctionKind, string> = {
  suspend: 'Askı',
  ban: 'Yasak',
};

export const ANNOUNCEMENT_LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: 'Bilgi',
  warning: 'Uyarı',
  maintenance: 'Bakım',
};

/** Yönetim sekmeleri ve hangi rolün göreceği (sunucu kuralının ayna görüntüsü — kapı DEĞİL). */
export const ADMIN_ONLY_TABS = ['races', 'transactions', 'audit', 'announcements'] as const;

export function roleOf(player: { isAdmin: boolean; isModerator: boolean } | null): AssignableRole {
  if (player?.isAdmin) return 'admin';
  if (player?.isModerator) return 'moderator';
  return 'player';
}

export function canSeeTab(role: AssignableRole, tab: string): boolean {
  if (role === 'admin') return true;
  if (role === 'moderator') return !(ADMIN_ONLY_TABS as readonly string[]).includes(tab);
  return false;
}
