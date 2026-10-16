'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL, apiClient, getAuthToken } from '../../lib/api-client';
import { connectNotificationSocket } from './notification-socket';

/**
 * 16.10.2026 — okunmamış bildirim sayısı: oturum açılınca ve sayfa değişince
 * sunucudan okunur; `notification.created` gelince (canlı akış, migration
 * 0088) yeniden okunur. Soket best-effort'tur: bağlanamazsa sayı sayfa
 * değişiminde yine tazelenir. Hata rozeti bozmaz (0 kalır).
 */
export function useUnreadNotifications(playerId: string | null, pathname: string): number {
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (playerId === null) {
      setUnread(0);
      return;
    }
    let active = true;
    apiClient
      .getNotifications(playerId)
      .then((result) => {
        if (active) setUnread(result.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [playerId, pathname, tick]);

  useEffect(() => {
    const token = playerId === null ? null : getAuthToken();
    if (token === null) return;
    const socket = connectNotificationSocket(API_BASE_URL, token, {
      onNotification: () => setTick((value) => value + 1),
      onRaceInvite: () => undefined,
      onRaceInviteResponded: () => undefined,
      onConnectError: () => undefined,
    });
    return () => {
      socket.disconnect();
    };
  }, [playerId]);

  return unread;
}
