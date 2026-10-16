import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerRelationshipView, RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import {
  describePresence,
  profileFriendAction,
  searchResultAction,
} from '../../../src/features/social/presence';
import { invitableRaces } from '../../../src/features/social/race-invite';

const SRC = join(__dirname, '../../../src');

describe('sosyal brief §3 — çevrimiçi etiketi, arama ve profil düğmeleri (16.10.2026)', () => {
  const now = new Date('2026-10-16T12:00:00.000Z');

  it('çevrimiçi / gizli / son görülme metni', () => {
    expect(describePresence({ state: 'online', lastSeenAt: now.toISOString() }, now)).toEqual({ label: 'Çevrimiçi', tone: 'online' });
    expect(describePresence({ state: 'hidden', lastSeenAt: null }, now).label).toBe('Durum gizli');
    expect(describePresence({ state: 'offline', lastSeenAt: null }, now).label).toBe('Çevrimdışı');
    expect(describePresence({ state: 'offline', lastSeenAt: '2026-10-16T11:55:00.000Z' }, now).label).toBe('Son görülme 5 dk önce');
    expect(describePresence({ state: 'offline', lastSeenAt: '2026-10-16T09:00:00.000Z' }, now).label).toBe('Son görülme 3 sa önce');
    expect(describePresence({ state: 'offline', lastSeenAt: '2026-10-13T12:00:00.000Z' }, now).label).toBe('Son görülme 3 gün önce');
  });

  it('arama satırında yalnızca ilişkisi olmayana "Arkadaş Ekle"', () => {
    expect(searchResultAction('none').canRequest).toBe(true);
    for (const relation of ['self', 'friend', 'outgoing', 'incoming'] as const) {
      expect(searchResultAction(relation).canRequest).toBe(false);
    }
  });

  it('profil düğmesi ilişkiden türetilir; birlikte yarışmayan çifte "Arkadaş Ekle" pasif', () => {
    const base: PlayerRelationshipView = {
      playerId: 'x',
      status: 'none',
      requestId: null,
      canSendFriendRequest: true,
      friendRequestBlockedReason: null,
      presence: null,
    };
    expect(profileFriendAction(base)).toBe('add');
    expect(profileFriendAction({ ...base, canSendFriendRequest: false, friendRequestBlockedReason: 'needs_shared_race' })).toBe('needs_race');
    expect(profileFriendAction({ ...base, status: 'incoming', requestId: 'r' })).toBe('accept');
    expect(profileFriendAction({ ...base, status: 'outgoing' })).toBe('pending');
    expect(profileFriendAction({ ...base, status: 'friend' })).toBe('friend');
    expect(profileFriendAction({ ...base, status: 'blocked' })).toBe('blocked');
    expect(profileFriendAction({ ...base, status: 'self' })).toBe('self');
  });

  it('yarış daveti: yalnızca açık ve başlamamış yarışlar, katıldıkların önce', () => {
    const race = (id: string, startTime: string, status: string, mine: boolean) =>
      ({ id, startTime, status, myEntry: mine ? { status: 'waiting', horseId: 'h' } : null }) as unknown as RaceLobbyListItem;
    const list = invitableRaces(
      [
        race('started', '2026-10-16T11:00:00.000Z', 'scheduled', true),
        race('locked', '2026-10-16T13:00:00.000Z', 'locking', true),
        race('later', '2026-10-16T14:00:00.000Z', 'scheduled', false),
        race('mine', '2026-10-16T15:00:00.000Z', 'scheduled', true),
        race('soon', '2026-10-16T12:30:00.000Z', 'scheduled', false),
      ],
      now,
    );
    expect(list.map((entry) => entry.id)).toEqual(['mine', 'soon', 'later']);
  });

  it('ekranlar bağlı: arkadaş sayfası arama + gizlilik + çevrimiçi + davet, profil ilişki düğmeleri, üst bar nabız', () => {
    const friends = readFileSync(join(SRC, 'app/friends/page.tsx'), 'utf8');
    expect(friends).toContain('<PlayerSearchPanel');
    expect(friends).toContain('<OnlineStatusToggle');
    expect(friends).toContain('<PresenceBadge');
    expect(friends).toContain('<RaceInvitePicker');
    expect(readFileSync(join(SRC, 'app/profile/[username]/page.tsx'), 'utf8')).toContain('<ProfileFriendActions');
    expect(readFileSync(join(SRC, 'components/layout/TopBar.tsx'), 'utf8')).toContain('usePresenceHeartbeat(player !== null)');
  });
});
