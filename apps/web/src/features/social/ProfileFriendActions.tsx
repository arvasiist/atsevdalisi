'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { PlayerRelationshipView } from '@at-sevdalisi/shared-types';
import { ApiError, apiClient } from '../../lib/api-client';
import { PresenceBadge } from './PresenceBadge';
import { RaceInvitePicker } from './RaceInvitePicker';
import { NEEDS_SHARED_RACE_HINT, profileFriendAction } from './presence';

/**
 * 16.10.2026 — sosyal brief §3: profilde "Arkadaş Ekle" (ve ilişkiye göre
 * Kabul Et / Çip Hediye Et / Yarışa Davet). Durum sunucudan
 * (`GET /players/:id/relationship/:otherId`); kararlar yine sunucuda.
 */
export function ProfileFriendActions({
  playerId,
  otherId,
  otherName,
}: {
  playerId: string;
  otherId: string;
  otherName: string;
}): React.ReactElement | null {
  const [relationship, setRelationship] = useState<PlayerRelationshipView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setRelationship(await apiClient.getRelationship(playerId, otherId));
  }, [playerId, otherId]);

  useEffect(() => {
    load().catch(() => setRelationship(null));
  }, [load]);

  if (relationship === null) return null;
  const action = profileFriendAction(relationship);
  if (action === 'self') return null;

  const run = async (work: () => Promise<unknown>, ok: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage({ tone: 'ok', text: ok });
      await load();
    } catch (err) {
      const text =
        err instanceof ApiError && err.code === 'FRIENDSHIP_REQUIRES_SHARED_RACE'
          ? NEEDS_SHARED_RACE_HINT
          : err instanceof Error
            ? err.message
            : 'İşlem başarısız.';
      setMessage({ tone: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-friend-actions" data-testid="profile-friend-actions" data-action={action}>
      {action === 'add' ? (
        <button
          type="button"
          className="btn-gold"
          disabled={busy}
          onClick={() => void run(() => apiClient.sendFriendRequest(playerId, otherId), 'Arkadaşlık isteği gönderildi.')}
        >
          Arkadaş Ekle
        </button>
      ) : null}
      {action === 'needs_race' ? (
        <>
          <button type="button" className="btn-outline" disabled>
            Arkadaş Ekle
          </button>
          <span className="friend-gift-hint">{NEEDS_SHARED_RACE_HINT}</span>
        </>
      ) : null}
      {action === 'pending' ? <span className="friend-gift-hint">Arkadaşlık isteğin bekliyor.</span> : null}
      {action === 'accept' && relationship.requestId !== null ? (
        <>
          <button
            type="button"
            className="btn-gold"
            disabled={busy}
            onClick={() =>
              void run(
                () => apiClient.respondFriendRequest(playerId, relationship.requestId as string, 'accept'),
                `${otherName} artık arkadaşın.`,
              )
            }
          >
            İsteği Kabul Et
          </button>
          <button
            type="button"
            className="btn-outline"
            disabled={busy}
            onClick={() =>
              void run(() => apiClient.respondFriendRequest(playerId, relationship.requestId as string, 'reject'), 'İstek reddedildi.')
            }
          >
            Reddet
          </button>
        </>
      ) : null}
      {action === 'friend' ? (
        <>
          {relationship.presence ? <PresenceBadge presence={relationship.presence} now={new Date()} /> : null}
          <Link href={`/friends?gift=${otherId}`} className="btn-gold">
            Çip Hediye Et
          </Link>
          <RaceInvitePicker playerId={playerId} friendId={otherId} friendName={otherName} />
        </>
      ) : null}
      {action === 'blocked' ? <span className="friend-gift-hint">Aranızda engel var; arkadaşlık işlemleri kapalı.</span> : null}
      {message ? (
        <p className={message.tone === 'ok' ? 'friend-gift-notice' : 'friend-gift-error'} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
