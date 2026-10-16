import { loadSocialConfig } from '@at-sevdalisi/game-config';
import type { PlayerRelationshipView, PlayerSearchResultView, PresenceView } from '@at-sevdalisi/shared-types';

/**
 * 16.10.2026 — sosyal brief §3: çevrimiçi durumu, arama ve profil ilişkisi
 * için ekran metinleri (saf, DOM'suz test). Kararlar sunucudadır.
 */
const SOCIAL = loadSocialConfig();

export const PRESENCE_HEARTBEAT_MS = SOCIAL.presence.heartbeatSeconds * 1000;
export const PLAYER_SEARCH_MIN_LENGTH = SOCIAL.playerSearch.minQueryLength;

export type PresenceTone = 'online' | 'offline' | 'hidden';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function describePresence(presence: PresenceView, now: Date): { label: string; tone: PresenceTone } {
  if (presence.state === 'online') return { label: 'Çevrimiçi', tone: 'online' };
  if (presence.state === 'hidden') return { label: 'Durum gizli', tone: 'hidden' };
  if (presence.lastSeenAt === null) return { label: 'Çevrimdışı', tone: 'offline' };
  const ago = Math.max(0, now.getTime() - Date.parse(presence.lastSeenAt));
  if (ago < HOUR_MS) return { label: `Son görülme ${Math.max(1, Math.floor(ago / MINUTE_MS))} dk önce`, tone: 'offline' };
  if (ago < DAY_MS) return { label: `Son görülme ${Math.floor(ago / HOUR_MS)} sa önce`, tone: 'offline' };
  return { label: `Son görülme ${Math.floor(ago / DAY_MS)} gün önce`, tone: 'offline' };
}

/** Arama satırının düğmesi: yalnızca `none`da "Arkadaş Ekle" (sunucu yine de birlikte yarışı sorar). */
export function searchResultAction(relation: PlayerSearchResultView['relation']): { canRequest: boolean; label: string } {
  switch (relation) {
    case 'none':
      return { canRequest: true, label: 'Arkadaş Ekle' };
    case 'outgoing':
      return { canRequest: false, label: 'İstek gönderildi' };
    case 'incoming':
      return { canRequest: false, label: 'Sana istek gönderdi — İstekler bölümünden yanıtla' };
    case 'friend':
      return { canRequest: false, label: 'Arkadaşın' };
    case 'self':
      return { canRequest: false, label: 'Bu sensin' };
  }
}

export type ProfileFriendAction = 'add' | 'accept' | 'pending' | 'friend' | 'blocked' | 'needs_race' | 'self';

/** Profil düğmesi ilişkiden TÜRETİLİR — `canSendFriendRequest` sunucunun kapısının önceden söylenişidir. */
export function profileFriendAction(relationship: PlayerRelationshipView): ProfileFriendAction {
  switch (relationship.status) {
    case 'self':
      return 'self';
    case 'friend':
      return 'friend';
    case 'outgoing':
      return 'pending';
    case 'incoming':
      return 'accept';
    case 'blocked':
      return 'blocked';
    case 'none':
      return relationship.canSendFriendRequest ? 'add' : 'needs_race';
  }
}

export const NEEDS_SHARED_RACE_HINT =
  'Arkadaşlık birlikte yarış koşmuş oyuncular arasında kurulur (davet bağlantısıyla gelen arkadaşın hariç). Önce aynı yarışa katılın.';
